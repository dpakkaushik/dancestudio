"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  cashfreeMode,
  createCashfreeOrder,
  fetchCashfreeOrderPayments,
  isCashfreeConfigured,
  refundCashfreePayment,
  rupeesToPaise,
} from "@/lib/cashfree/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookEvent } from "@/repositories/events";
import {
  applyCapturedPayment,
  applyFailedPayment,
  attachProviderOrder,
  attachProviderRefund,
  cancelBooking,
  createEventPaymentOrder,
  createMembershipPaymentOrder,
  createPaymentOrder,
  findMyOrder,
} from "@/repositories/payments";
import { findProfileById } from "@/repositories/profiles";
import type { EntryFormat } from "@/types/event";
import type { CheckoutPayload, PaymentOrder } from "@/types/payment";

/** Step 9 money actions on the Cashfree rail (swapped 28 Aug 2026). The flow:
 *  startCheckoutAction makes our order + the Cashfree order (amount always from
 *  the database, never the client) and hands the browser a payment session;
 *  the browser pays in Cashfree's checkout modal; confirmCheckoutAction asks
 *  Cashfree what actually happened on that order — never the browser — and
 *  applies it via the same idempotent RPC the webhook uses. Whichever lands
 *  first wins, the other becomes a no-op. */

const NOT_CONFIGURED =
  "Payments aren't switched on for this deployment yet — ask the studio to book you in.";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

function revalidateBookingSurfaces() {
  revalidatePath("/classes");
  revalidatePath("/my-classes");
  revalidatePath("/discover");
  revalidatePath("/");
  revalidatePath("/c/[slug]", "page");
  /* an event's page and its register move too (17 Sep 2026) */
  revalidatePath("/e/[slug]", "page");
  revalidatePath("/business/[tenantId]/events/[eventId]", "page");
}

/** Cashfree requires a customer phone on every order. Accounts that signed in
 *  by phone have one (Supabase stores it as 91XXXXXXXXXX); email accounts do
 *  not until profiles carry a mobile (Step 26), so the rail gets a placeholder
 *  it accepts and the receipt stays keyed on OUR user id, never on this. */
const customerPhoneOf = (authPhone: string | null | undefined): string => {
  const digits = (authPhone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return "9999999999";
};

const startSchema = z.object({
  sessionId: z.string().uuid(),
  // display-only strings for the checkout modal — money comes from the DB
  businessName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(120),
});

export interface StartCheckoutResult {
  checkout: CheckoutPayload | null;
  error: string | null;
}

export async function startCheckoutAction(input: {
  sessionId: string;
  businessName: string;
  description: string;
}): Promise<StartCheckoutResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { checkout: null, error: "Invalid booking request" };
  }
  const { supabase, user } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { checkout: null, error: NOT_CONFIGURED };
  }
  try {
    const order = await createPaymentOrder(supabase, parsed.data.sessionId);
    return { checkout: await openRail(supabase, user, order, parsed.data.businessName, parsed.data.description), error: null };
  } catch (error: unknown) {
    return {
      checkout: null,
      error: error instanceof Error ? error.message : "Could not start the payment",
    };
  }
}

/** OUR order exists; now the Cashfree order against it, bound to ours before
 *  the window opens. One path for a class seat and an event ticket — the rail
 *  does not care what the seat is for, and the tags say which it was. */
async function openRail(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  user: Awaited<ReturnType<typeof requireUser>>["user"],
  order: PaymentOrder,
  businessName: string,
  description: string
): Promise<CheckoutPayload> {
  const profile = await findProfileById(supabase, user.id);
  const tags: Record<string, string> = { order_id: order.id, business_id: order.tenantId };
  if (order.classId) tags.class_id = order.classId;
  if (order.sessionId) tags.session_id = order.sessionId;
  if (order.eventId) tags.event_id = order.eventId;
  if (order.eventBookingId) tags.event_booking_id = order.eventBookingId;
  if (order.membershipId) tags.membership_id = order.membershipId;
  if (order.membershipPassId) tags.membership_pass_id = order.membershipPassId;
  const cfOrder = await createCashfreeOrder({
    orderId: order.id,
    amountInr: order.amountInr,
    customer: { id: user.id, phone: customerPhoneOf(user.phone), name: profile?.fullName ?? null, email: user.email ?? null },
    note: `${businessName} · ${description}`,
    tags,
  });
  await attachProviderOrder(supabase, order.id, cfOrder.order_id);
  return {
    orderId: order.id,
    providerOrderId: cfOrder.order_id,
    paymentSessionId: cfOrder.payment_session_id,
    mode: cashfreeMode(),
    amountInr: order.amountInr,
    businessName,
    description,
  };
}

