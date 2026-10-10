import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import type { PaymentProvider } from "@/types/payment";
import type { RefundRequest, RefundStatus } from "@/types/refund";

/** The refund queue for one class. RLS already admits the studio's members to
 *  their business's refunds (Step 9) and the learner to their own; WHO MAY SETTLE
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
  provider: PaymentProvider | null;
  provider_refund_id: string | null;
  profiles: { full_name: string } | null;
  /** the payment's rail id — what `apply_refund_update` is keyed on */
  payments: { provider_payment_id: string } | null;
}

/* an order names a class session OR an event (17 Sep 2026) — both are embedded,
   and whichever is there is what the row is "against".
   ⚠ THE RAIL'S THREE IDS RIDE ALONG since 30 Sep 2026 — the order's, the
   payment's and the refund's — because a ledger that cannot say whether a
   `pending` refund was ever SENT to Cashfree, or ask Cashfree what became of
   it, is a ledger that reads "processing" for ever (see services/refundRail.ts). */
const REFUND_SELECT =
  "id, user_id, amount_inr, reason, status, created_at, decided_at, decision_note, settled_offline, provider, provider_refund_id, profiles (full_name), payments (provider_payment_id), orders!inner (class_id, event_id, business_id, provider_order_id, enquiry_quote_id, classes (style, level, share_slug), events (title), businesses (name))";

/** a refund with the class — or, since 17 Sep 2026, the event — it is against;
 *  the ledger's row (16665-16680). The `class*` names are kept for the class
 *  case's callers; an event row fills them with the event's words.
 *
 *  ⚠ `eventShareSlug` went on 29 Sep 2026 with events: it was the row's DOOR,
 *  `/e/{slug}`, and that route is gone. The row itself stays and still says what
 *  it was for — a refund ledger is a record of what happened (Rule 9), and the
 *  same reasoning as the invoice ledger's applies. */
export interface RefundLedgerRow extends RefundRequest {
  classId: string;
  businessId: string;
  classTitle: string;
  classStyle: string;
  classShareSlug: string | null;
  businessName: string;
  /** WHERE THE MONEY IS, in the rail's own terms (30 Sep 2026). A `pending`
   *  row with no `providerRefundId` was filed and NEVER SENT — the studio's
   *  desk offers to send it; one with an id is with Cashfree, whose answer the
   *  ledger fetches when it is opened. Null `providerOrderId` means the order
   *  never reached the rail (a planted or legacy row) and nothing can be sent. */
  provider: PaymentProvider | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
}
interface LedgerRow extends RefundRow {
  orders: {
    class_id: string | null;
    event_id: string | null;
    business_id: string;
    provider_order_id: string | null;
    enquiry_quote_id?: string | null;
    classes: { style: string; level: string; share_slug: string } | null;
    events: { title: string } | null;
    businesses: { name: string } | null;
  } | null;
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
  provider: r.provider ?? null,
  providerOrderId: r.orders?.provider_order_id ?? null,
  providerPaymentId: r.payments?.provider_payment_id ?? null,
  providerRefundId: r.provider_refund_id,
  classId: r.orders?.class_id ?? "",
  businessId: r.orders?.business_id ?? "",
  /* a class is called "{style} · {level}", never a stored name (types/class.ts); an event keeps its title */
  classTitle: r.orders?.classes
    ? dosClassLabel(r.orders.classes.style, r.orders.classes.level)
    : r.orders?.enquiry_quote_id
      ? "Enquiry payment"
      : (r.orders?.events?.title ?? "Booking"),
  classStyle: r.orders?.classes?.style ?? (r.orders?.enquiry_quote_id ? "Enquiry" : r.orders?.events ? "Event ticket" : ""),
  classShareSlug: r.orders?.classes?.share_slug ?? null,
  businessName: r.orders?.businesses?.name ?? "",
});

