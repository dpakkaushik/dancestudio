import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import type {
  MyEarnings,
  PayableSession,
  PayoutMethod,
  PayoutRecord,
  PayoutStatus,
  PersonPayHistory,
  PersonPayLedger,
  PayoutWithSessions,
  StudioEarning,
  BusinessPayLedger,
} from "@/types/payout";

/** Step 13 money reads. Nothing here computes an amount that gets written —
 *  record_payout counts the total server-side from the rates on record. These
 *  queries only say what is owed and what has been settled.
 *
 *  Reads are plain RLS-shaped queries: `payouts` and `payout_lines` admit the
 *  studio's OWNER and the person paid, and nobody else — a trainer has no
 *  business reading what another trainer earns. */

/** Sessions are only "taught" once they have ended, and a classPerson stops accruing
 *  the moment it is closed: somebody taken off the team is still owed for the
 *  sessions they actually took, but not for the ones that ran afterwards. */
const accrualCutoff = (classPersonDeletedAt: string | null, nowIso: string): string =>
  classPersonDeletedAt && classPersonDeletedAt < nowIso ? classPersonDeletedAt : nowIso;

const MAX_CLAIMS = 500;
const MAX_SESSIONS = 2000;
const MAX_LINES = 4000;
/** ⚠ WAS 60, AND 60 IS A PAGE SIZE PRETENDING TO BE A GUARD (21 Sep 2026).
 *  `paidTotal` and `inTransitTotal` are SUMMED off this read, so a studio that
 *  had recorded a 61st payment got a "Settled" figure that was quietly short —
 *  and unlike the income side's 4,000 there was no `complete` flag to say so.
 *  The card states ONE total, so a partial sum is a wrong number rather than a
 *  short list (the 28 Aug rule). It is a real guard now, and it is reported. */
const MAX_PAYOUTS = 4000;

interface ClassPersonRow {
  id: string;
  class_id: string;
  user_id: string;
  kind: "artist" | "assistant";
  pay_per_session_inr: number;
  created_at: string;
  deleted_at: string | null;
  profiles: { full_name: string } | null;
  classes: { style: string; level: string } | null;
}

interface SessionRow {
  id: string;
  class_id: string;
  starts_at: string;
  ends_at: string;
}

interface LineRow {
  payout_id: string;
  session_id: string;
  user_id: string;
  rate_inr: number;
}

interface PayoutRow {
  id: string;
  user_id: string;
  amount_inr: number;
  status: PayoutStatus;
  method: PayoutMethod;
  provider_ref: string | null;
  paid_on: string;
  note: string | null;
  profiles: { full_name: string } | null;
}

const CLAIM_SELECT =
  "id, class_id, user_id, kind, pay_per_session_inr, created_at, deleted_at, profiles (full_name), classes (style, level)";
const PAYOUT_SELECT =
  "id, user_id, amount_inr, status, method, provider_ref, paid_on, note, profiles (full_name)";

/** What this studio owes its people, and what it has settled.
 *
 *  Confirmed classPeople are read WITHOUT the deleted_at filter on purpose: Step 12b's
 *  removal closes a person's classPeople, and the work they did before that is still
 *  owed. `accrualCutoff` is what keeps that honest. */
