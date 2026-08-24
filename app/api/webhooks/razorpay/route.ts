import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { refundRazorpayPayment, isRazorpayConfigured } from "@/lib/razorpay/api";
import { hmacSha256Hex, verifyWebhookSignature } from "@/lib/razorpay/signature";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  applyCapturedPayment,
  applyFailedPayment,
  applyRefundUpdate,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@/repositories/payments";

/** Razorpay webhook — the authority on payment state (build plan: all
 *  payment-affecting changes ride verified webhooks; the checkout handshake is
 *  a server-verified fast path onto the same idempotent RPCs).
 *
 *  Safety order: verify the raw-body HMAC first (401 on mismatch), then the
 *  exactly-once ledger (a replayed x-razorpay-event-id that already finished is
 *  a 200 no-op), then the apply_* RPCs — which are idempotent again on
 *  razorpay_payment_id, so even a crash between ledger and RPC re-runs safely. */

interface RzpWebhookBody {
  event?: string;
  payload?: {
    payment?: {
      entity?: { id?: string; order_id?: string; amount?: number; method?: string | null };
    };
    refund?: {
      entity?: { id?: string; payment_id?: string; amount?: number };
    };
  };
}

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: RzpWebhookBody;
  try {
    body = JSON.parse(rawBody) as RzpWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const eventType = body.event ?? "unknown";
  // Razorpay stamps every delivery; the body-hash fallback keeps replays
  // idempotent even if the header ever goes missing
  const eventId =
    req.headers.get("x-razorpay-event-id") ?? `evt_body_${hmacSha256Hex(rawBody, secret).slice(0, 40)}`;

  try {
    const admin = createSupabaseAdminClient();
    const state = await recordWebhookEvent(admin, { eventId, eventType, payload: body });
    if (state === "processed") {
      return NextResponse.json({ status: "already processed" });
    }

    let result: unknown = { outcome: "ignored" };
    if (eventType === "payment.captured") {
      const p = body.payload?.payment?.entity;
      if (!p?.id || !p.order_id || typeof p.amount !== "number") {
        return NextResponse.json({ error: "malformed payment entity" }, { status: 400 });
      }
      const applied = await applyCapturedPayment(admin, {
        razorpayOrderId: p.order_id,
        razorpayPaymentId: p.id,
        amountPaise: p.amount,
        method: p.method ?? null,
      });
      // seat could not be granted (filled up / closed order) — push the money
      // back; the ledgered 'pending' row survives an API failure
      if (applied.outcome === "refund_pending" && isRazorpayConfigured()) {
        try {
          await refundRazorpayPayment(p.id);
        } catch {
          // refund row stays pending — visible in the ledger
        }
      }
      result = applied;
      revalidatePath("/classes");
      revalidatePath("/my-classes");
      revalidatePath("/");
      revalidatePath("/c/[slug]", "page");
    } else if (eventType === "payment.failed") {
      const p = body.payload?.payment?.entity;
      if (!p?.id || !p.order_id) {
        return NextResponse.json({ error: "malformed payment entity" }, { status: 400 });
      }
      await applyFailedPayment(admin, { razorpayOrderId: p.order_id, razorpayPaymentId: p.id });
      result = { outcome: "recorded" };
    } else if (eventType === "refund.processed" || eventType === "refund.failed") {
      const r = body.payload?.refund?.entity;
      if (!r?.id || !r.payment_id || typeof r.amount !== "number") {
        return NextResponse.json({ error: "malformed refund entity" }, { status: 400 });
      }
      await applyRefundUpdate(admin, {
        razorpayPaymentId: r.payment_id,
        razorpayRefundId: r.id,
        amountPaise: r.amount,
        succeeded: eventType === "refund.processed",
      });
      result = { outcome: eventType };
    }

    await markWebhookProcessed(admin, eventId);
    return NextResponse.json({ status: "ok", result });
  } catch (error: unknown) {
    // non-2xx → Razorpay retries; the ledger + idempotent RPCs make that safe
    console.error("razorpay webhook failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