/** every refund against a business's classes, newest first — members read it (Step 9) */
export async function findRefundsByBusiness(supabase: SupabaseClient, businessId: string): Promise<RefundLedgerRow[]> {
  const { data, error } = await supabase
    .from("refunds")
    .select(REFUND_SELECT)
    .eq("orders.business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    throw new Error(`refunds.findByBusiness failed: ${error.message}`);
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

/** WHOSE PENDING REFUNDS TO ASK THE RAIL ABOUT — one class's queue, one
 *  business's ledger, or the caller's own (30 Sep 2026). Every shape names its
 *  scope out loud: `refunds` admits a business's members to the whole studio's
 *  rows, and RLS is a ceiling, not a scope. */
export type RefundRailScope =
  | { classId: string }
  | { businessId: string }
  | { mine: string }
  /** one order on the rail — what a capture that could not be honoured files a
   *  refund against (10 Oct 2026); read with the SERVICE ROLE by the capture
   *  paths only, on the order Cashfree just told them about */
  | { providerOrderId: string };

/** A `pending` refund as the rail needs it: which of its ids it carries. */
export interface RailRefund {
  id: string;
  amountInr: number;
  provider: PaymentProvider | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
}

interface RailRow {
  id: string;
  amount_inr: number;
  provider: PaymentProvider | null;
  provider_refund_id: string | null;
  payments: { provider_payment_id: string } | null;
  orders: { class_id: string | null; business_id: string; provider_order_id: string | null } | null;
}

const RAIL_SELECT = "id, amount_inr, provider, provider_refund_id, payments (provider_payment_id), orders!inner (class_id, business_id, provider_order_id)";

const toRail = (r: RailRow): RailRefund => ({
  id: r.id,
  amountInr: r.amount_inr,
  provider: r.provider ?? null,
  providerOrderId: r.orders?.provider_order_id ?? null,
  providerPaymentId: r.payments?.provider_payment_id ?? null,
  providerRefundId: r.provider_refund_id,
});

/* the scope column and value, stated once; the embed prefix is how a scope on
   `refunds` names the order it hangs off (the audit understands the prefix) */
const railScopeColumn = (scope: RefundRailScope): [string, string] =>
  "classId" in scope
    ? ["orders.class_id", scope.classId]
    : "businessId" in scope
      ? ["orders.business_id", scope.businessId]
      : "providerOrderId" in scope
        ? ["orders.provider_order_id", scope.providerOrderId]
        : ["user_id", scope.mine];

/** `pending` refunds that carry a rail reference — the ones whose outcome only
 *  Cashfree knows. Small, usually empty, and read before a ledger is drawn. */
export async function findRailPendingRefunds(supabase: SupabaseClient, scope: RefundRailScope): Promise<RailRefund[]> {
  const [col, val] = railScopeColumn(scope);
  /* audit-ok: the scope IS stated — `railScopeColumn` is exactly one of
     `orders.class_id`, `orders.business_id` or `user_id`, every one a scope
     column; the grep cannot see through the variable, a reader can */
  const { data, error } = await supabase
    .from("refunds")
    .select(RAIL_SELECT)
    .eq(col, val)
    .eq("status", "pending")
    .not("provider_refund_id", "is", null)
    .is("deleted_at", null)
    .limit(200);
  if (error) {
    throw new Error(`refunds.railPending failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as RailRow[]).map(toRail);
}

/** `pending` refunds that were filed and NEVER SENT — no rail reference yet.
 *  These are what calling a class off leaves behind, and what the studio's
 *  desk can push through by hand if the send failed. */
export async function findUnsentRefunds(supabase: SupabaseClient, scope: RefundRailScope): Promise<RailRefund[]> {
  const [col, val] = railScopeColumn(scope);
  /* audit-ok: same as above — the scope is one of three named columns through
     `railScopeColumn`, stated on the line the grep cannot read */
  const { data, error } = await supabase
    .from("refunds")
    .select(RAIL_SELECT)
    .eq(col, val)
    .eq("status", "pending")
    .is("provider_refund_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    throw new Error(`refunds.unsent failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as RailRow[]).map(toRail);
}

/** ⚠ MONEY. The unsent refunds an ENDED ENQUIRY filed (3 Oct 2026) — the online
 *  part of agreed ending terms, on that enquiry's own orders. Read with the
 *  SERVICE ROLE by `sendEnquiryRefunds` only, straight after `answer_enquiry_ending`
 *  admitted the caller; the quote ids are the enquiry's own, stated out loud. */
export async function findUnsentEnquiryRefunds(admin: SupabaseClient, quoteIds: string[]): Promise<RailRefund[]> {
  if (quoteIds.length === 0) return [];
  /* audit-ok: scoped through the embed — `orders.enquiry_quote_id` IN the one
     enquiry's own quote ids, which the caller read under its own RLS first */
  const { data, error } = await admin
    .from("refunds")
    .select("id, amount_inr, provider, provider_refund_id, payments (provider_payment_id), orders!inner (class_id, business_id, provider_order_id, enquiry_quote_id)")
    .in("orders.enquiry_quote_id", quoteIds)
    .eq("status", "pending")
    .is("provider_refund_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    throw new Error(`refunds.unsentEnquiry failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as RailRow[]).map(toRail);
}

/** bind the rail's reference to a refund the service role just sent — the row
 *  is read back, so a write that moved nothing says so */
export async function bindRefundReference(admin: SupabaseClient, refundId: string, providerRefundId: string): Promise<void> {
  const { data, error } = await admin
    .from("refunds")
    .update({ provider_refund_id: providerRefundId })
    .eq("id", refundId)
    .is("provider_refund_id", null)
    .select("id");
  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("that refund already carries a reference");
  }
}

/** one unsent refund by id — the desk's "Send through Cashfree" retry */
export async function findUnsentRefund(supabase: SupabaseClient, refundId: string): Promise<RailRefund | null> {
  const { data, error } = await supabase
    .from("refunds")
    .select(RAIL_SELECT)
    .eq("id", refundId)
    .eq("status", "pending")
    .is("provider_refund_id", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`refunds.unsentOne failed: ${error.message}`);
  }
  return data ? toRail(data as unknown as RailRow) : null;
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