export async function findBusinessPayLedger(
  supabase: SupabaseClient,
  businessId: string,
  nowIso: string
): Promise<BusinessPayLedger> {
  const [classPeopleRes, sessionsRes, linesRes, payoutsRes] = await Promise.all([
    supabase
      .from("class_people")
      .select(CLAIM_SELECT)
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(MAX_CLAIMS),
    supabase
      .from("class_sessions")
      .select("id, class_id, starts_at, ends_at")
      .eq("business_id", businessId)
      .lt("ends_at", nowIso)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(MAX_SESSIONS),
    supabase
      .from("payout_lines")
      .select("payout_id, session_id, user_id, rate_inr")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .limit(MAX_LINES),
    supabase
      .from("payouts")
      .select(PAYOUT_SELECT)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("paid_on", { ascending: false })
      .limit(MAX_PAYOUTS),
  ]);

  for (const [what, res] of [
    ["classPeople", classPeopleRes],
    ["sessions", sessionsRes],
    ["lines", linesRes],
    ["payouts", payoutsRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payouts.findBusinessLedger(${what}) failed: ${res.error.message}`);
    }
  }

  const classPeople = (classPeopleRes.data ?? []) as unknown as ClassPersonRow[];
  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];
  const lines = (linesRes.data ?? []) as unknown as LineRow[];
  const payoutRows = (payoutsRes.data ?? []) as unknown as PayoutRow[];

  const settled = new Set(lines.map((l) => `${l.session_id}:${l.user_id}`));
  const sessionsByClass = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const list = sessionsByClass.get(s.class_id);
    if (list) list.push(s);
    else sessionsByClass.set(s.class_id, [s]);
  }

  const byPerson = new Map<string, PersonPayLedger>();
  for (const classPerson of classPeople) {
    const cutoff = accrualCutoff(classPerson.deleted_at, nowIso);
    const unpaid: PayableSession[] = [];
    for (const s of sessionsByClass.get(classPerson.class_id) ?? []) {
      if (s.ends_at >= cutoff) continue;
      if (settled.has(`${s.id}:${classPerson.user_id}`)) continue;
      unpaid.push({
        sessionId: s.id,
        classId: classPerson.class_id,
        classTitle: classPerson.classes ? dosClassLabel(classPerson.classes.style, classPerson.classes.level) : "Class",
        classStyle: classPerson.classes?.style ?? "",
        startsAt: s.starts_at,
        rateInr: classPerson.pay_per_session_inr,
      });
    }

    const existing = byPerson.get(classPerson.user_id);
    if (existing) {
      existing.unpaid.push(...unpaid);
      existing.owedInr += unpaid.reduce((a, u) => a + u.rateInr, 0);
      // a live classPerson anywhere means they are still on the team
      existing.offTeam = existing.offTeam && classPerson.deleted_at !== null;
    } else {
      byPerson.set(classPerson.user_id, {
        userId: classPerson.user_id,
        personName: classPerson.profiles?.full_name ?? "Someone",
        kind: classPerson.kind,
        unpaid,
        owedInr: unpaid.reduce((a, u) => a + u.rateInr, 0),
        paidInr: 0,
        paidSessions: 0,
        offTeam: classPerson.deleted_at !== null,
      });
    }
  }

  for (const line of lines) {
    const person = byPerson.get(line.user_id);
    if (!person) continue;
    person.paidInr += line.rate_inr;
    person.paidSessions += 1;
  }

  const linesByPayout = new Map<string, number>();
  for (const line of lines) {
    linesByPayout.set(line.payout_id, (linesByPayout.get(line.payout_id) ?? 0) + 1);
  }

  const payouts: PayoutRecord[] = payoutRows.map((p) => ({
    id: p.id,
    userId: p.user_id,
    personName: p.profiles?.full_name ?? "Someone",
    amountInr: p.amount_inr,
    status: p.status,
    method: p.method,
    providerRef: p.provider_ref,
    paidOn: p.paid_on,
    note: p.note,
    sessionCount: linesByPayout.get(p.id) ?? 0,
  }));

  const people = [...byPerson.values()].sort(
    (a, b) => b.owedInr - a.owedInr || a.personName.localeCompare(b.personName)
  );

  return {
    people,
    owedTotal: people.reduce((a, p) => a + p.owedInr, 0),
    paidTotal: payouts.filter((p) => p.status === "done").reduce((a, p) => a + p.amountInr, 0),
    inTransitTotal: payouts
      .filter((p) => p.status !== "done")
      .reduce((a, p) => a + p.amountInr, 0),
    payouts,
    /* ⚠ REPORTED, LIKE THE INCOME SIDE'S (21 Sep 2026). Four reads here are
       capped and none of them said so, while `findBusinessIncome` has surfaced
       `complete` since 28 Aug — so a studio big enough to fill a guard read a
       short total on this half and a warned one on the other. */
    complete:
      (classPeopleRes.data?.length ?? 0) < MAX_CLAIMS &&
      (sessionsRes.data?.length ?? 0) < MAX_SESSIONS &&
      (linesRes.data?.length ?? 0) < MAX_LINES &&
      (payoutsRes.data?.length ?? 0) < MAX_PAYOUTS,
  };
}

/** ⚠⚠ EVERY PAYMENT THIS BUSINESS HAS MADE TO ONE PERSON (29 Sep 2026, the
 *  user: "Team payment history to be a button called History which should show
 *  all transactions with that particular person on a different page").
 *
 *  The member sheet drew the last SIX inline and had no way to reach the rest —
 *  so a studio that had paid somebody monthly for a year could see half of it
 *  and the total said something the list did not show. This is the whole of it,
 *  with the SESSIONS each payment covered, which is the one thing the desk's
 *  `PayoutRecord` only counts.
 *
 *  ⚠ NARROW ON PURPOSE. `findBusinessPayLedger` reads the studio's whole ledger
 *  (four queries, up to 4,000 rows each) to answer "who is owed what"; this
 *  answers one person and reads only what that needs. A page about one person
 *  must not cost the desk's read.
 *
 *  ⚠ RLS IS THE CEILING AND `user_id` IS SAID OUT LOUD. `payouts` admits the
 *  business's owner AND the payee, so leaning on the policy to mean "this
 *  person" would hand an owner every payout on the business — the fifth time
 *  this file's own rule has had to be written down. */
export async function findPersonPayHistory(
  supabase: SupabaseClient,
  businessId: string,
  userId: string
): Promise<PersonPayHistory> {
  const [payoutsRes, linesRes] = await Promise.all([
    supabase
      .from("payouts")
      .select(PAYOUT_SELECT)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("paid_on", { ascending: false })
      .limit(MAX_PAYOUTS),
    supabase
      .from("payout_lines")
      .select("payout_id, session_id, rate_inr, class_sessions (starts_at, classes (style, level))")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(MAX_LINES),
  ]);
  for (const [what, res] of [
    ["payouts", payoutsRes],
    ["lines", linesRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payouts.findPersonHistory(${what}) failed: ${res.error.message}`);
    }
  }

  const rows = (payoutsRes.data ?? []) as unknown as PayoutRow[];
  const lines = (linesRes.data ?? []) as unknown as Array<{
    payout_id: string;
    session_id: string;
    rate_inr: number;
    class_sessions: { starts_at: string; classes: { style: string; level: string } | null } | null;
  }>;

  const byPayout = new Map<string, PayoutWithSessions["sessions"]>();
  for (const l of lines) {
    const list = byPayout.get(l.payout_id) ?? [];
    list.push({
      sessionId: l.session_id,
      classTitle: l.class_sessions?.classes
        ? dosClassLabel(l.class_sessions.classes.style, l.class_sessions.classes.level)
        : "Class",
      startsAt: l.class_sessions?.starts_at ?? "",
      rateInr: l.rate_inr,
    });
    byPayout.set(l.payout_id, list);
  }
  for (const list of byPayout.values()) list.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const payouts: PayoutWithSessions[] = rows.map((p) => {
    const sessions = byPayout.get(p.id) ?? [];
    return {
      id: p.id,
      userId: p.user_id,
      personName: p.profiles?.full_name ?? "Someone",
      amountInr: p.amount_inr,
      status: p.status,
      method: p.method,
      providerRef: p.provider_ref,
      paidOn: p.paid_on,
      note: p.note,
      sessionCount: sessions.length,
      sessions,
    };
  });

  return {
    userId,
    personName: rows[0]?.profiles?.full_name ?? "",
    payouts,
    /* ⚠ SETTLED AND NOT-YET ARE TWO FIGURES, never one "paid" total: a payout
       recorded `in_transit` is money the studio says it has SENT, and printing
       it beside money that landed is the classPerson `otherPaidInr` was split out to
       stop making (20 Sep 2026). */
    paidInr: payouts.filter((p) => p.status === "done").reduce((a, p) => a + p.amountInr, 0),
    pendingInr: payouts.filter((p) => p.status !== "done").reduce((a, p) => a + p.amountInr, 0),
    sessionsPaid: lines.length,
    complete: rows.length < MAX_PAYOUTS && lines.length < MAX_LINES,
  };
}

