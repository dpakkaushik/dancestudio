import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MyEarnings,
  PayableSession,
  PayoutMethod,
  PayoutRecord,
  PayoutStatus,
  PersonPayLedger,
  StudioEarning,
  TenantPayLedger,
} from "@/types/payout";

/** Step 13 money reads. Nothing here computes an amount that gets written —
 *  record_payout counts the total server-side from the rates on record. These
 *  queries only say what is owed and what has been settled.
 *
 *  Reads are plain RLS-shaped queries: `payouts` and `payout_lines` admit the
 *  studio's OWNER and the person paid, and nobody else — a trainer has no
 *  business reading what another trainer earns. */

/** Sessions are only "taught" once they have ended, and a claim stops accruing
 *  the moment it is closed: somebody taken off the team is still owed for the
 *  sessions they actually took, but not for the ones that ran afterwards. */
const accrualCutoff = (claimDeletedAt: string | null, nowIso: string): string =>
  claimDeletedAt && claimDeletedAt < nowIso ? claimDeletedAt : nowIso;

const MAX_CLAIMS = 500;
const MAX_SESSIONS = 2000;
const MAX_LINES = 4000;
const MAX_PAYOUTS = 60;

interface ClaimRow {
  id: string;
  class_id: string;
  user_id: string;
  kind: "artist" | "assistant";
  pay_per_session_inr: number;
  created_at: string;
  deleted_at: string | null;
  profiles: { full_name: string } | null;
  classes: { title: string; style: string } | null;
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
  "id, class_id, user_id, kind, pay_per_session_inr, created_at, deleted_at, profiles (full_name), classes (title, style)";
const PAYOUT_SELECT =
  "id, user_id, amount_inr, status, method, provider_ref, paid_on, note, profiles (full_name)";

/** What this studio owes its people, and what it has settled.
 *
 *  Confirmed claims are read WITHOUT the deleted_at filter on purpose: Step 12b's
 *  removal closes a person's claims, and the work they did before that is still
 *  owed. `accrualCutoff` is what keeps that honest. */
export async function findTenantPayLedger(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso: string
): Promise<TenantPayLedger> {
  const [claimsRes, sessionsRes, linesRes, payoutsRes] = await Promise.all([
    supabase
      .from("class_claims")
      .select(CLAIM_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(MAX_CLAIMS),
    supabase
      .from("class_sessions")
      .select("id, class_id, starts_at, ends_at")
      .eq("tenant_id", tenantId)
      .lt("ends_at", nowIso)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(MAX_SESSIONS),
    supabase
      .from("payout_lines")
      .select("payout_id, session_id, user_id, rate_inr")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(MAX_LINES),
    supabase
      .from("payouts")
      .select(PAYOUT_SELECT)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("paid_on", { ascending: false })
      .limit(MAX_PAYOUTS),
  ]);

  for (const [what, res] of [
    ["claims", claimsRes],
    ["sessions", sessionsRes],
    ["lines", linesRes],
    ["payouts", payoutsRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payouts.findTenantLedger(${what}) failed: ${res.error.message}`);
    }
  }

  const claims = (claimsRes.data ?? []) as unknown as ClaimRow[];
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
  for (const claim of claims) {
    const cutoff = accrualCutoff(claim.deleted_at, nowIso);
    const unpaid: PayableSession[] = [];
    for (const s of sessionsByClass.get(claim.class_id) ?? []) {
      if (s.ends_at >= cutoff) continue;
      if (settled.has(`${s.id}:${claim.user_id}`)) continue;
      unpaid.push({
        sessionId: s.id,
        classId: claim.class_id,
        classTitle: claim.classes?.title ?? "Class",
        classStyle: claim.classes?.style ?? "",
        startsAt: s.starts_at,
        rateInr: claim.pay_per_session_inr,
      });
    }

    const existing = byPerson.get(claim.user_id);
    if (existing) {
      existing.unpaid.push(...unpaid);
      existing.owedInr += unpaid.reduce((a, u) => a + u.rateInr, 0);
      // a live claim anywhere means they are still on the team
      existing.offTeam = existing.offTeam && claim.deleted_at !== null;
    } else {
      byPerson.set(claim.user_id, {
        userId: claim.user_id,
        personName: claim.profiles?.full_name ?? "Someone",
        kind: claim.kind,
        unpaid,
        owedInr: unpaid.reduce((a, u) => a + u.rateInr, 0),
        paidInr: 0,
        paidSessions: 0,
        offTeam: claim.deleted_at !== null,
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
  };
}

interface MyClaimRow extends ClaimRow {
  tenant_id: string;
  tenants: { name: string } | null;
}

interface MyPayoutRow extends PayoutRow {
  tenant_id: string;
  tenants: { name: string } | null;
}

/** The teaching side of the earnings screen: what each studio owes me and what
 *  they have paid. Every row is my own — RLS admits me to my claims and to
 *  payouts where I am the payee. */
export async function findMyEarnings(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string
): Promise<MyEarnings> {
  const [claimsRes, payoutsRes, linesRes] = await Promise.all([
    supabase
      .from("class_claims")
      .select(`${CLAIM_SELECT}, tenant_id, tenants (name)`)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(MAX_CLAIMS),
    supabase
      .from("payouts")
      .select(`${PAYOUT_SELECT}, tenant_id, tenants (name)`)
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
    ["claims", claimsRes],
    ["payouts", payoutsRes],
    ["lines", linesRes],
  ] as const) {
    if (res.error) {
      throw new Error(`payouts.findMyEarnings(${what}) failed: ${res.error.message}`);
    }
  }

  const claims = (claimsRes.data ?? []) as unknown as MyClaimRow[];
  const payoutRows = (payoutsRes.data ?? []) as unknown as MyPayoutRow[];
  const lines = (linesRes.data ?? []) as unknown as LineRow[];

  const classIds = [...new Set(claims.map((c) => c.class_id))];
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

  const byTenant = new Map<string, StudioEarning & { rates: Set<number> }>();
  for (const claim of claims) {
    const cutoff = accrualCutoff(claim.deleted_at, nowIso);
    const taught = (sessionsByClass.get(claim.class_id) ?? []).filter((s) => s.ends_at < cutoff);
    const row = byTenant.get(claim.tenant_id) ?? {
      tenantId: claim.tenant_id,
      tenantName: claim.tenants?.name ?? "A studio",
      sessions: 0,
      ratePerSessionInr: null,
      earnedInr: 0,
      paidInr: 0,
      dueInr: 0,
      rates: new Set<number>(),
    };
    row.sessions += taught.length;
    row.earnedInr += taught.length * claim.pay_per_session_inr;
    if (taught.length > 0) row.rates.add(claim.pay_per_session_inr);
    byTenant.set(claim.tenant_id, row);
  }

  // what has actually been settled, per studio
  const paidByTenant = new Map<string, number>();
  for (const p of payoutRows) {
    if (p.status === "done") {
      paidByTenant.set(p.tenant_id, (paidByTenant.get(p.tenant_id) ?? 0) + p.amount_inr);
    }
  }

  const linesByPayout = new Map<string, number>();
  for (const line of lines) {
    linesByPayout.set(line.payout_id, (linesByPayout.get(line.payout_id) ?? 0) + 1);
  }

  const studios: StudioEarning[] = [...byTenant.values()]
    .map(({ rates, ...row }) => {
      const paid = paidByTenant.get(row.tenantId) ?? 0;
      return {
        ...row,
        // one rate is the common case, so the row can print it like the
        // prototype does ("14 sessions · ₹900"); mixed rates print nothing
        ratePerSessionInr: rates.size === 1 ? [...rates][0] : null,
        paidInr: paid,
        dueInr: Math.max(0, row.earnedInr - paid),
      };
    })
    .sort((a, b) => b.earnedInr - a.earnedInr || a.tenantName.localeCompare(b.tenantName));

  return {
    studios,
    earnedTotal: studios.reduce((a, s) => a + s.earnedInr, 0),
    paidTotal: studios.reduce((a, s) => a + s.paidInr, 0),
    dueTotal: studios.reduce((a, s) => a + s.dueInr, 0),
    payouts: payoutRows.map((p) => ({
      id: p.id,
      userId: p.user_id,
      personName: p.profiles?.full_name ?? "Someone",
      tenantName: p.tenants?.name ?? "A studio",
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
    tenantId: string;
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
    p_tenant_id: input.tenantId,
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
