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
  provider_refund_id: string | null;
  profiles: { full_name: string } | null;
}

const REFUND_SELECT =
  "id, user_id, amount_inr, reason, status, created_at, decided_at, decision_note, settled_offline, provider_refund_id, profiles (full_name), orders!inner (class_id, tenant_id, classes (title, style, share_slug), tenants (name))";

/** a refund with the class it is against — the ledger's row (16665-16680) */
export interface RefundLedgerRow extends RefundRequest {
  classId: string;
  tenantId: string;
  classTitle: string;
  classStyle: string;
  classShareSlug: string | null;
  tenantName: string;
}
interface LedgerRow extends RefundRow {
  orders: { class_id: string; tenant_id: string; classes: { title: string; style: string; share_slug: string } | null; tenants: { name: string } | null } | null;
}
const toLedger = (r: LedgerRow): RefundLedgerRow => ({
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
  hasRailReference: r.provider_refund_id !== null,
  classId: r.orders?.class_id ?? "",
  tenantId: r.orders?.tenant_id ?? "",
  classTitle: r.orders?.classes?.title ?? "Class",
  classStyle: r.orders?.classes?.style ?? "",
  classShareSlug: r.orders?.classes?.share_slug ?? null,
  tenantName: r.orders?.tenants?.name ?? "",
});

/** every refund against a business's classes, newest first — members read it (Step 9) */
export async function findRefundsByTenant(supabase: SupabaseClient, tenantId: string): Promise<RefundLedgerRow[]> {
  const { data, error } = await supabase
    .from("refunds")
    .select(REFUND_SELECT)
    .eq("orders.tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    throw new Error(`refunds.findByTenant failed: ${error.message}`);
  }
  return (data as unknown as LedgerRow[]).map(toLedger);
}

/** my own refunds — `user_id = auth.uid()` out loud (a member reads their studio's too) */
export async function findMyRefunds(supabase: SupabaseClient): Promise<RefundLedgerRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("refunds")
    .select(REFUND_SELECT)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(`refunds.mine failed: ${error.message}`);
  }
  return (data as unknown as LedgerRow[]).map(toLedger);
}

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
    hasRailReference: r.provider_refund_id !== null,
  }));
}

export interface RefundDecision {
  id: string;
  status: RefundStatus;
  amountInr: number;
  /** The rail's ids — Cashfree refunds are filed against the ORDER. */
  provider: "razorpay" | "cashfree";
  providerOrderId: string | null;
  providerPaymentId: string | null;
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
    provider: "razorpay" | "cashfree";
    provider_order_id: string | null;
    provider_payment_id: string | null;
    already_attached: boolean;
  };
  return {
    id: row.id,
    status: row.status,
    amountInr: row.amount_inr,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
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

/** The settler's bind, not the payer's: attach_provider_refund is scoped to the
 *  learner's own row, so a studio approving somebody else's refund needs this. */
export async function attachSettledRefundReference(
  supabase: SupabaseClient,
  refundId: string,
  providerRefundId: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_settled_refund_reference", {
    p_refund_id: refundId,
    p_provider_refund_id: providerRefundId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
