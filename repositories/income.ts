import type { SupabaseClient } from "@supabase/supabase-js";
import { monthKeyOf, monthRefOf, monthStartIso, shiftMonthKey } from "@/lib/format/month";
import type { MethodShare, MonthIncome, TenantIncome } from "@/types/income";

/** Step 13b part 2b — what a studio COLLECTED, month by month (prototype S_earn
 *  17992-18085, 18171-18178). No table, no RPC, no policy: these are plain
 *  RLS-shaped reads of the payments and refunds Step 9 already admits a tenant's
 *  members to. WHO SEES THE SCREEN is narrower and decided by the page — the
 *  owner alone — exactly as the class page's Earnings tab is gated.
 *
 *  Sums are computed here rather than in SQL because this project's PostgREST
 *  has aggregates switched off (PGRST123). So the queries carry a runaway guard,
 *  not a page size (part 2a's precedent): the card states ONE total, and a
 *  partial sum would be a wrong number, not a short list. If a query ever fills
 *  the guard, `complete` goes false and the screen says so out loud. */
const MAX_INCOME_ROWS = 4000;

/* the period chips: this month and the three before it (prototype 17988) */
const PAST_MONTHS = 3;

interface PaymentRow {
  amount_inr: number;
  status: string;
  method: string | null;
  created_at: string;
}

interface ProcessedRefundRow {
  amount_inr: number;
  created_at: string;
  decided_at: string | null;
  updated_at: string;
}

interface OpenRefundRow {
  amount_inr: number;
}

interface Bucket {
  gross: number;
  count: number;
  refunded: number;
  refundCount: number;
  methods: Map<string, { amount: number; count: number }>;
}

/** Razorpay's word for the method, lower-cased; nothing → "other". */
const normaliseMethod = (method: string | null): string => {
  const m = (method ?? "").trim().toLowerCase();
  return m.length > 0 ? m : "other";
};

/** The month a processed refund belongs to: when it was DECIDED (an approval, or
 *  a settlement at the desk), or — for the rail's own auto-refunds that nobody
 *  decided — when the row last moved, which is apply_refund_update marking it
 *  processed. The row's filing date is deliberately not used: a refund asked
 *  for in July and paid back in August is an August deduction. */
const refundMonthKey = (r: ProcessedRefundRow): string => monthKeyOf(r.decided_at ?? r.updated_at);

const emptyBucket = (): Bucket => ({
  gross: 0,
  count: 0,
  refunded: 0,
  refundCount: 0,
  methods: new Map(),
});

export async function findTenantIncome(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso: string
): Promise<TenantIncome> {
  const currentKey = monthKeyOf(nowIso);
  const keys = Array.from({ length: PAST_MONTHS + 1 }, (_, back) => shiftMonthKey(currentKey, back));
  const fromIso = monthStartIso(keys[keys.length - 1]);

  const [paymentsRes, refundsRes, openRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_inr, status, method, created_at")
      .eq("tenant_id", tenantId)
      /* a refunded payment still CAME IN; the refund is its own deduction below */
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .limit(MAX_INCOME_ROWS),
    supabase
      .from("refunds")
      .select("amount_inr, created_at, decided_at, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "processed")
      .is("deleted_at", null)
      /* updated_at is never earlier than decided_at, so this bound cannot drop
         a refund that refundMonthKey would place inside the window */
      .gte("updated_at", fromIso)
      .order("updated_at", { ascending: false })
      .limit(MAX_INCOME_ROWS),
    supabase
      .from("refunds")
      .select("amount_inr")
      .eq("tenant_id", tenantId)
      /* being asked back right now, whichever month it was filed — a live
         queue figure. Declined and failed are in neither total, matching the
         prototype's own filters (only Paid, and Requested + Processing). */
      .in("status", ["requested", "pending"])
      .is("deleted_at", null)
      .limit(MAX_INCOME_ROWS),
  ]);

  for (const [what, res] of [
    ["payments", paymentsRes],
    ["refunds", refundsRes],
    ["open", openRes],
  ] as const) {
    if (res.error) {
      throw new Error(`income.findTenantIncome(${what}) failed: ${res.error.message}`);
    }
  }

  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];
  const refunds = (refundsRes.data ?? []) as unknown as ProcessedRefundRow[];
  const open = (openRes.data ?? []) as unknown as OpenRefundRow[];

  const buckets = new Map<string, Bucket>(keys.map((k) => [k, emptyBucket()]));

  for (const p of payments) {
    const bucket = buckets.get(monthKeyOf(p.created_at));
    if (!bucket) continue;
    bucket.gross += p.amount_inr;
    bucket.count += 1;
    const method = normaliseMethod(p.method);
    const share = bucket.methods.get(method) ?? { amount: 0, count: 0 };
    share.amount += p.amount_inr;
    share.count += 1;
    bucket.methods.set(method, share);
  }

  for (const r of refunds) {
    const bucket = buckets.get(refundMonthKey(r));
    if (!bucket) continue;
    bucket.refunded += r.amount_inr;
    bucket.refundCount += 1;
  }

  const months: MonthIncome[] = keys.map((key) => {
    const bucket = buckets.get(key) ?? emptyBucket();
    const byMethod: MethodShare[] = [...bucket.methods.entries()]
      .map(([method, s]) => ({ method, amountInr: s.amount, count: s.count }))
      .sort((a, b) => b.amountInr - a.amountInr || a.method.localeCompare(b.method));
    const ref = monthRefOf(key);
    return {
      key,
      monthName: ref.monthName,
      label: ref.label,
      grossInr: bucket.gross,
      paymentCount: bucket.count,
      refundedInr: bucket.refunded,
      refundCount: bucket.refundCount,
      byMethod,
    };
  });

  return {
    current: months[0],
    previous: months.slice(1),
    openRefundsInr: open.reduce((a, r) => a + r.amount_inr, 0),
    openRefundCount: open.length,
    complete:
      payments.length < MAX_INCOME_ROWS && refunds.length < MAX_INCOME_ROWS && open.length < MAX_INCOME_ROWS,
  };
}
