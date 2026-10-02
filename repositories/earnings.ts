import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKETS,
  bucketKeyOf,
  bucketStartIso,
  bucketsWindow,
  type Period,
} from "@/lib/format/month";
import { dosClassLabel } from "@/lib/constants/styles";
import { ENQ_TYPES } from "@/types/enquiry";
import { EARNING_TINT, type EarningsReport, type MoneyItem, type MoneyLine } from "@/types/earnings";

/** EARNINGS, COUNTED THE SAME WAY FOR EVERY KIND OF PROFILE (21 Sep 2026, the
 *  user: "lets fix earnings for all profile types … Revenue with breakup and
 *  Expenses with breakup. and what is left after that").
 *
 *  ⚠ SUMS ARE COMPUTED HERE, NOT IN SQL, and that is a checked decision rather
 *  than a lazy one: this project's PostgREST has aggregates switched off
 *  (`PGRST123 Use of aggregate functions is not allowed`), which is why
 *  `findBusinessIncome` has summed in TypeScript since 28 Aug. So the queries
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

/** the rows behind each line, bucketed the same way its money is */
type Itemed = Map<string, MoneyItem[]>;
const addItem = (m: Itemed, key: string, item: MoneyItem) => {
  const list = m.get(key);
  if (list) list.push(item);
  else m.set(key, [item]);
};

/** ⚠⚠ EVERY LINE, EVEN AT ₹0 (2 Oct 2026, the user: *"should also be visible
 *  even if 0. so can identify what all has been put in it for both"*). The old
 *  rule — "a breakup of zeroes is noise" — made the breakup a different SHAPE
 *  every period, so nobody could tell a source that took nothing from a source
 *  the app does not count. The zero is the measurement now, and each line
 *  carries the rows behind it, newest first. */
const lineOf = (key: string, label: string, amountInr: number, href?: string, note?: string, items: MoneyItem[] = []): MoneyLine => ({
  key,
  label,
  amountInr,
  href,
  note,
  items: [...items].sort((x, y) => y.at.localeCompare(x.at)),
});

