import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassMoney, OrderStatus, PaidReceipt, PaymentOrder, PaymentProvider, RefundOutcome } from "@/types/payment";

interface OrderRow {
  id: string;
  tenant_id: string;
  class_id: string;
  session_id: string;
  amount_inr: number;
  provider: PaymentProvider;
  provider_order_id: string | null;
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
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    status: row.status,
  };
}

/** One of the payer's own orders, for the checkout confirmation — says
 *  `user_id = me` out loud (RLS is a ceiling, not a scope). */
export async function findMyOrder(
  supabase: SupabaseClient,
  orderId: string,
  userId: string
): Promise<{ id: string; providerOrderId: string | null; provider: PaymentProvider; amountInr: number; status: OrderStatus } | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, provider, provider_order_id, amount_inr, status")
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`payments.findMyOrder failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as { id: string; provider: PaymentProvider; provider_order_id: string | null; amount_inr: number; status: OrderStatus };
  return { id: row.id, provider: row.provider, providerOrderId: row.provider_order_id, amountInr: row.amount_inr, status: row.status };
}

/** Bind the provider's order id to our order before checkout opens. */
export async function attachProviderOrder(
  supabase: SupabaseClient,
  orderId: string,
  providerOrderId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_provider_order", {
    p_order_id: orderId,
    p_provider_order_id: providerOrderId,
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
    refund: {
      id: string;
      status: RefundOutcome["status"];
      amount_inr: number;
      provider: PaymentProvider;
      provider_order_id: string | null;
      provider_payment_id: string;
    } | null;
  };
  if (!out.refund) {
    return null;
  }
  return {
    id: out.refund.id,
    status: out.refund.status,
    amountInr: out.refund.amount_inr,
    provider: out.refund.provider,
    providerOrderId: out.refund.provider_order_id,
    providerPaymentId: out.refund.provider_payment_id,
  };
}

/** Bind the provider's refund id after the refund API call succeeds (the payer's own row). */
export async function attachProviderRefund(
  supabase: SupabaseClient,
  refundId: string,
  providerRefundId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_provider_refund", {
    p_refund_id: refundId,
    p_provider_refund_id: providerRefundId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

interface ReceiptRow {
  status: OrderStatus;
  payments: Array<{
    provider_payment_id: string;
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
    .select("status, payments (provider_payment_id, amount_inr, method, status, created_at)")
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
    providerPaymentId: paid.provider_payment_id,
    paidAt: paid.created_at,
    orderStatus: order.status,
  };
}

/* A class's money is a handful of rows, not a feed; the cap is a runaway guard,
   not a page size — the card states one total, so a partial sum would be a wrong
   number rather than a short list. */
const MAX_MONEY_ROWS = 2000;

interface ClassMoneyRow {
  amount_inr: number;
  status: string;
}

/** What this class took and what is going back out (prototype S_class 12008-12042).
 *
 *  The prototype derives "Came in" as price x seats, because it has no payments to
 *  count. We do — so this sums what was actually captured, and a comped or unpaid
 *  seat cannot inflate what the class made. The rest is its own arithmetic.
 *
 *  Reads are plain RLS-shaped queries: Step 9 admits a tenant's members to its
 *  orders, payments and refunds, and the public to none. WHO SEES THE TAB is
 *  narrower still and decided by the page — the owner alone, matching the
 *  prototype's own `isMine` gate on the Earnings segment (11757). */
export async function findClassMoney(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassMoney> {
  const [paymentsRes, refundsRes] = await Promise.all([
    supabase
      .from("payments")
      /* payments carry no class_id — the join through orders is the same spine
         findRefundsByClass rides, and !inner makes it a filter, not an embed */
      .select("amount_inr, status, orders!inner (class_id)")
      .eq("orders.class_id", classId)
      /* a refunded payment still CAME IN; the refund is its own line below */
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .limit(MAX_MONEY_ROWS),
    supabase
      .from("refunds")
      .select("amount_inr, status, orders!inner (class_id)")
      .eq("orders.class_id", classId)
      .is("deleted_at", null)
      .limit(MAX_MONEY_ROWS),
  ]);

  for (const [what, res] of [
    ["payments", paymentsRes],
    ["refunds", refundsRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payments.findClassMoney(${what}) failed: ${res.error.message}`);
    }
  }

  const payments = (paymentsRes.data ?? []) as unknown as ClassMoneyRow[];
  const refunds = (refundsRes.data ?? []) as unknown as ClassMoneyRow[];
  const sum = (rows: ClassMoneyRow[]) => rows.reduce((a, r) => a + r.amount_inr, 0);

  return {
    collectedInr: sum(payments),
    refundedInr: sum(refunds.filter((r) => r.status === "processed")),
    owedInr: sum(refunds.filter((r) => r.status === "requested" || r.status === "pending")),
  };
}

// ── verified-event appliers — service-role client only ────────────────────────

export interface CaptureOutcome {
  outcome: "enrolled" | "duplicate" | "refund_pending" | "ignored";
  enrollment_id?: string;
  order_status?: OrderStatus;
  refund_id?: string;
  provider_payment_id?: string;
}

export async function applyCapturedPayment(
  admin: SupabaseClient,
  params: { providerOrderId: string; providerPaymentId: string; amountPaise: number; method: string | null }
): Promise<CaptureOutcome> {
  const { data, error } = await admin.rpc("apply_captured_payment", {
    p_provider_order_id: params.providerOrderId,
    p_provider_payment_id: params.providerPaymentId,
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
  params: { providerOrderId: string; providerPaymentId: string }
): Promise<void> {
  const { error } = await admin.rpc("apply_failed_payment", {
    p_provider_order_id: params.providerOrderId,
    p_provider_payment_id: params.providerPaymentId,
  });
  if (error) {
    throw new Error(`apply_failed_payment failed: ${error.message}`);
  }
}

export async function applyRefundUpdate(
  admin: SupabaseClient,
  params: { providerPaymentId: string; providerRefundId: string; amountPaise: number; succeeded: boolean }
): Promise<void> {
  const { error } = await admin.rpc("apply_refund_update", {
    p_provider_payment_id: params.providerPaymentId,
    p_provider_refund_id: params.providerRefundId,
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
