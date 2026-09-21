import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKETS,
  bucketKeyOf,
  bucketStartIso,
  bucketsWindow,
  type Period,
} from "@/lib/format/month";
import { EARNING_TINT, type EarningsReport, type MoneyLine } from "@/types/earnings";

/** EARNINGS, COUNTED THE SAME WAY FOR EVERY KIND OF PROFILE (21 Sep 2026, the
 *  user: "lets fix earnings for all profile types … Revenue with breakup and
 *  Expenses with breakup. and what is left after that").
 *
 *  ⚠ SUMS ARE COMPUTED HERE, NOT IN SQL, and that is a checked decision rather
 *  than a lazy one: this project's PostgREST has aggregates switched off
 *  (`PGRST123 Use of aggregate functions is not allowed`), which is why
 *  `findTenantIncome` has summed in TypeScript since 28 Aug. So the queries
 *  carry a RUNAWAY GUARD, not a page size — the card states ONE total, so a
 *  partial sum is a wrong number rather than a short list — and when a guard is
 *  filled `complete` goes false and the screen says so out loud.
 *  ⚠ The right long-term answer is ONE aggregate RPC, the way `my_org_stats()`
 *  already does it (aggregating INSIDE a definer function is fine; it is only
 *  the PostgREST path that is closed). That is a migration, and it is the
 *  backlog's, not this slice's.
 *
 *  ⚠ AND EVERY BUCKET IS READ AT ONCE. The window is the whole chart — fourteen
 *  days, twelve weeks, twelve months or five years — so switching buckets costs
 *  no round trip and the chart and the figures can never disagree, because they
 *  are the same rows counted once. */

const MAX_ROWS = 4000;

type Bucketed = Map<string, number>;

const add = (m: Bucketed, key: string, n: number) => m.set(key, (m.get(key) ?? 0) + n);

/** a line, only if it ever carried money — a breakup of zeroes is noise */
const lineOf = (key: string, label: string, amountInr: number, href?: string, note?: string): MoneyLine | null =>
  amountInr > 0 ? { key, label, amountInr, href, note } : null;

const keep = (...lines: Array<MoneyLine | null>): MoneyLine[] => lines.filter((l): l is MoneyLine => l !== null);

/** ⚠ a DATE column (`paid_on`) is a day key already — bucketing it through
 *  `bucketKeyOf` needs an instant, and IST midnight is the honest one: a payment
 *  recorded on the 21st belongs to the 21st in the country the app serves. */
const dayToIso = (day: string) => `${day}T00:00:00+05:30`;

type Window = { from: string; keys: string[] };

const windowFor = (nowIso: string, period: Period): Window => {
  const keys = bucketsWindow(nowIso, period, BUCKETS[period]);
  return { from: bucketStartIso(keys[0], period), keys };
};

/** the report a screen draws: a bucket per column, and the breakup of whichever
 *  bucket is being looked at */
function assemble(
  period: Period,
  keys: string[],
  revenue: Array<{ key: string; label: string; by: Bucketed; href?: string; note?: string }>,
  expenses: Array<{ key: string; label: string; by: Bucketed; href?: string; note?: string }>,
  complete: boolean
): EarningsReport {
  const lines: EarningsReport["lines"] = {};
  const buckets = keys.map((k) => {
    const rev = keep(...revenue.map((r) => lineOf(r.key, r.label, r.by.get(k) ?? 0, r.href, r.note)));
    const exp = keep(...expenses.map((e) => lineOf(e.key, e.label, e.by.get(k) ?? 0, e.href, e.note)));
    lines[k] = { revenue: rev, expenses: exp };
    return {
      key: k,
      revenueInr: rev.reduce((n, l) => n + l.amountInr, 0),
      expensesInr: exp.reduce((n, l) => n + l.amountInr, 0),
    };
  });
  return { period, buckets, lines, complete };
}

/** WHAT A BUSINESS TOOK AND SPENT — a studio's, an artist page's, or an
 *  organization's own hosting row. Several ids at once, because an organization
 *  is every studio it owns plus that hosting row, added up. */
