import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefundRequest, RefundStatus } from "@/types/refund";

/** The refund queue for one class. RLS already admits the studio's members to
 *  their tenant's refunds (Step 9) and the learner to their own; WHO MAY SETTLE
 *  is narrower than who may read, and that is decided in the RPCs by
 *  can_settle_refunds_for_class. */

interface RefundRow {
  id: string;
  user_id: string;
  amount_inr: number;
  reason: string | null;
  status: RefundStatus;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  settled_offline: boolean;
  razorpay_refund_id: string | null;
  profiles: { full_name: string } | null;
}

const REFUND_SELECT =
  "id, user_id, amount_inr, reason, status, created_at, decided_at, decision_note, settled_offline, razorpay_refund_id, profiles (full_name), orders!inner (class_id)";

/** Every refund against this class, oldest request first — the queue is a
 *  queue, so the person who has waited longest is at the top. */
export async function findRefundsByClass(
  supabase: SupabaseClient,
  classId: string
): Promise<RefundRequest[]> {
  const { data, error } = await supabase
    .from("refunds")
    .select(REFUND_SELECT)
    .eq("orders.class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`refunds.findByClass failed: ${error.message}`);
  }
  return (data as unknown as RefundRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    learnerName: r.profiles?.full_name ?? "Someone",
    amountInr: r.amount_inr,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    settledOffline: r.settled_offline,
    hasRailReference: r.razorpay_refund_id !== null,
  }));
}

export interface RefundDecision {
  id: string;
  status: RefundStatus;
  amountInr: number;
  /** The captured payment the money goes back onto — the rail needs this. */
  razorpayPaymentId: string | null;
  alreadyAttached: boolean;
}

export async function decideRefund(
  supabase: SupabaseClient,
  refundId: string,
  decision: "approve" | "decline" | "reopen",
  note?: string | null
): Promise<RefundDecision> {
  const { data, error } = await supabase.rpc("decide_refund", {
    p_refund_id: refundId,
    p_decision: decision,
    p_note: note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = data as {
    id: string;
    status: RefundStatus;
    amount_inr: number;
    razorpay_payment_id: string | null;
    already_attached: boolean;
  };
  return {
    id: row.id,
    status: row.status,
    amountInr: row.amount_inr,
    razorpayPaymentId: row.razorpay_payment_id,
    alreadyAttached: row.already_attached,
  };
}

export async function settleRefundOffline(
  supabase: SupabaseClient,
  refundId: string,
  note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("settle_refund_offline", {
    p_refund_id: refundId,
    p_note: note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** The settler's bind, not the payer's: attach_razorpay_refund is scoped to the
 *  learner's own row, so a studio approving somebody else's refund needs this. */
export async function attachSettledRefundReference(
  supabase: SupabaseClient,
  refundId: string,
  razorpayRefundId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_settled_refund_reference", {
    p_refund_id: refundId,
    p_razorpay_refund_id: razorpayRefundId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
