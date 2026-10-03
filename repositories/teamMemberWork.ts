import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";

/** WHAT ONE PERSON HAS DONE FOR ONE TEAM (3 Oct 2026, the user: *"better designed
 *  team history page according to team member card — should have payment
 *  details, artist stats and performance for that team"*).
 *
 *  ⚠ SCOPED TO THE BUSINESS AND THE PERSON, AND SAID OUT LOUD. Every read names
 *  `business_id = this one`; RLS admits a business's runners to its rows, and
 *  that is a ceiling, not a scope — this is "what they did HERE", never their
 *  whole record, which is their own Stats page's job.
 *
 *  ⚠ THE PAY LEDGER'S OWN RULES, so the two pages cannot disagree: a session is
 *  TAUGHT once it has ended, a claim stops counting the moment it was closed
 *  (`accrualCutoff` in `repositories/payouts.ts` — somebody taken off the team
 *  is still credited for the sessions they actually took), and OWED is a taught
 *  session at the claim's own rate that no payout line has settled yet.
 *
 *  ⚠ NOTHING IS STORED. Dancers are attendance rows (Step 25's rule — a seat
 *  nobody marked is not a session danced), and every figure is counted off the
 *  same rows the class list under it prints. */

export interface TeamMemberClass {
  classId: string;
  shareSlug: string;
  title: string;
  style: string;
  kind: "artist" | "assistant";
  ratePerSessionInr: number;
  /** sessions here that have ended while they were on the class */
  held: number;
  upcoming: number;
  /** attendance rows across those sessions */
  dancers: number;
  /** seats booked across those sessions — what `dancers` is measured against */
  booked: number;
  /** capacity × sessions held — what a full room would have been */
  seats: number;
  nextAt: string | null;
  lastAt: string | null;
  closed: boolean;
}

export interface TeamMemberWork {
  taught: number;
  assisted: number;
  minutes: number;
  upcoming: number;
  /** attendance rows on the sessions they took */
  dancers: number;
  /** distinct people among them */
  distinctDancers: number;
  /** enrolled seats on those sessions, for the turn-up rate */
  booked: number;
  /** capacity × sessions held, for the fill rate */
  seats: number;
  /** taught, not yet settled, at each claim's own rate */
  owedInr: number;
  owedSessions: number;
  firstAt: string | null;
  lastAt: string | null;
  months: Array<{ key: string; label: string; n: number }>;
  styles: Array<{ style: string; n: number }>;
  classes: TeamMemberClass[];
  complete: boolean;
}

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const n = (v: unknown) => Number(v ?? 0);

const IST = "Asia/Kolkata";
const monthKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);

function lastSixMonths(now: Date): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const [y, m] = monthKey(now.toISOString()).split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(d),
    });
  }
  return out;
}

const MAX_CLAIMS = 300;
const MAX_ROWS = 4000;