interface MyClassPersonRow extends ClassPersonRow {
  business_id: string;
  businesses: { name: string } | null;
}

interface MyPayoutRow extends PayoutRow {
  business_id: string;
  businesses: { name: string } | null;
}

/** The teaching side of the earnings screen: what each studio owes me and what
 *  they have paid. Every row is my own — RLS admits me to my classPeople and to
 *  payouts where I am the payee. */
export async function findMyEarnings(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string
): Promise<MyEarnings> {
  const [classPeopleRes, payoutsRes, linesRes] = await Promise.all([
    supabase
      .from("class_people")
      .select(`${CLAIM_SELECT}, business_id, businesses (name)`)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(MAX_CLAIMS),
    supabase
      .from("payouts")
      .select(`${PAYOUT_SELECT}, business_id, businesses (name)`)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("paid_on", { ascending: false })
      .limit(MAX_PAYOUTS),
    supabase
      .from("payout_lines")
      .select("payout_id, session_id, user_id, rate_inr")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(MAX_LINES),
  ]);

  for (const [what, res] of [
    ["classPeople", classPeopleRes],
    ["payouts", payoutsRes],
    ["lines", linesRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payouts.findMyEarnings(${what}) failed: ${res.error.message}`);
    }
  }

  const classPeople = (classPeopleRes.data ?? []) as unknown as MyClassPersonRow[];
  const payoutRows = (payoutsRes.data ?? []) as unknown as MyPayoutRow[];
  const lines = (linesRes.data ?? []) as unknown as LineRow[];

  const classIds = [...new Set(classPeople.map((c) => c.class_id))];
  let sessions: SessionRow[] = [];
  if (classIds.length > 0) {
    const { data, error } = await supabase
      .from("class_sessions")
      .select("id, class_id, starts_at, ends_at")
      .in("class_id", classIds)
      .lt("ends_at", nowIso)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(MAX_SESSIONS);
    if (error) {
      throw new Error(`payouts.findMyEarnings(sessions) failed: ${error.message}`);
    }
    sessions = (data ?? []) as unknown as SessionRow[];
  }

  const sessionsByClass = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const list = sessionsByClass.get(s.class_id);
    if (list) list.push(s);
    else sessionsByClass.set(s.class_id, [s]);
  }

  const byBusiness = new Map<string, StudioEarning & { rates: Set<number> }>();
  for (const classPerson of classPeople) {
    const cutoff = accrualCutoff(classPerson.deleted_at, nowIso);
    const taught = (sessionsByClass.get(classPerson.class_id) ?? []).filter((s) => s.ends_at < cutoff);
    const row = byBusiness.get(classPerson.business_id) ?? {
      businessId: classPerson.business_id,
      businessName: classPerson.businesses?.name ?? "A studio",
      sessions: 0,
      ratePerSessionInr: null,
      earnedInr: 0,
      paidInr: 0,
      dueInr: 0,
      otherPaidInr: 0,
      rates: new Set<number>(),
    };
    row.sessions += taught.length;
    row.earnedInr += taught.length * classPerson.pay_per_session_inr;
    if (taught.length > 0) row.rates.add(classPerson.pay_per_session_inr);
    byBusiness.set(classPerson.business_id, row);
  }

  const linesByPayout = new Map<string, number>();
  for (const line of lines) {
    linesByPayout.set(line.payout_id, (linesByPayout.get(line.payout_id) ?? 0) + 1);
  }

  /* ⚠ WHAT WAS SETTLED, SPLIT BY WHAT IT WAS FOR (20 Sep 2026, the user:
     "Earnings make sure to check all revenue sources … according to there
     revenue sources"; Rule 9 — this is money owed).
     `record_payout` bills for SESSIONS and writes a line per session;
     `record_team_payment` (19 Sep, R35) writes an amount the owner states with
     NO lines, because a studio could not otherwise pay its front desk at all.
     Both are `payouts` rows, and this read summed them together — so a salary
     cancelled teaching money the studio still owed, and a person who only ever
     worked the desk had their payment dropped from the totals entirely because
     `byBusiness` is keyed on CLAIMS and they hold none. A payout with lines nets
     against sessions; one without is its own figure and nets against nothing. */
  const paidByBusiness = new Map<string, number>();
  const otherByBusiness = new Map<string, { amount: number; name: string }>();
  for (const p of payoutRows) {
    if (p.status !== "done") continue;
    if ((linesByPayout.get(p.id) ?? 0) > 0) {
      paidByBusiness.set(p.business_id, (paidByBusiness.get(p.business_id) ?? 0) + p.amount_inr);
    } else {
      const at = otherByBusiness.get(p.business_id) ?? { amount: 0, name: p.businesses?.name ?? "A studio" };
      at.amount += p.amount_inr;
      otherByBusiness.set(p.business_id, at);
    }
  }
  /* a studio that has only ever paid you off the register still gets a row —
     otherwise the money is in WHO HAS PAID YOU and in none of the totals */
  for (const [businessId, at] of otherByBusiness) {
    if (!byBusiness.has(businessId)) {
      byBusiness.set(businessId, { businessId, businessName: at.name, sessions: 0, ratePerSessionInr: null, earnedInr: 0, paidInr: 0, dueInr: 0, otherPaidInr: 0, rates: new Set<number>() });
    }
  }

  const studios: StudioEarning[] = [...byBusiness.values()]
    .map(({ rates, ...row }) => {
      const paid = paidByBusiness.get(row.businessId) ?? 0;
      return {
        ...row,
        // one rate is the common case, so the row can print it like the
        // prototype does ("14 sessions · ₹900"); mixed rates print nothing
        ratePerSessionInr: rates.size === 1 ? [...rates][0] : null,
        paidInr: paid,
        dueInr: Math.max(0, row.earnedInr - paid),
        otherPaidInr: otherByBusiness.get(row.businessId)?.amount ?? 0,
      };
    })
    .sort((a, b) => b.earnedInr - a.earnedInr || a.businessName.localeCompare(b.businessName));

  return {
    studios,
    earnedTotal: studios.reduce((a, s) => a + s.earnedInr, 0),
    /* the Settled tile is every rupee that reached you — sessions and the rest */
    paidTotal: studios.reduce((a, s) => a + s.paidInr + s.otherPaidInr, 0),
    dueTotal: studios.reduce((a, s) => a + s.dueInr, 0),
    payouts: payoutRows.map((p) => ({
      id: p.id,
      userId: p.user_id,
      personName: p.profiles?.full_name ?? "Someone",
      businessName: p.businesses?.name ?? "A studio",
      amountInr: p.amount_inr,
      status: p.status,
      method: p.method,
      providerRef: p.provider_ref,
      paidOn: p.paid_on,
      note: p.note,
      sessionCount: linesByPayout.get(p.id) ?? 0,
    })),
  };
}

export async function recordPayout(
  supabase: SupabaseClient,
  input: {
    businessId: string;
    userId: string;
    sessionIds: string[];
    method: PayoutMethod;
    status: PayoutStatus;
    providerRef?: string | null;
    paidOn?: string | null;
    note?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.rpc("record_payout", {
    p_business_id: input.businessId,
    p_user_id: input.userId,
    p_session_ids: input.sessionIds,
    p_method: input.method,
    p_status: input.status,
    p_provider_ref: input.providerRef ?? null,
    p_paid_on: input.paidOn ?? null,
    p_note: input.note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** PAYING SOMEBODY ON THE TEAM (19 Sep 2026, the user: "should be able to pay
 *  them, track payment history and should be part of expenses in the earnings").
 *  `recordPayout` bills for SESSIONS TAUGHT and refuses anything else, so a
 *  studio could not pay its front-desk staff at all. This is a payout with an
 *  amount the owner states and no session lines — the same ledger, so the
 *  Earnings desk counts it as money out the moment it is written. */
export async function recordTeamPayment(
  supabase: SupabaseClient,
  input: {
    businessId: string;
    userId: string;
    amountInr: number;
    method: PayoutMethod;
    status: PayoutStatus;
    paidOn?: string | null;
    note?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.rpc("record_team_payment", {
    p_business_id: input.businessId,
    p_user_id: input.userId,
    p_amount_inr: input.amountInr,
    p_method: input.method,
    p_status: input.status,
    p_paid_on: input.paidOn ?? null,
    p_note: input.note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/* ⚠ NO SEPARATE PER-MEMBER READ (19 Sep 2026). "Track payment history" is
   `findBusinessPayLedger`'s `payouts`, which the Team desk already has to hand and
   which carries `userId` on every row — one query for the whole desk rather than
   one per person opened. The history is that list, filtered. */

export async function setPayoutStatus(
  supabase: SupabaseClient,
  payoutId: string,
  status: PayoutStatus,
  providerRef?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("set_payout_status", {
    p_payout_id: payoutId,
    p_status: status,
    p_provider_ref: providerRef ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function voidPayout(supabase: SupabaseClient, payoutId: string): Promise<void> {
  const { error } = await supabase.rpc("void_payout", { p_payout_id: payoutId });
  if (error) {
    throw new Error(error.message);
  }
}
