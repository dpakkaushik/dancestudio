"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  isRazorpayConfigured,
  refundRazorpayPayment,
} from "@/lib/razorpay/api";
import { verifyCheckoutSignature } from "@/lib/razorpay/signature";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyCapturedPayment,
  attachRazorpayOrder,
  attachRazorpayRefund,
  cancelBooking,
  createPaymentOrder,
} from "@/repositories/payments";
import { findProfileById } from "@/repositories/profiles";
import type { CheckoutPayload } from "@/types/payment";

/** Step 9 money actions. The flow: startCheckoutAction makes our order + the
 *  Razorpay order (amount always from the database, never the client); the
 *  browser pays in Razorpay Checkout; confirmCheckoutAction verifies the
 *  handshake signature, fetches the payment FROM Razorpay, and applies it via
 *  the same idempotent RPC the webhook uses — whichever lands first wins,
 *  the other becomes a no-op. */

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
}

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
  if (!isRazorpayConfigured()) {
    return { checkout: null, error: NOT_CONFIGURED };
  }
  try {
    const order = await createPaymentOrder(supabase, parsed.data.sessionId);
    const rzpOrder = await createRazorpayOrder({
      amountPaise: order.amountInr * 100,
      receipt: order.id,
      notes: {
        order_id: order.id,
        tenant_id: order.tenantId,
        class_id: order.classId,
        session_id: order.sessionId,
      },
    });
    await attachRazorpayOrder(supabase, order.id, rzpOrder.id);
    const profile = await findProfileById(supabase, user.id);
    return {
      checkout: {
        orderId: order.id,
        razorpayOrderId: rzpOrder.id,
        amountPaise: order.amountInr * 100,
        currency: "INR",
        keyId: getRazorpayKeyId(),
        businessName: parsed.data.businessName,
        description: parsed.data.description,
        prefillName: profile?.fullName ?? null,
        prefillEmail: user.email ?? null,
      },
      error: null,
    };
  } catch (error: unknown) {
    return {
      checkout: null,
      error: error instanceof Error ? error.message : "Could not start the payment",
    };
  }
}

const RZP_ID = z.string().min(6).max(64).regex(/^[A-Za-z0-9_]+$/);
const confirmSchema = z.object({
  razorpayOrderId: RZP_ID,
  razorpayPaymentId: RZP_ID,
  razorpaySignature: z.string().min(16).max(256).regex(/^[a-f0-9]+$/i),
});

export interface ConfirmCheckoutResult {
  outcome: "booked" | "processing" | "refund_pending" | null;
  error: string | null;
}

export async function confirmCheckoutAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<ConfirmCheckoutResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { outcome: null, error: "Invalid payment response" };
  }
  const { supabase } = await requireUser();
  if (!isRazorpayConfigured()) {
    return { outcome: null, error: NOT_CONFIGURED };
  }
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  try {
    if (
      !verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, getRazorpayKeySecret())
    ) {
      return { outcome: null, error: "That payment could not be verified" };
    }
    // the authoritative record comes from Razorpay itself, never the browser
    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (payment.order_id !== razorpayOrderId) {
      return { outcome: null, error: "That payment could not be verified" };
    }
    if (payment.status !== "captured") {
      // authorized-but-not-captured settles via the webhook shortly
      return { outcome: "processing", error: null };
    }

    const admin = createSupabaseAdminClient();
    const applied = await applyCapturedPayment(admin, {
      razorpayOrderId,
      razorpayPaymentId,
      amountPaise: payment.amount,
      method: payment.method,
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
          const refund = await refundRazorpayPayment(razorpayPaymentId);
          await attachRazorpayRefund(supabase, applied.refund_id, refund.id);
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
    if (isRazorpayConfigured()) {
      try {
        const rzpRefund = await refundRazorpayPayment(refund.razorpayPaymentId);
        await attachRazorpayRefund(supabase, refund.id, rzpRefund.id);
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
