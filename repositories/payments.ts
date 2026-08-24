import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus, PaidReceipt, PaymentOrder, RefundOutcome } from "@/types/payment";

interface OrderRow {
  id: string;
  tenant_id: string;
  class_id: string;
  session_id: string;
  amount_inr: number;
  razorpay_order_id: string | null;
  status: OrderStatus;
}

/** Start a paid booking — the RPC validates session/price/capacity server-side. */
export async function createPaymentOrder(
  supabase: SupabaseClient,
  sessionId: string
): Promise<PaymentOrder> {
  const { data, error } = await supabase.rpc("create_payment_order", {
    p_session_id: sessionId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = data as OrderRow;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    classId: row.class_id,
    sessionId: row.session_id,
    amountInr: row.amount_inr,
    razorpayOrderId: row.razorpay_order_id,
    status: row.status,
  };
}

/** Bind the Razorpay order id to our order before checkout opens. */
export async function attachRazorpayOrder(
  supabase: SupabaseClient,
  orderId: string,
  razorpayOrderId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_razorpay_order", {
    p_order_id: orderId,
    p_razorpay_order_id: razorpayOrderId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Cancel a booking (seat now, refund by policy window). Returns the money side. */
export async function cancelBooking(
  supabase: SupabaseClient,
  enrollmentId: string,
  reason: string | null
): Promise<RefundOutcome | null> {
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_enrollment_id: enrollmentId,
    p_reason: reason,
  });
  if (error) {
    throw new Error(error.message);
  }
  const out = data as {
    refund: { id: string; status: RefundOutcome["status"]; amount_inr: number; razorpay_payment_id: string } | null;
  };
  if (!out.refund) {
    return null;
  }
  return {
    id: out.refund.id,
    status: out.refund.status,
    amountInr: out.refund.amount_inr,
    razorpayPaymentId: out.refund.razorpay_payment_id,
  };
}

/** Bind the Razorpay refund id after the refund API call succeeds. */
export async function attachRazorpayRefund(
  supabase: SupabaseClient,
  refundId: string,
  razorpayRefundId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_razorpay_refund", {
    p_refund_id: refundId,
    p_razorpay_refund_id: razorpayRefundId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

interface ReceiptRow {
  status: OrderStatus;
  payments: Array<{
    razorpay_payment_id: string;
    amount_inr: number;
    method: string | null;
    status: string;
    created_at: string;
  }>;
}

/** The captured payment behind a booking — RLS admits the payer and the tenant. */
export async function findPaidReceiptByEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<PaidReceipt | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("status, payments (razorpay_payment_id, amount_inr, method, status, created_at)")
    .eq("enrollment_id", enrollmentId)
    .in("status", ["paid", "refund_pending", "refunded"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`payments.receipt failed: ${error.message}`);
  }
  const order = (data as unknown as ReceiptRow[])[0];
  const paid = order?.payments.find((p) => p.status === "captured" || p.status === "refunded");
  if (!order || !paid) {
    return null;
  }
  return {
    amountInr: paid.amount_inr,
    method: paid.method,
    razorpayPaymentId: paid.razorpay_payment_id,
    paidAt: paid.created_at,
    orderStatus: order.status,
  };
}

// ── verified-event appliers — service-role client only ────────────────────────

export interface CaptureOutcome {
  outcome: "enrolled" | "duplicate" | "refund_pending" | "ignored";
  enrollment_id?: string;
  order_status?: OrderStatus;
  refund_id?: string;
  razorpay_payment_id?: string;
}

export async function applyCapturedPayment(
  admin: SupabaseClient,
  params: { razorpayOrderId: string; razorpayPaymentId: string; amountPaise: number; method: string | null }
): Promise<CaptureOutcome> {
  const { data, error } = await admin.rpc("apply_captured_payment", {
    p_razorpay_order_id: params.razorpayOrderId,
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_amount_paise: params.amountPaise,
    p_method: params.method,
  });
  if (error) {
    throw new Error(`apply_captured_payment failed: ${error.message}`);
  }
  return data as CaptureOutcome;
}

export async function applyFailedPayment(
  admin: SupabaseClient,
  params: { razorpayOrderId: string; razorpayPaymentId: string }
): Promise<void> {
  const { error } = await admin.rpc("apply_failed_payment", {
    p_razorpay_order_id: params.razorpayOrderId,
    p_razorpay_payment_id: params.razorpayPaymentId,
  });
  if (error) {
    throw new Error(`apply_failed_payment failed: ${error.message}`);
  }
}

export async function applyRefundUpdate(
  admin: SupabaseClient,
  params: { razorpayPaymentId: string; razorpayRefundId: string; amountPaise: number; succeeded: boolean }
): Promise<void> {
  const { error } = await admin.rpc("apply_refund_update", {
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_razorpay_refund_id: params.razorpayRefundId,
    p_amount_paise: params.amountPaise,
    p_succeeded: params.succeeded,
  });
  if (error) {
    throw new Error(`apply_refund_update failed: ${error.message}`);
  }
}

// ── webhook idempotency ledger ────────────────────────────────────────────────

export type WebhookEventState = "new" | "processed" | "received";

/** Record a delivery; "processed" means a completed earlier run already handled it. */
export async function recordWebhookEvent(
  admin: SupabaseClient,
  params: { eventId: string; eventType: string; payload: unknown }
): Promise<WebhookEventState> {
  const { data, error } = await admin
    .from("webhook_events")
    .upsert(
      { event_id: params.eventId, event_type: params.eventType, payload: params.payload },
      { onConflict: "event_id", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    throw new Error(`webhook_events.record failed: ${error.message}`);
  }
  if ((data ?? []).length > 0) {
    return "new";
  }
  const { data: existing, error: readError } = await admin
    .from("webhook_events")
    .select("processed_at")
    .eq("event_id", params.eventId)
    .single();
  if (readError) {
    throw new Error(`webhook_events.read failed: ${readError.message}`);
  }
  return existing.processed_at ? "processed" : "received";
}

export async function markWebhookProcessed(admin: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) {
    throw new Error(`webhook_events.mark failed: ${error.message}`);
  }
}