/** a class's name the way the app says it everywhere */
const classWords = (c: { style: string; level: string } | null | undefined) => (c ? dosClassLabel(c.style, c.level) : null);
/** PostgREST types a to-one embed as an array though it returns an object */
const single = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const enquiryWords = (typeKey: string | null | undefined) => ENQ_TYPES.find((t) => t.k === typeKey)?.label ?? "Enquiry";

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
  revenue: Array<{ key: string; label: string; by: Bucketed; items?: Itemed; href?: string; note?: string; hideAtZero?: boolean }>,
  expenses: Array<{ key: string; label: string; by: Bucketed; items?: Itemed; href?: string; note?: string; hideAtZero?: boolean }>,
  complete: boolean
): EarningsReport {
  const lines: EarningsReport["lines"] = {};
  type Src = (typeof revenue)[number];
  const build = (s: Src, k: string) => lineOf(s.key, s.label, s.by.get(k) ?? 0, s.href, s.note, s.items?.get(k) ?? []);
  /* a RETIRED source (tickets) is drawn only when it actually holds money —
     a ₹0 line for a feature nobody can use any more would be a promise */
  const shown = (l: MoneyLine, s: Src) => !s.hideAtZero || l.amountInr > 0;
  const buckets = keys.map((k) => {
    const rev = revenue.map((r) => [build(r, k), r] as const).filter(([l, r]) => shown(l, r)).map(([l]) => l);
    const exp = expenses.map((e) => [build(e, k), e] as const).filter(([l, e]) => shown(l, e)).map(([l]) => l);
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

  const [payments, refunds, payouts, assets, quotes, subs] = await Promise.all([
    /* what students paid — the three subjects an order can name (the CHECK
       `orders_subject_check`), so Classes is the residual once the other two
       are taken out, exactly as `findBusinessIncome` reads it.
       ⚠ `captured` AND `refunded`: a payment that was later refunded still CAME
       IN, and its refund is a deduction of its own beneath. */
    supabase
      .from("payments")
      /* the names behind each payment (2 Oct 2026) — which class or membership,
         and who paid; every key here is a single unambiguous FK */
      .select("amount_inr, created_at, orders (membership_id, event_id, classes (style, level), memberships (name), profiles (full_name))")
      .in("business_id", businessIds)
      .eq("kind", "order")
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .gte("created_at", from)
      .limit(MAX_ROWS),
    supabase
      .from("refunds")
      .select("amount_inr, decided_at, updated_at, profiles (full_name), orders (classes (style, level), memberships (name))")
      .in("business_id", businessIds)
      .eq("status", "processed")
      .is("deleted_at", null)
      .gte("updated_at", from)
      .limit(MAX_ROWS),
    /* ⚠ `done` and `in_transit` only: money that has left or is leaving. An
       `on_hold` or `failed` payout has not been spent, and the existing desk
       tiles all three together under "In transit", which is a different classPerson. */
    supabase
      .from("payouts")
      .select("amount_inr, paid_on, status, profiles (full_name)")
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
      .select("name, category, value_inr, created_at")
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
      .select("cost_inr, advance_inr, advance_paid_at, full_paid_at, enquiries (type_key, profiles (full_name))")
      .in("business_id", businessIds)
      .is("deleted_at", null)
      .limit(MAX_ROWS),
    /* ⚠ WHAT THE STUDIO PAYS DANCEOS IS AN EXPENSE, and it had never appeared on
       any ledger (21 Sep 2026). A studio is ₹1,200 a month and the row is real —
       but `payments.business_id` is NULL for a subscription payment
       (`20260912140000` writes it that way), so it is reached through the
       SUBSCRIPTION, which is the thing that knows which studio it is for. Hence
       `!inner`: the filter is on the embedded row, so a payment whose
       subscription is not one of these businesses' is not returned at all.
       ⚠ An ARTIST plan is deliberately NOT here: `subscriptions.business_id` is
       null for one, because it belongs to the PERSON rather than to their page —
       so it cannot be attributed to a business, and guessing would be worse than
       leaving it on their own invoice ledger where it already is. */
    supabase
      .from("payments")
      .select("amount_inr, created_at, subscriptions!inner (business_id)")
      .in("kind", ["subscription_auth", "subscription_charge"])
      .eq("status", "captured")
      .is("deleted_at", null)
      .in("subscriptions.business_id", businessIds)
      .gte("created_at", from)
      .limit(MAX_ROWS),
  ]);

  for (const r of [payments, refunds, payouts, assets, quotes, subs]) {
    if (r.error) throw r.error;
  }
  const complete =
    (payments.data?.length ?? 0) < MAX_ROWS &&
    (refunds.data?.length ?? 0) < MAX_ROWS &&
    (payouts.data?.length ?? 0) < MAX_ROWS &&
    (assets.data?.length ?? 0) < MAX_ROWS &&
    (quotes.data?.length ?? 0) < MAX_ROWS &&
    (subs.data?.length ?? 0) < MAX_ROWS;

  const classes: Bucketed = new Map();
  const memberships: Bucketed = new Map();
  const events: Bucketed = new Map();
  const enquiries: Bucketed = new Map();
  const pay: Bucketed = new Map();
  const refunded: Bucketed = new Map();
  const bought: Bucketed = new Map();
  const plan: Bucketed = new Map();

  /* the rows behind each line, one map per source (2 Oct 2026) */
  const classesI: Itemed = new Map();
  const membershipsI: Itemed = new Map();
  const eventsI: Itemed = new Map();
  const enquiriesI: Itemed = new Map();
  const payI: Itemed = new Map();
  const refundedI: Itemed = new Map();
  const boughtI: Itemed = new Map();
  const planI: Itemed = new Map();
  /** count a row once: its money into the bucket, its name into the list */
  const take = (by: Bucketed, items: Itemed, at: string, amountInr: number, label: string) => {
    const k = bucketKeyOf(at, period);
    add(by, k, amountInr);
    addItem(items, k, { label, amountInr, at });
  };

  /* ⚠ PostgREST TYPES A TO-ONE EMBED AS AN ARRAY though it returns an object —
     so the subject is read through a normaliser rather than cast past the
     compiler. Getting this wrong would not throw: every payment would fall
     through to Classes and the breakup would silently be one line. */
  type Named = { full_name: string | null };
  type ClassBit = { style: string; level: string };
  type Subject = {
    membership_id: string | null;
    event_id: string | null;
    classes?: ClassBit | ClassBit[] | null;
    memberships?: { name: string } | Array<{ name: string }> | null;
    profiles?: Named | Named[] | null;
  };
  type PayRow = { amount_inr: number; created_at: string; orders: Subject | Subject[] | null };
  for (const p of (payments.data ?? []) as unknown as PayRow[]) {
    const s = single(p.orders);
    const who = single(s?.profiles)?.full_name ?? null;
    const tail = who ? ` — ${who}` : "";
    if (s?.membership_id) take(memberships, membershipsI, p.created_at, p.amount_inr, `${single(s.memberships)?.name ?? "A membership"}${tail}`);
    else if (s?.event_id) take(events, eventsI, p.created_at, p.amount_inr, `A ticket or entry${tail}`);
    else take(classes, classesI, p.created_at, p.amount_inr, `${classWords(single(s?.classes)) ?? "A class"}${tail}`);
  }

  /* a refund belongs to the month it was DECIDED — the rule `findBusinessIncome`
     set on 28 Aug — or, for the rail's own automatic ones that nobody decided,
     the moment the row last moved */
  type RefundRow = {
    amount_inr: number;
    decided_at: string | null;
    updated_at: string;
    profiles?: Named | Named[] | null;
    orders?: { classes?: ClassBit | ClassBit[] | null; memberships?: { name: string } | Array<{ name: string }> | null } | Array<{ classes?: ClassBit | ClassBit[] | null; memberships?: { name: string } | Array<{ name: string }> | null }> | null;
  };
  for (const r of (refunds.data ?? []) as unknown as RefundRow[]) {
    const o = single(r.orders);
    const what = classWords(single(o?.classes)) ?? single(o?.memberships)?.name ?? "A refund";
    const who = single(r.profiles)?.full_name;
    take(refunded, refundedI, r.decided_at ?? r.updated_at, r.amount_inr, `${what}${who ? ` — ${who}` : ""}`);
  }

  type PayoutRow = { amount_inr: number; paid_on: string; profiles?: Named | Named[] | null };
  for (const p of (payouts.data ?? []) as unknown as PayoutRow[]) {
    take(pay, payI, dayToIso(p.paid_on), p.amount_inr, single(p.profiles)?.full_name ?? "Somebody on your team");
  }

  /* ⚠ a ₹0 asset is one the business ALREADY HAD: it adds nothing to the total,
     and it is still listed, because "what all has been put in it" is the ask */
  type AssetRow = { name: string; category: string; value_inr: number; created_at: string };
  for (const a of (assets.data ?? []) as AssetRow[]) {
    take(bought, boughtI, a.created_at, a.value_inr, `${a.name} · ${a.category}${a.value_inr > 0 ? "" : " (already had it)"}`);
  }

  /* the advance when it was paid, and the BALANCE when the rest was — two
     separate acts, recorded at two separate moments, so they bucket separately */
  type QuoteRow = {
    cost_inr: number;
    advance_inr: number;
    advance_paid_at: string | null;
    full_paid_at: string | null;
    enquiries?: { type_key: string; profiles?: Named | Named[] | null } | Array<{ type_key: string; profiles?: Named | Named[] | null }> | null;
  };
  for (const q of (quotes.data ?? []) as unknown as QuoteRow[]) {
    const e = single(q.enquiries);
    const what = enquiryWords(e?.type_key);
    const who = single(e?.profiles)?.full_name;
    const tail = who ? ` — ${who}` : "";
    if (q.advance_paid_at) take(enquiries, enquiriesI, q.advance_paid_at, q.advance_inr, `${what} advance${tail}`);
    if (q.full_paid_at) take(enquiries, enquiriesI, q.full_paid_at, Math.max(0, q.cost_inr - q.advance_inr), `${what} balance${tail}`);
  }

  for (const s of (subs.data ?? []) as Array<{ amount_inr: number; created_at: string }>) {
    take(plan, planI, s.created_at, s.amount_inr, "Studio subscription");
  }

  const one = businessIds.length === 1 ? businessIds[0] : null;
  return assemble(
    period,
    keys,
    [
      { key: "classes", label: "Classes", by: classes, items: classesI, href: one ? `/business/${one}/invoices` : undefined },
      { key: "memberships", label: "Memberships", by: memberships, items: membershipsI, href: one ? `/business/${one}/memberships` : undefined },
      /* ⚠⚠ THIS LINE STAYS THOUGH EVENTS ARE GONE (29 Sep 2026, Rule 9: money).
         Four paid event orders are on production and their payments are real
         money a business took. Dropping the bucket would not drop them — the
         `else` below would fold them into CLASSES, and a ledger line would state
         a number that is not what it says it is. A historical line that reads ₹0
         for everybody who never sold a ticket is honest; a Classes figure with
         somebody else's ticket money in it is not. */
      /* ⚠ and it is the one line hidden at ₹0 (2 Oct 2026): every other line is
         drawn at zero so the breakup says what it counts, and a zero line for a
         feature nobody can use any more would say something untrue */
      { key: "events", label: "Tickets & entries", by: events, items: eventsI, hideAtZero: true },
      /* ⚠ THE NOTES ARE GONE (27 Sep 2026) — a line on a ledger says WHAT and
         HOW MUCH, and each of these said a sentence about the accounting
         instead. The two facts worth keeping are recorded here: an ENQUIRY's
         money was recorded by the business as received (nothing moved through
         DanceOS), and an ASSET falls in the period it was ADDED because an
         asset carries no purchase date. */
      /* ⚠ THIS LINK WAS DEAD FOR A DAY (fixed 27 Sep 2026, evening). It pointed
         at `/inbox`, and enquiries LEFT the Inbox that morning — so the one row
         on the ledger that says where this money came from opened a desk that no
         longer holds any of it. Found by grepping for what the word "Enquiries"
         still points at while moving the tab to a tool, not by a run: no test
         presses a revenue row's link, and a link that opens the wrong screen
         fails nothing. ⚠ It carries `?as=` when the ledger is one business's, so
         the desk it opens is scoped the way the tile's is. */
      { key: "enquiries", label: "Enquiries", by: enquiries, items: enquiriesI, href: one ? `/business/${one}/enquiries` : "/enquiries" },
    ],
    [
      { key: "pay", label: "What you paid your people", by: pay, items: payI, href: one ? `/business/${one}/earnings` : undefined },
      { key: "refunds", label: "Refunds", by: refunded, items: refundedI, href: one ? `/business/${one}/refunds` : undefined },
      { key: "assets", label: "Assets bought", by: bought, items: boughtI, href: one ? `/business/${one}/assets` : undefined },
      { key: "plan", label: "DanceOS subscription", by: plan, items: planI, href: "/subscription" },
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
  nowIso: string,
  /** the businesses this person OWNS — see `findMyEarnings` (2 Oct 2026) */
  excludeBusinessIds: readonly string[] = []
): Promise<EarningsReport> {
  const { from, keys } = windowFor(nowIso, period);
  let q = supabase
    .from("payouts")
    .select("amount_inr, paid_on, businesses (name)")
    .eq("user_id", userId);
  if (excludeBusinessIds.length) q = q.not("business_id", "in", `(${excludeBusinessIds.join(",")})`);
  const { data, error } = await q
    .in("status", ["done", "in_transit"])
    .is("deleted_at", null)
    .gte("paid_on", from.slice(0, 10))
    .limit(MAX_ROWS);
  if (error) throw error;

  const taught: Bucketed = new Map();
  const taughtI: Itemed = new Map();
  type Row = { amount_inr: number; paid_on: string; businesses?: { name: string } | Array<{ name: string }> | null };
  for (const p of (data ?? []) as unknown as Row[]) {
    const k = bucketKeyOf(dayToIso(p.paid_on), period);
    add(taught, k, p.amount_inr);
    /* which studio paid it — the row behind the line (2 Oct 2026) */
    addItem(taughtI, k, { label: single(p.businesses)?.name ?? "A studio", amountInr: p.amount_inr, at: dayToIso(p.paid_on) });
  }
  return assemble(
    period,
    keys,
    [{ key: "teaching", label: "Paid by studios", by: taught, items: taughtI, href: "/earnings" }],
    [],
    (data?.length ?? 0) < MAX_ROWS
  );
}

/** ⚠⚠ WHAT A CREW TOOK (2 Oct 2026, the user: "earnings for crews is missing").
 *
 *  A crew sells no seat and no pass and is paid by no studio — the one money a
 *  crew has in DanceOS is an ENQUIRY: a celebration, a corporate show or a
 *  collaboration, quoted by its leader, with the advance and the balance
 *  RECORDED as received (`record_enquiry_payment`, the same rule a studio's
 *  enquiry money follows — nothing moves through DanceOS). So that is the whole
 *  revenue, bucketed exactly as `findBusinessEarnings` buckets it, and there is
 *  no expense half: a crew employs nobody and buys nothing here, the same fact a
 *  person's ledger states. ⚠ Readable by the LEADER only — the quotes' policy
 *  admits the crew's leader (`20260918160000`), which is who opens this desk. */
export async function findCrewEarnings(supabase: SupabaseClient, crewId: string, period: Period, nowIso: string): Promise<EarningsReport> {
  const { keys } = windowFor(nowIso, period);
  const { data, error } = await supabase
    .from("enquiry_quotes")
    .select("cost_inr, advance_inr, advance_paid_at, full_paid_at, enquiries (type_key, profiles (full_name))")
    .eq("crew_id", crewId)
    .is("deleted_at", null)
    .limit(MAX_ROWS);
  if (error) throw error;
  const enquiries: Bucketed = new Map();
  const enquiriesI: Itemed = new Map();
  const take = (at: string, amountInr: number, label: string) => {
    const k = bucketKeyOf(at, period);
    add(enquiries, k, amountInr);
    addItem(enquiriesI, k, { label, amountInr, at });
  };
  type Named = { full_name: string | null };
  type QuoteRow = {
    cost_inr: number;
    advance_inr: number;
    advance_paid_at: string | null;
    full_paid_at: string | null;
    enquiries?: { type_key: string; profiles?: Named | Named[] | null } | Array<{ type_key: string; profiles?: Named | Named[] | null }> | null;
  };
  for (const q of (data ?? []) as unknown as QuoteRow[]) {
    const e = single(q.enquiries);
    const what = enquiryWords(e?.type_key);
    const who = single(e?.profiles)?.full_name;
    const tail = who ? ` — ${who}` : "";
    if (q.advance_paid_at) take(q.advance_paid_at, q.advance_inr, `${what} advance${tail}`);
    if (q.full_paid_at) take(q.full_paid_at, Math.max(0, q.cost_inr - q.advance_inr), `${what} balance${tail}`);
  }
  return assemble(
    period,
    keys,
    [{ key: "enquiries", label: "Enquiries", by: enquiries, items: enquiriesI, href: `/crews/${crewId}/manage/enquiries` }],
    [],
    (data?.length ?? 0) < MAX_ROWS
  );
}

export { EARNING_TINT };