export async function findTeamMemberWork(supabase: SupabaseClient, businessId: string, userId: string, now: Date = new Date()): Promise<TeamMemberWork> {
  const nowIso = now.toISOString();
  const { data: claimData, error: claimErr } = await supabase
    .from("class_people")
    .select("id, class_id, kind, pay_per_session_inr, deleted_at, classes (style, level, share_slug, capacity, deleted_at)")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .limit(MAX_CLAIMS);
  if (claimErr) throw new Error(`teamMemberWork.claims failed: ${claimErr.message}`);

  type ClaimRow = {
    id: string;
    class_id: string;
    kind: "artist" | "assistant";
    pay_per_session_inr: number;
    deleted_at: string | null;
    classes: One<{ style: string; level: string; share_slug: string; capacity: number; deleted_at: string | null }>;
  };
  const claims = (claimData ?? []) as unknown as ClaimRow[];
  const classIds = [...new Set(claims.map((c) => c.class_id))];

  const empty: TeamMemberWork = {
    taught: 0,
    assisted: 0,
    minutes: 0,
    upcoming: 0,
    dancers: 0,
    distinctDancers: 0,
    booked: 0,
    seats: 0,
    owedInr: 0,
    owedSessions: 0,
    firstAt: null,
    lastAt: null,
    months: lastSixMonths(now).map((m) => ({ ...m, n: 0 })),
    styles: [],
    classes: [],
    complete: true,
  };
  if (classIds.length === 0) return empty;

  const [sessionsRes, attendanceRes, bookingsRes, linesRes] = await Promise.all([
    supabase.from("class_sessions").select("id, class_id, starts_at, ends_at").eq("business_id", businessId).in("class_id", classIds).is("deleted_at", null).limit(MAX_ROWS),
    supabase.from("attendance").select("session_id, user_id").eq("business_id", businessId).in("class_id", classIds).is("deleted_at", null).limit(MAX_ROWS),
    supabase.from("class_bookings").select("session_id").eq("business_id", businessId).in("class_id", classIds).eq("status", "enrolled").is("deleted_at", null).limit(MAX_ROWS),
    supabase.from("payout_lines").select("session_id").eq("business_id", businessId).eq("user_id", userId).is("deleted_at", null).limit(MAX_ROWS),
  ]);
  for (const [what, res] of [
    ["sessions", sessionsRes],
    ["attendance", attendanceRes],
    ["bookings", bookingsRes],
    ["lines", linesRes],
  ] as const) {
    if (res.error) throw new Error(`teamMemberWork.${what} failed: ${res.error.message}`);
  }

  const sessions = (sessionsRes.data ?? []) as Array<{ id: string; class_id: string; starts_at: string; ends_at: string }>;
  const attendance = (attendanceRes.data ?? []) as Array<{ session_id: string; user_id: string | null }>;
  const bookings = (bookingsRes.data ?? []) as Array<{ session_id: string }>;
  const settled = new Set(((linesRes.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id));

  const attBySession = new Map<string, Array<string | null>>();
  for (const a of attendance) {
    const list = attBySession.get(a.session_id) ?? [];
    list.push(a.user_id);
    attBySession.set(a.session_id, list);
  }
  const bookedBySession = new Map<string, number>();
  for (const b of bookings) bookedBySession.set(b.session_id, (bookedBySession.get(b.session_id) ?? 0) + 1);

  const sessionsByClass = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = sessionsByClass.get(s.class_id) ?? [];
    list.push(s);
    sessionsByClass.set(s.class_id, list);
  }

  /* one row per CLASS — a person re-asked onto a class has two claims for one
     seat, and a session is credited ONCE (the 18 Sep stats rule) */
  const credited = new Set<string>();
  const people = new Set<string>();
  const byMonth = new Map<string, number>();
  const byStyle = new Map<string, number>();
  const rows = new Map<string, TeamMemberClass>();
  const out = { ...empty, months: empty.months };
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  for (const c of claims) {
    const cls = one(c.classes);
    if (!cls) continue;
    const cutoff = c.deleted_at && c.deleted_at < nowIso ? c.deleted_at : nowIso;
    const row =
      rows.get(c.class_id) ??
      ({
        classId: c.class_id,
        shareSlug: cls.share_slug,
        title: dosClassLabel(cls.style, cls.level),
        style: cls.style,
        kind: c.kind,
        ratePerSessionInr: n(c.pay_per_session_inr),
        held: 0,
        upcoming: 0,
        dancers: 0,
        booked: 0,
        seats: 0,
        nextAt: null,
        lastAt: null,
        closed: true,
      } as TeamMemberClass);
    if (c.deleted_at === null && cls.deleted_at === null) {
      row.closed = false;
      row.kind = c.kind;
      row.ratePerSessionInr = n(c.pay_per_session_inr);
    }
    for (const s of sessionsByClass.get(c.class_id) ?? []) {
      if (s.ends_at < cutoff) {
        if (credited.has(s.id)) continue;
        credited.add(s.id);
        const minutes = Math.max(0, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000));
        const att = attBySession.get(s.id) ?? [];
        row.held += 1;
        row.dancers += att.length;
        row.booked += bookedBySession.get(s.id) ?? 0;
        row.seats += n(cls.capacity);
        if (!row.lastAt || s.starts_at > row.lastAt) row.lastAt = s.starts_at;
        if (c.kind === "artist") out.taught += 1;
        else out.assisted += 1;
        out.minutes += minutes;
        out.dancers += att.length;
        out.booked += bookedBySession.get(s.id) ?? 0;
        out.seats += n(cls.capacity);
        for (const u of att) if (u) people.add(u);
        if (!settled.has(s.id) && n(c.pay_per_session_inr) > 0) {
          out.owedInr += n(c.pay_per_session_inr);
          out.owedSessions += 1;
        }
        const k = monthKey(s.starts_at);
        byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
        byStyle.set(cls.style, (byStyle.get(cls.style) ?? 0) + 1);
        if (!firstAt || s.starts_at < firstAt) firstAt = s.starts_at;
        if (!lastAt || s.starts_at > lastAt) lastAt = s.starts_at;
      } else if (s.starts_at > nowIso && c.deleted_at === null && cls.deleted_at === null) {
        if (credited.has(`u:${s.id}`)) continue;
        credited.add(`u:${s.id}`);
        row.upcoming += 1;
        out.upcoming += 1;
        if (!row.nextAt || s.starts_at < row.nextAt) row.nextAt = s.starts_at;
      }
    }
    rows.set(c.class_id, row);
  }

  return {
    ...out,
    distinctDancers: people.size,
    firstAt,
    lastAt,
    months: lastSixMonths(now).map((m) => ({ ...m, n: byMonth.get(m.key) ?? 0 })),
    styles: [...byStyle.entries()].map(([style, count]) => ({ style, n: count })).sort((a, b) => b.n - a.n || a.style.localeCompare(b.style)),
    classes: [...rows.values()].sort((a, b) => Number(a.closed) - Number(b.closed) || b.held - a.held || a.title.localeCompare(b.title)),
    complete: claims.length < MAX_CLAIMS && sessions.length < MAX_ROWS && attendance.length < MAX_ROWS && bookings.length < MAX_ROWS,
  };
}
