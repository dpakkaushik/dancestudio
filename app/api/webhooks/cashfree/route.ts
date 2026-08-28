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
 *  PAYMENT_USER_DROPPED_WEBHOOK, REFUND_STATUS_WEBHOOK. */

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
  };
}

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
    }

    await markWebhookProcessed(admin, eventId);
    return NextResponse.json({ status: "ok", result });
  } catch (error: unknown) {
    // non-2xx → Cashfree retries; the ledger + idempotent RPCs make that safe
    console.error("cashfree webhook failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