export async function findBusinessEarnings(
  supabase: SupabaseClient,
  businessIds: string[],
  period: Period,
  nowIso: string
): Promise<EarningsReport> {
  const { from, keys } = windowFor(nowIso, period);
  if (businessIds.length === 0) return assemble(period, keys, [], [], true);
  const fromDay = from.slice(0, 10);

  const [payments, refunds, payouts, assets, quotes] = await Promise.all([
    /* what students paid — the three subjects an order can name (the CHECK
       `orders_subject_check`), so Classes is the residual once the other two
       are taken out, exactly as `findTenantIncome` reads it.
       ⚠ `captured` AND `refunded`: a payment that was later refunded still CAME
       IN, and its refund is a deduction of its own beneath. */
    supabase
      .from("payments")
      .select("amount_inr, created_at, orders (membership_id, event_id)")
      .in("business_id", businessIds)
      .eq("kind", "order")
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .gte("created_at", from)
      .limit(MAX_ROWS),
    supabase
      .from("refunds")
      .select("amount_inr, decided_at, updated_at")
      .in("business_id", businessIds)
      .eq("status", "processed")
      .is("deleted_at", null)
      .gte("updated_at", from)
      .limit(MAX_ROWS),
    /* ⚠ `done` and `in_transit` only: money that has left or is leaving. An
       `on_hold` or `failed` payout has not been spent, and the existing desk
       tiles all three together under "In transit", which is a different claim. */
    supabase
      .from("payouts")
      .select("amount_inr, paid_on, status")
      .in("business_id", businessIds)
      .in("status", ["done", "in_transit"])
      .is("deleted_at", null)
      .gte("paid_on", fromDay)
      .limit(MAX_ROWS),
    /* ⚠ ASSETS ARE AN EXPENSE (21 Sep 2026, the user: "with assets just need
       price to be linked with expenses in earnings, no separate association of
       asset is required"). A value of 0 means an asset the business ALREADY
       HAD, so it adds nothing — which is right: kit you owned is not money you
       spent. And the period is the one it was ADDED in, because an asset has no
       purchase date; the screen says so rather than implying one. */
    supabase
      .from("assets")
      .select("value_inr, created_at")
      .in("business_id", businessIds)
      .is("deleted_at", null)
      .gte("created_at", from)
      .limit(MAX_ROWS),
    /* ⚠ ENQUIRY MONEY, WHICH NO EARNINGS SCREEN HAS EVER SHOWN. A celebration or
       a corporate show is recorded as received by the business
       (`record_enquiry_payment`, 28 Aug) and writes no `payments` row, so it has
       been real money invisible on every ledger since. It is revenue. */
    supabase
      .from("enquiry_quotes")
      .select("cost_inr, advance_inr, advance_paid_at, full_paid_at")
      .in("business_id", businessIds)
      .is("deleted_at", null)
      .limit(MAX_ROWS),
  ]);

  for (const r of [payments, refunds, payouts, assets, quotes]) {
    if (r.error) throw r.error;
  }
  const complete =
    (payments.data?.length ?? 0) < MAX_ROWS &&
    (refunds.data?.length ?? 0) < MAX_ROWS &&
    (payouts.data?.length ?? 0) < MAX_ROWS &&
    (assets.data?.length ?? 0) < MAX_ROWS &&
    (quotes.data?.length ?? 0) < MAX_ROWS;

  const classes: Bucketed = new Map();
  const memberships: Bucketed = new Map();
  const events: Bucketed = new Map();
  const enquiries: Bucketed = new Map();
  const pay: Bucketed = new Map();
  const refunded: Bucketed = new Map();
  const bought: Bucketed = new Map();

  /* ⚠ PostgREST TYPES A TO-ONE EMBED AS AN ARRAY though it returns an object —
     so the subject is read through a normaliser rather than cast past the
     compiler. Getting this wrong would not throw: every payment would fall
     through to Classes and the breakup would silently be one line. */
  type Subject = { membership_id: string | null; event_id: string | null };
  type PayRow = { amount_inr: number; created_at: string; orders: Subject | Subject[] | null };
  const subjectOf = (o: PayRow["orders"]): Subject | null => (Array.isArray(o) ? (o[0] ?? null) : o);
  for (const p of (payments.data ?? []) as unknown as PayRow[]) {
    const k = bucketKeyOf(p.created_at, period);
    const s = subjectOf(p.orders);
    if (s?.membership_id) add(memberships, k, p.amount_inr);
    else if (s?.event_id) add(events, k, p.amount_inr);
    else add(classes, k, p.amount_inr);
  }

  /* a refund belongs to the month it was DECIDED — the rule `findTenantIncome`
     set on 28 Aug — or, for the rail's own automatic ones that nobody decided,
     the moment the row last moved */
  type RefundRow = { amount_inr: number; decided_at: string | null; updated_at: string };
  for (const r of (refunds.data ?? []) as RefundRow[]) {
    add(refunded, bucketKeyOf(r.decided_at ?? r.updated_at, period), r.amount_inr);
  }

  type PayoutRow = { amount_inr: number; paid_on: string };
  for (const p of (payouts.data ?? []) as PayoutRow[]) {
    add(pay, bucketKeyOf(dayToIso(p.paid_on), period), p.amount_inr);
  }

  type AssetRow = { value_inr: number; created_at: string };
  for (const a of (assets.data ?? []) as AssetRow[]) {
    if (a.value_inr > 0) add(bought, bucketKeyOf(a.created_at, period), a.value_inr);
  }

  /* the advance when it was paid, and the BALANCE when the rest was — two
     separate acts, recorded at two separate moments, so they bucket separately */
  type QuoteRow = { cost_inr: number; advance_inr: number; advance_paid_at: string | null; full_paid_at: string | null };
  for (const q of (quotes.data ?? []) as QuoteRow[]) {
    if (q.advance_paid_at) add(enquiries, bucketKeyOf(q.advance_paid_at, period), q.advance_inr);
    if (q.full_paid_at) add(enquiries, bucketKeyOf(q.full_paid_at, period), Math.max(0, q.cost_inr - q.advance_inr));
  }

  const one = businessIds.length === 1 ? businessIds[0] : null;
  return assemble(
    period,
    keys,
    [
      { key: "classes", label: "Classes", by: classes, href: one ? `/business/${one}/invoices` : undefined },
      { key: "memberships", label: "Memberships", by: memberships, href: one ? `/business/${one}/memberships` : undefined },
      { key: "events", label: "Tickets & entries", by: events },
      { key: "enquiries", label: "Enquiries", by: enquiries, note: "recorded by you as received", href: "/inbox" },
    ],
    [
      { key: "pay", label: "What you paid your people", by: pay, href: one ? `/business/${one}/earnings` : undefined },
      { key: "refunds", label: "Refunds", by: refunded, href: one ? `/business/${one}/refunds` : undefined },
      { key: "assets", label: "Assets bought", by: bought, note: "counted in the period it was added", href: one ? `/business/${one}/assets` : undefined },
    ],
    complete
  );
}