const startMembershipSchema = z.object({
  passId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(120),
});

/** A PRICED MEMBERSHIP (19 Sep 2026): `buy_membership` writes the pass as
 *  `pending_payment` — it holds no units — then the order opens against it and
 *  the Cashfree window opens. The capture (webhook or `confirmCheckoutAction`)
 *  is what makes the pass active, re-checking the cap under the membership's
 *  lock. One rail, three subjects; the seller's earnings need no new read. */
export async function startMembershipCheckoutAction(input: { passId: string; businessName: string; description: string }): Promise<StartCheckoutResult> {
  const parsed = startMembershipSchema.safeParse(input);
  if (!parsed.success) {
    return { checkout: null, error: "Invalid membership request" };
  }
  const { supabase, user } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { checkout: null, error: NOT_CONFIGURED };
  }
  try {
    const order = await createMembershipPaymentOrder(supabase, parsed.data.passId);
    const checkout = await openRail(supabase, user, order, parsed.data.businessName, parsed.data.description);
    revalidatePath("/memberships");
    return { checkout, error: null };
  } catch (error: unknown) {
    return { checkout: null, error: error instanceof Error ? error.message : "Could not start the payment" };
  }
}

const startEventSchema = z.object({
  eventId: z.string().uuid(),
  kind: z.enum(["spectator", "participant"]),
  ticketTierId: z.string().uuid().nullable().optional(),
  qty: z.number().int().min(1).max(20).optional(),
  format: z.enum(["solo", "duo", "crew"]).nullable().optional(),
  crewId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  // display-only strings for the checkout modal — money comes from the DB
  businessName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(120),
});

/** A PRICED ticket or entry (17 Sep 2026): `book_event` writes the booking as
 *  `pending_payment` — it holds no seat — then the order opens against it and
 *  the Cashfree window opens. The capture (webhook or `confirmCheckoutAction`)
 *  is what books the seat, re-checking the tier under the event lock. */
export async function startEventCheckoutAction(input: {
  eventId: string;
  kind: "spectator" | "participant";
  ticketTierId?: string | null;
  qty?: number;
  format?: EntryFormat | null;
  crewId?: string | null;
  partnerId?: string | null;
  businessName: string;
  description: string;
}): Promise<StartCheckoutResult> {
  const parsed = startEventSchema.safeParse(input);
  if (!parsed.success) {
    return { checkout: null, error: "Invalid booking request" };
  }
  const { supabase, user } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { checkout: null, error: NOT_CONFIGURED };
  }
  try {
    const booking = await bookEvent(supabase, {
      eventId: parsed.data.eventId,
      kind: parsed.data.kind,
      ticketTierId: parsed.data.ticketTierId ?? null,
      qty: parsed.data.qty ?? 1,
      format: parsed.data.format ?? null,
      crewId: parsed.data.crewId ?? null,
      partnerId: parsed.data.partnerId ?? null,
    });
    if (booking.status !== "pending_payment") {
      // the database found nothing to pay for (a free tier) and booked it outright
      return { checkout: null, error: "Nothing to pay — that booking is free and is already confirmed" };
    }
    const order = await createEventPaymentOrder(supabase, booking.id);
    return { checkout: await openRail(supabase, user, order, parsed.data.businessName, parsed.data.description), error: null };
  } catch (error: unknown) {
    return {
      checkout: null,
      error: error instanceof Error ? error.message : "Could not start the payment",
    };
  }
}

const confirmSchema = z.object({ orderId: z.string().uuid() });

export interface ConfirmCheckoutResult {
  outcome: "booked" | "processing" | "refund_pending" | null;
  error: string | null;
}

/** After the checkout modal closes: what did Cashfree record on OUR order? The
 *  browser tells us nothing we trust — the payments list comes from Cashfree. */
