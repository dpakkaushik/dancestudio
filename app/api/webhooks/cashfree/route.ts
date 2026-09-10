import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isCashfreeConfigured, refundCashfreePayment, rupeesToPaise } from "@/lib/cashfree/api";
import { cashfreeEventId, verifyCashfreeWebhook } from "@/lib/cashfree/signature";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  applyCapturedPayment,
  applyFailedPayment,
  applyRefundUpdate,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@/repositories/payments";
import { applySubscriptionEvent } from "@/repositories/subscriptions";

/** Cashfree webhook — the authority on payment state (build plan: all
 *  payment-affecting changes ride verified webhooks; the checkout confirmation
 *  is a server-verified fast path onto the same idempotent RPCs).
 *
 *  Safety order: verify the raw-body HMAC first (401 on mismatch), then the
 *  exactly-once ledger (a redelivery that already finished is a 200 no-op),
 *  then the apply_* RPCs — which are idempotent again on the provider's
 *  payment / refund id, so even a crash between ledger and RPC re-runs safely.
 *
 *  Events (Cashfree PG): PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK,
 *  PAYMENT_USER_DROPPED_WEBHOOK, REFUND_STATUS_WEBHOOK.
 *  Events (Cashfree Subscriptions, since 10 Sep 2026): every SUBSCRIPTION_*
 *  type lands on one applier that maps the provider's words onto our small
 *  status machine — an authorisation pays the first period and puts a studio on
 *  Discover, a charge buys the next period, a failure is three days of grace, a
 *  cancellation keeps what was paid for. The same secret signs both families.
 *
 *  ⚠ TWO PAYLOAD SHAPES, learned from a real delivery (10 Sep 2026): a payment
 *  or authorisation event carries the subscription's identity at the TOP of
 *  `data` (`data.subscription_id`, `data.cf_subscription_id`), while
 *  SUBSCRIPTION_STATUS_CHANGED nests it under `data.subscription_details`.
 *  Reading only the nested shape left an authorised, PAID mandate at
 *  `pending_auth` — money in and nothing granted — and answered 400, so the
 *  ledger row's null `processed_at` was the only trace. Read both. */

interface CfWebhookBody {
  type?: string;
  event_time?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number };
    payment?: {
      cf_payment_id?: number | string;
      payment_status?: string;
      payment_amount?: number;
      payment_group?: string | null;
    };
    refund?: {
      cf_refund_id?: number | string;
      refund_id?: string;
      order_id?: string;
      cf_payment_id?: number | string;
      refund_status?: string;
      refund_amount?: number;
    };
    /* the Subscriptions family. Cashfree sends TWO shapes: a payment or
       authorisation event carries the subscription's identity at the top of
       `data`, while SUBSCRIPTION_STATUS_CHANGED nests it under
       `subscription_details`. Both are read below (10 Sep 2026 — a real
       delivery is what showed it). */
    subscription_details?: {
      cf_subscription_id?: number | string;
      subscription_id?: string;
      subscription_status?: string;
      next_schedule_date?: string | null;
    };
    subscription_id?: string;
    cf_subscription_id?: number | string;
    subscription_status?: string;
    next_schedule_date?: string | null;
    payment_id?: string;
    cf_payment_id?: number | string;
    payment_type?: string;
    payment_amount?: number;
    payment_status?: string;
    failure_details?: { failure_reason?: string | null };
    authorization_details?: {
      authorization_amount?: number;
      authorization_status?: string | null;
      payment_group?: string | null;
      /* "upi" / "card" on a real authorisation — there is no payment_group there */
      payment_method?: string | null;
      instrument_id?: string | null;
    };
  };
}

const dateOnly = (iso: string | null | undefined): string | null => (iso && iso.length >= 10 ? iso.slice(0, 10) : null);