/** WHAT A PERSON WAS PAID — the other side of a studio's pay ledger.
 *
 *  ⚠ A PERSON HAS NO EXPENSES HERE, and that is a fact rather than a gap: they
 *  employ nobody and buy nothing through DanceOS, so what is left IS what came
 *  in. The screen says that instead of drawing an empty Expenses block. */
export async function findPersonEarnings(
  supabase: SupabaseClient,
  userId: string,
  period: Period,
  nowIso: string
): Promise<EarningsReport> {
  const { from, keys } = windowFor(nowIso, period);
  const { data, error } = await supabase
    .from("payouts")
    .select("amount_inr, paid_on")
    .eq("user_id", userId)
    .in("status", ["done", "in_transit"])
    .is("deleted_at", null)
    .gte("paid_on", from.slice(0, 10))
    .limit(MAX_ROWS);
  if (error) throw error;

  const taught: Bucketed = new Map();
  for (const p of (data ?? []) as Array<{ amount_inr: number; paid_on: string }>) {
    add(taught, bucketKeyOf(dayToIso(p.paid_on), period), p.amount_inr);
  }
  return assemble(
    period,
    keys,
    [{ key: "teaching", label: "Paid by studios", by: taught, note: "for sessions taught, and anything else they paid you", href: "/earnings" }],
    [],
    (data?.length ?? 0) < MAX_ROWS
  );
}

export { EARNING_TINT };