export async function confirmCheckoutAction(input: { orderId: string }): Promise<ConfirmCheckoutResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { outcome: null, error: "Invalid payment response" };
  }
  const { supabase, user } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { outcome: null, error: NOT_CONFIGURED };
  }
  try {
    const order = await findMyOrder(supabase, parsed.data.orderId, user.id);
    if (!order?.providerOrderId) {
      return { outcome: null, error: "That payment could not be matched to a booking" };
    }
    const attempts = await fetchCashfreeOrderPayments(order.providerOrderId);
    const success = attempts.find((p) => p.payment_status === "SUCCESS");
    if (!success) {
      if (attempts.some((p) => p.payment_status === "PENDING")) {
        // a UPI collect still waiting on the bank — the webhook settles it shortly
        return { outcome: "processing", error: null };
      }
      const failed = attempts.find((p) => p.payment_status === "FAILED" || p.payment_status === "USER_DROPPED");
      if (failed) {
        const admin = createSupabaseAdminClient();
        await applyFailedPayment(admin, { providerOrderId: order.providerOrderId, providerPaymentId: String(failed.cf_payment_id) });
        return { outcome: null, error: "The payment didn't go through — nothing was charged. Try again." };
      }
      return { outcome: null, error: "No payment was made" };
    }

    const admin = createSupabaseAdminClient();
    const applied = await applyCapturedPayment(admin, {
      providerOrderId: order.providerOrderId,
      providerPaymentId: String(success.cf_payment_id),
      amountPaise: rupeesToPaise(success.payment_amount),
      method: success.payment_group ?? null,
    });
    revalidateBookingSurfaces();

    if (applied.outcome === "enrolled") {
      return { outcome: "booked", error: null };
    }
    if (applied.outcome === "duplicate") {
      return applied.order_status === "paid"
        ? { outcome: "booked", error: null }
        : { outcome: "refund_pending", error: null };
    }
    if (applied.outcome === "refund_pending") {
      // the seat could not be granted — send the money straight back
      if (applied.refund_id) {
        try {
          const refund = await refundCashfreePayment({
            providerOrderId: order.providerOrderId,
            refundId: applied.refund_id,
            amountInr: Math.round(success.payment_amount),
            note: "Seat could not be granted",
          });
          await attachProviderRefund(supabase, applied.refund_id, String(refund.cf_refund_id));
        } catch {
          // the refund row stays 'pending' — the ledger keeps it visible
        }
      }
      return { outcome: "refund_pending", error: null };
    }
    return { outcome: null, error: "That payment could not be matched to a booking" };
  } catch (error: unknown) {
    return {
      outcome: null,
      error: error instanceof Error ? error.message : "Could not confirm the payment",
    };
  }
}

const cancelSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export interface CancelBookingResult {
  message: string | null;
  error: string | null;
}

/** RefundSheet's cancel: seat back now, money by the 48 h window. */
export async function cancelBookingAction(input: {
  enrollmentId: string;
  reason: string;
}): Promise<CancelBookingResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { message: null, error: "Invalid cancel request" };
  }
  const { supabase } = await requireUser();
  try {
    const refund = await cancelBooking(supabase, parsed.data.enrollmentId, parsed.data.reason);
    revalidateBookingSurfaces();
    if (!refund) {
      return { message: "Cancelled — the seat is back on sale", error: null };
    }
    if (refund.status === "requested") {
      return {
        message: "Cancelled — inside 48 h the studio decides the refund, and they've been asked",
        error: null,
      };
    }
    // full refund due — fire it now; a failed call leaves the ledgered row pending
    if (isCashfreeConfigured() && refund.provider === "cashfree" && refund.providerOrderId) {
      try {
        const cf = await refundCashfreePayment({
          providerOrderId: refund.providerOrderId,
          refundId: refund.id,
          amountInr: refund.amountInr,
          note: parsed.data.reason,
        });
        await attachProviderRefund(supabase, refund.id, String(cf.cf_refund_id));
        return {
          message: `Cancelled — your ₹${refund.amountInr.toLocaleString("en-IN")} refund is on its way`,
          error: null,
        };
      } catch {
        return { message: "Cancelled — your refund is queued", error: null };
      }
    }
    return { message: "Cancelled — your refund is queued", error: null };
  } catch (error: unknown) {
    return {
      message: null,
      error: error instanceof Error ? error.message : "Could not cancel",
    };
  }
}