export async function POST(req: Request) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!verifyCashfreeWebhook(rawBody, timestamp, req.headers.get("x-webhook-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: CfWebhookBody;
  try {
    body = JSON.parse(rawBody) as CfWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const eventType = body.type ?? "unknown";
  const eventId = cashfreeEventId(rawBody, timestamp ?? "");

  try {
    const admin = createSupabaseAdminClient();
    const state = await recordWebhookEvent(admin, { eventId, eventType, payload: body });
    if (state === "processed") {
      return NextResponse.json({ status: "already processed" });
    }

    let result: unknown = { outcome: "ignored" };
    if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
      const o = body.data?.order;
      const p = body.data?.payment;
      if (!o?.order_id || p?.cf_payment_id === undefined || typeof p.payment_amount !== "number") {
        return NextResponse.json({ error: "malformed payment entity" }, { status: 400 });
      }
      const applied = await applyCapturedPayment(admin, {
        providerOrderId: o.order_id,
        providerPaymentId: String(p.cf_payment_id),
        amountPaise: rupeesToPaise(p.payment_amount),
        method: p.payment_group ?? null,
      });
      // seat could not be granted (filled up / closed order / wrong amount) —
      // push the money back; the ledgered 'pending' row survives an API failure
      if (applied.outcome === "refund_pending" && applied.refund_id && isCashfreeConfigured()) {
        try {
          await refundCashfreePayment({ providerOrderId: o.order_id, refundId: applied.refund_id, amountInr: Math.round(p.payment_amount), note: "Seat could not be granted" });
        } catch {
          // refund row stays pending — visible in the ledger
        }
      }
      result = applied;
      revalidatePath("/classes");
      revalidatePath("/my-classes");
      revalidatePath("/");
      revalidatePath("/c/[slug]", "page");
    } else if (eventType === "PAYMENT_FAILED_WEBHOOK" || eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
      const o = body.data?.order;
      const p = body.data?.payment;
      if (!o?.order_id || p?.cf_payment_id === undefined) {
        return NextResponse.json({ error: "malformed payment entity" }, { status: 400 });
      }
      await applyFailedPayment(admin, { providerOrderId: o.order_id, providerPaymentId: String(p.cf_payment_id) });
      result = { outcome: "recorded" };
    } else if (eventType === "REFUND_STATUS_WEBHOOK") {
      const r = body.data?.refund;
      if (r?.cf_refund_id === undefined || r.cf_payment_id === undefined || typeof r.refund_amount !== "number") {
        return NextResponse.json({ error: "malformed refund entity" }, { status: 400 });
      }
      // only terminal states move the ledger; PENDING / ONHOLD are acknowledged and waited out
      if (r.refund_status === "SUCCESS" || r.refund_status === "CANCELLED") {
        await applyRefundUpdate(admin, {
          providerPaymentId: String(r.cf_payment_id),
          providerRefundId: String(r.cf_refund_id),
          amountPaise: rupeesToPaise(r.refund_amount),
          succeeded: r.refund_status === "SUCCESS",
        });
        result = { outcome: r.refund_status === "SUCCESS" ? "refund.processed" : "refund.failed" };
      } else {
        result = { outcome: "waiting", refund_status: r.refund_status };
      }
    } else if (eventType.startsWith("SUBSCRIPTION_")) {
      const d = body.data ?? {};
      /* EITHER shape: a payment / authorisation event carries the identity at
         the top of `data`, STATUS_CHANGED nests it. Reading only the nested one
         is what left a paid, ACTIVE mandate stuck at pending_auth. */
      const sd = d.subscription_details;
      const providerSubscriptionId = sd?.subscription_id ?? d.subscription_id ?? null;
      const rawCfId = sd?.cf_subscription_id ?? d.cf_subscription_id;
      const cfSubscriptionId = rawCfId === undefined || rawCfId === null ? null : String(rawCfId);
      if (!providerSubscriptionId && !cfSubscriptionId) {
        return NextResponse.json({ error: "malformed subscription entity" }, { status: 400 });
      }
      const auth = d.authorization_details;
      const amount = typeof d.payment_amount === "number" ? d.payment_amount : typeof auth?.authorization_amount === "number" ? auth.authorization_amount : null;
      const applied = await applySubscriptionEvent(admin, {
        type: eventType,
        providerSubscriptionId,
        cfSubscriptionId,
        providerStatus: sd?.subscription_status ?? d.subscription_status ?? null,
        authStatus: auth?.authorization_status ?? null,
        paymentId: d.payment_id ?? null,
        cfPaymentId: d.cf_payment_id === undefined ? null : String(d.cf_payment_id),
        paymentType: d.payment_type ?? null,
        paymentStatus: d.payment_status ?? null,
        amountPaise: amount === null ? null : rupeesToPaise(amount),
        /* a real UPI AutoPay authorisation carries payment_method, not payment_group */
        method: auth?.payment_group ?? auth?.payment_method ?? null,
        failureReason: d.failure_details?.failure_reason ?? null,
        nextScheduleDate: dateOnly(sd?.next_schedule_date ?? d.next_schedule_date),
      });
      result = applied;
      revalidatePath("/");
      revalidatePath("/business");
      revalidatePath("/subscription");
      revalidatePath("/profile");
      revalidatePath("/discover");
    }

    await markWebhookProcessed(admin, eventId);
    return NextResponse.json({ status: "ok", result });
  } catch (error: unknown) {
    // non-2xx → Cashfree retries; the ledger + idempotent RPCs make that safe
    console.error("cashfree webhook failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
