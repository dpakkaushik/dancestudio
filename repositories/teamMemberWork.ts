import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import { findClassArtists } from "@/repositories/classPeople";

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
 *  same rows the class list under it prints.
 *
 *  ⚠⚠ TWO KINDS OF CLASS, SAID APART (4 Oct 2026, the user: *"detail to view
 *  difference between classes created by Studio or artist … should only show
 *  classes relevant to that particular team"*):
 *   · CREATED BY THIS BUSINESS — the classes it owns that they are confirmed on,
 *     as the person taking it or as an assistant. These are what the team pays
 *     for, so they alone feed the stats, the money and what is owed.
 *   · CREATED BY THEM, HELD HERE — their OWN artist page's classes in this
 *     studio's rooms (the venue accepted). The studio's team reads those classes
 *     and their sessions (the venue policies, 18 Sep 2026) and NOT their bookings
 *     or attendance, so the seats come from `session_seat_counts` — aggregate
 *     only, the same read every public card makes — and "dancers in" is not
 *     claimed at all. Nothing on them is owed by this business.
 *  ⚠ ROOM FULL is booked seats over capacity for BOTH kinds, so the one bar
 *  means one thing whoever made the class. */

export type TeamClassOrigin = "business" | "member";

export interface TeamMemberClass {
  classId: string;
  shareSlug: string;
  title: string;
  style: string;
  /** their role on it */
  kind: "artist" | "assistant";
  /** who made it: this business, or the member's own artist page */
  origin: TeamClassOrigin;
  /** the person taking the class — them, or somebody else when they assist */
  artistName: string | null;
  artistPhoto: string | null;
  artistUserId: string | null;
  /** the studio it is held at, and the room */
  venueName: string | null;
  /** the studio's profile picture, drawn on the Studio grouping's head */
  venuePhoto: string | null;
  room: string | null;
  /** what this business pays them a session; null on a class it did not make */
  ratePerSessionInr: number | null;
  /** sessions that have ended while they were on the class */
  held: number;
  upcoming: number;
  /** attendance rows across held sessions; null where this business cannot read them */
  dancers: number | null;
  /** seats booked across held sessions — what `dancers` is measured against */
  booked: number;
  /** ROOM FULL: booked over capacity, on held sessions, or on the ones to come
   *  when none has been held */
  fillBooked: number;
  fillSeats: number;
  fillBasis: "held" | "upcoming" | null;
  capacity: number;
  nextAt: string | null;
  lastAt: string | null;
  /** they are no longer on this class — kept, because the sessions they took
   *  still happened and still count */
  closed: boolean;
  /** WHY it is closed, so the screen says it in words rather than a bare
   *  "ENDED": the class was deleted, or they were taken off it */
  closedWhy: "deleted" | "removed" | null;
  /** EARNINGS (4 Oct 2026) — on a class this business made: what came in on the
   *  sessions they took (net of refunds handed back), and what is still owed to
   *  them for it. Zero on a class of their own, which brings this team nothing. */
  revenueInr: number;
  owedInr: number;
  owedSessions: number;
}

/** one payment in, or one refund out, on a session they were credited with */
export interface TeamRevenueEntry {
  id: string;
  kind: "payment" | "refund";
  classTitle: string;
  /** when the session ran */
  sessionAt: string | null;
  /** when the money moved */
  at: string;
  amountInr: number;
  method: string | null;
  payerName: string | null;
}

/** one session taken here at a rate and not paid yet */
export interface TeamOwedEntry {
  sessionId: string;
  classTitle: string;
  startsAt: string;
  rateInr: number;
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
  /** ⚠ EARNINGS (4 Oct 2026, the user: "break up first revenue for the team then
   *  … what was paid to them and what is still owed … whatever left is the Total
   *  earnings"). REVENUE is the money that came in on the sessions they took HERE
   *  — captured payments on those sessions' orders, a later-refunded payment
   *  included (it came in), with the processed refunds on them as their own
   *  line. Only this business's classes: their own classes held here bring the
   *  team nothing. ⚠ A seat paid with a pass brings no payment row — that money
   *  came in when the pass was sold — so it is not in this figure, and the
   *  screen says so rather than pricing it. */
  revenueGrossInr: number;
  revenueRefundedInr: number;
  /** ⚠ THE ENTRIES BEHIND EACH SECTION (4 Oct 2026, the user: "Earnings all
   *  section I mentioned should be collapsible with entries for it") — every
   *  payment and refund that makes up REVENUE, and every session that makes up
   *  STILL OWED, newest first. The same rows the totals are summed from, so a
   *  section's figure and its list cannot disagree. */
  revenueEntries: TeamRevenueEntry[];
  owedEntries: TeamOwedEntry[];
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

type ClassCols = {
  style: string;
  level: string;
  share_slug: string;
  capacity: number;
  room: string | null;
  venue_business_id: string | null;
  venue_status: string | null;
  deleted_at: string | null;
};
const CLASS_COLS = "style, level, share_slug, capacity, room, venue_business_id, venue_status, deleted_at";

type Session = { id: string; class_id: string; starts_at: string; ends_at: string };

/** HOW MANY CLASSES EACH MEMBER HAS HERE — the team card's Classes figure (4 Oct
 *  2026, the user: "Paid Payments and Classes for - Team Member Cards"). The SAME
 *  rule `findTeamMemberWork` lists by, so the card and the Member Detail page say
 *  one number: this business's classes they are confirmed on (a closed claim
 *  included — it still happened), plus their own artist page's published classes
 *  held in this studio's rooms. One claims read and one classes read for the
 *  whole team; the artist-page lookups run in parallel. Degrades to the claims
 *  half, never fails a desk. */
export async function findTeamClassCounts(supabase: SupabaseClient, businessId: string, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const ids = userIds.slice(0, 200);
  const [claimRes, pages] = await Promise.all([
    supabase.from("class_people").select("user_id, class_id").eq("business_id", businessId).in("user_id", ids).eq("status", "confirmed").limit(MAX_ROWS),
    Promise.all(
      ids.map(async (uid) => {
        const { data, error } = await supabase.rpc("artist_page_of", { p_user_id: uid });
        return [uid, error ? null : ((data as string | null) ?? null)] as const;
      }),
    ),
  ]);
  const byUser = new Map<string, Set<string>>();
  for (const r of (claimRes.data ?? []) as Array<{ user_id: string; class_id: string }>) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
    byUser.get(r.user_id)!.add(r.class_id);
  }
  const pageOwner = new Map<string, string>();
  for (const [uid, page] of pages) if (page && page !== businessId) pageOwner.set(page, uid);
  if (pageOwner.size) {
    /* audit-ok: scoped by the members' own pages AND this venue */
    const { data } = await supabase
      .from("classes")
      .select("id, business_id, status, deleted_at")
      .in("business_id", [...pageOwner.keys()])
      .eq("venue_business_id", businessId)
      .eq("venue_status", "accepted")
      .limit(MAX_ROWS);
    for (const c of (data ?? []) as Array<{ id: string; business_id: string; status: string; deleted_at: string | null }>) {
      if (c.deleted_at !== null || (c.status !== "published" && c.status !== "completed")) continue;
      const uid = pageOwner.get(c.business_id);
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, new Set());
      byUser.get(uid)!.add(c.id);
    }
  }
  for (const uid of ids) out.set(uid, byUser.get(uid)?.size ?? 0);
  return out;
}

export async function findTeamMemberWork(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  now: Date = new Date(),
  who: { businessName: string; memberName: string; memberPhoto: string | null } = { businessName: "", memberName: "", memberPhoto: null },
): Promise<TeamMemberWork> {
  const nowIso = now.toISOString();
  const [claimRes, pageRes] = await Promise.all([
    supabase
      .from("class_people")
      .select(`id, class_id, kind, pay_per_session_inr, deleted_at, classes (${CLASS_COLS})`)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .limit(MAX_CLAIMS),
    /* the member's OWN artist page — a definer read, and a failed one simply
       means there are no classes of theirs to show here */
    supabase.rpc("artist_page_of", { p_user_id: userId }),
  ]);
  if (claimRes.error) throw new Error(`teamMemberWork.claims failed: ${claimRes.error.message}`);

  type ClaimRow = {
    id: string;
    class_id: string;
    kind: "artist" | "assistant";
    pay_per_session_inr: number;
    deleted_at: string | null;
    classes: One<ClassCols>;
  };
  const claims = (claimRes.data ?? []) as unknown as ClaimRow[];
  const classIds = [...new Set(claims.map((c) => c.class_id))];

  /* ── THEIR OWN CLASSES, HELD HERE (4 Oct 2026) ── */
  const memberPage = pageRes.error ? null : ((pageRes.data as string | null) ?? null);
  type OwnClass = ClassCols & { id: string; status: string };
  let ownClasses: OwnClass[] = [];
  if (memberPage && memberPage !== businessId) {
    const { data } = await supabase
      .from("classes")
      .select(`id, status, ${CLASS_COLS}`)
      .eq("business_id", memberPage)
      .eq("venue_business_id", businessId)
      .eq("venue_status", "accepted")
      .limit(MAX_CLAIMS);
    /* audit-ok: scoped by the member's page AND this venue */
    /* published (or run) only — a draft of theirs is not on this studio's floor yet */
    ownClasses = ((data ?? []) as unknown as OwnClass[]).filter((c) => !classIds.includes(c.id) && c.deleted_at === null && (c.status === "published" || c.status === "completed"));
  }
  const ownIds = ownClasses.map((c) => c.id);

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
    revenueGrossInr: 0,
    revenueRefundedInr: 0,
    revenueEntries: [],
    owedEntries: [],
    firstAt: null,
    lastAt: null,
    months: lastSixMonths(now).map((m) => ({ ...m, n: 0 })),
    styles: [],
    classes: [],
    complete: true,
  };
  if (classIds.length === 0 && ownIds.length === 0) return empty;

  const none = { data: [] as unknown[], error: null };
  const [sessionsRes, ownSessionsRes, attendanceRes, linesRes, artists, paymentsRes, refundsRes] = await Promise.all([
    classIds.length
      ? supabase.from("class_sessions").select("id, class_id, starts_at, ends_at").eq("business_id", businessId).in("class_id", classIds).is("deleted_at", null).limit(MAX_ROWS)
      : Promise.resolve(none),
    /* audit-ok: the member's own classes at this venue, by id */
    ownIds.length ? supabase.from("class_sessions").select("id, class_id, starts_at, ends_at").in("class_id", ownIds).is("deleted_at", null).limit(MAX_ROWS) : Promise.resolve(none),
    classIds.length
      ? supabase.from("attendance").select("session_id, user_id").eq("business_id", businessId).in("class_id", classIds).is("deleted_at", null).limit(MAX_ROWS)
      : Promise.resolve(none),
    supabase.from("payout_lines").select("session_id").eq("business_id", businessId).eq("user_id", userId).is("deleted_at", null).limit(MAX_ROWS),
    findClassArtists(supabase, classIds).catch(() => new Map()),
    /* EARNINGS — the money in on this business's classes they are on; payments
       carry no class or session, so the order is the spine (findClassMoney's) */
    classIds.length
      ? supabase
          .from("payments")
          .select("id, amount_inr, method, created_at, user_id, orders!inner (class_id, session_id)")
          .eq("business_id", businessId)
          .in("orders.class_id", classIds)
          .in("status", ["captured", "refunded"])
          .is("deleted_at", null)
          .limit(MAX_ROWS)
      : Promise.resolve(none),
    classIds.length
      ? supabase
          .from("refunds")
          .select("id, amount_inr, created_at, updated_at, user_id, orders!inner (class_id, session_id)")
          .eq("business_id", businessId)
          .in("orders.class_id", classIds)
          .eq("status", "processed")
          .is("deleted_at", null)
          .limit(MAX_ROWS)
      : Promise.resolve(none),
  ]);
  for (const [what, res] of [
    ["sessions", sessionsRes],
    ["own sessions", ownSessionsRes],
    ["attendance", attendanceRes],
    ["lines", linesRes],
    ["payments", paymentsRes],
    ["refunds", refundsRes],
  ] as const) {
    if (res.error) throw new Error(`teamMemberWork.${what} failed: ${res.error.message}`);
  }

  const sessions = (sessionsRes.data ?? []) as Session[];
  const ownSessions = (ownSessionsRes.data ?? []) as Session[];
  const attendance = (attendanceRes.data ?? []) as Array<{ session_id: string; user_id: string | null }>;
  const settled = new Set(((linesRes.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id));

  /* the seats booked on every session, aggregate only — one read for both kinds */
  const allSessionIds = [...sessions, ...ownSessions].map((s) => s.id);
  const bookedBySession = new Map<string, number>();
  if (allSessionIds.length) {
    const { data: seatData, error: seatErr } = await supabase.rpc("session_seat_counts", { p_session_ids: allSessionIds });
    if (seatErr) throw new Error(`teamMemberWork.seats failed: ${seatErr.message}`);
    for (const r of (seatData ?? []) as Array<{ session_id: string; enrolled: number }>) bookedBySession.set(r.session_id, n(r.enrolled));
  }

  /* where a class is held: a venue that said yes, else the business itself */
  /* ⚠ this business is read too, for its PICTURE (the Studio grouping draws it);
     a venue the caller may not read simply keeps the name it already has and no
     picture — degrade, never fail */
  const venueIds = [...new Set([businessId, ...claims.map((c) => one(c.classes)?.venue_business_id).filter((v): v is string => Boolean(v))])];
  const venueNames = new Map<string, string>([[businessId, who.businessName]]);
  const venuePhotos = new Map<string, string | null>();
  {
    const { data } = await supabase.from("businesses").select("id, name, profile_photo_path").in("id", venueIds);
    for (const b of (data ?? []) as Array<{ id: string; name: string; profile_photo_path: string | null }>) {
      venueNames.set(b.id, b.name);
      venuePhotos.set(b.id, b.profile_photo_path);
    }
  }

  const attBySession = new Map<string, Array<string | null>>();
  for (const a of attendance) {
    const list = attBySession.get(a.session_id) ?? [];
    list.push(a.user_id);
    attBySession.set(a.session_id, list);
  }
  const byClass = (list: Session[]) => {
    const out = new Map<string, Session[]>();
    for (const s of list) out.set(s.class_id, [...(out.get(s.class_id) ?? []), s]);
    return out;
  };
  const sessionsByClass = byClass(sessions);
  const ownSessionsByClass = byClass(ownSessions);

  /* one row per CLASS — a person re-asked onto a class has two claims for one
     seat, and a session is credited ONCE (the 18 Sep stats rule) */
  const credited = new Set<string>();
  const people = new Set<string>();
  const byMonth = new Map<string, number>();
  const byStyle = new Map<string, number>();
  const rows = new Map<string, TeamMemberClass & { upBooked: number; upSeats: number }>();
  const out = { ...empty, months: empty.months, revenueEntries: [] as TeamRevenueEntry[], owedEntries: [] as TeamOwedEntry[] };
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  const blank = (classId: string, cls: ClassCols, origin: TeamClassOrigin, kind: "artist" | "assistant") => {
    const artist = origin === "member" || kind === "artist" ? { name: who.memberName || null, avatarPath: who.memberPhoto, userId } : artists.get(classId) ?? null;
    const venue = origin === "member" ? businessId : cls.venue_status === "accepted" && cls.venue_business_id ? cls.venue_business_id : businessId;
    return {
      classId,
      shareSlug: cls.share_slug,
      title: dosClassLabel(cls.style, cls.level),
      style: cls.style,
      kind,
      origin,
      artistName: artist?.name ?? null,
      artistPhoto: artist?.avatarPath ?? null,
      artistUserId: artist?.userId ?? null,
      venueName: venueNames.get(venue) ?? null,
      venuePhoto: venuePhotos.get(venue) ?? null,
      room: cls.room || null,
      ratePerSessionInr: origin === "business" ? 0 : null,
      held: 0,
      upcoming: 0,
      dancers: origin === "business" ? 0 : null,
      booked: 0,
      fillBooked: 0,
      fillSeats: 0,
      fillBasis: null,
      capacity: n(cls.capacity),
      nextAt: null,
      lastAt: null,
      closed: true,
      closedWhy: cls.deleted_at ? "deleted" : "removed",
      revenueInr: 0,
      owedInr: 0,
      owedSessions: 0,
      upBooked: 0,
      upSeats: 0,
    } as TeamMemberClass & { upBooked: number; upSeats: number };
  };

  for (const c of claims) {
    const cls = one(c.classes);
    if (!cls) continue;
    const cutoff = c.deleted_at && c.deleted_at < nowIso ? c.deleted_at : nowIso;
    const row = rows.get(c.class_id) ?? blank(c.class_id, cls, "business", c.kind);
    if (c.deleted_at === null && cls.deleted_at === null) {
      row.closed = false;
      row.closedWhy = null;
      row.kind = c.kind;
      row.ratePerSessionInr = n(c.pay_per_session_inr);
    }
    for (const s of sessionsByClass.get(c.class_id) ?? []) {
      const booked = bookedBySession.get(s.id) ?? 0;
      if (s.ends_at < cutoff) {
        if (credited.has(s.id)) continue;
        credited.add(s.id);
        const minutes = Math.max(0, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000));
        const att = attBySession.get(s.id) ?? [];
        row.held += 1;
        row.dancers = (row.dancers ?? 0) + att.length;
        row.booked += booked;
        row.fillBooked += booked;
        row.fillSeats += n(cls.capacity);
        if (!row.lastAt || s.starts_at > row.lastAt) row.lastAt = s.starts_at;
        if (c.kind === "artist") out.taught += 1;
        else out.assisted += 1;
        out.minutes += minutes;
        out.dancers += att.length;
        out.booked += booked;
        out.seats += n(cls.capacity);
        for (const u of att) if (u) people.add(u);
        if (!settled.has(s.id) && n(c.pay_per_session_inr) > 0) {
          out.owedInr += n(c.pay_per_session_inr);
          out.owedSessions += 1;
          row.owedInr += n(c.pay_per_session_inr);
          row.owedSessions += 1;
          out.owedEntries.push({ sessionId: s.id, classTitle: row.title, startsAt: s.starts_at, rateInr: n(c.pay_per_session_inr) });
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
        row.upBooked += booked;
        row.upSeats += n(cls.capacity);
        out.upcoming += 1;
        if (!row.nextAt || s.starts_at < row.nextAt) row.nextAt = s.starts_at;
      }
    }
    rows.set(c.class_id, row);
  }

  /* EARNINGS — only on a session they were CREDITED with (held while they were
     on it), so a class they joined late brings in only what came after */
  type MoneyRow = {
    id: string;
    amount_inr: number;
    method?: string | null;
    created_at: string;
    updated_at?: string | null;
    user_id: string | null;
    orders: One<{ class_id: string; session_id: string | null }>;
  };
  const sessionAt = new Map(sessions.map((s) => [s.id, s.starts_at]));
  const counted: Array<{ row: MoneyRow; kind: "payment" | "refund"; classId: string; sessionId: string }> = [];
  const moneyOf = (list: MoneyRow[], kind: "payment" | "refund", add: (classId: string, inr: number) => void) => {
    for (const p of list) {
      const o = one(p.orders);
      if (!o?.session_id || !credited.has(o.session_id)) continue;
      add(o.class_id, n(p.amount_inr));
      counted.push({ row: p, kind, classId: o.class_id, sessionId: o.session_id });
    }
  };
  moneyOf((paymentsRes.data ?? []) as unknown as MoneyRow[], "payment", (classId, inr) => {
    out.revenueGrossInr += inr;
    const row = rows.get(classId);
    if (row) row.revenueInr += inr;
  });
  moneyOf((refundsRes.data ?? []) as unknown as MoneyRow[], "refund", (classId, inr) => {
    out.revenueRefundedInr += inr;
    const row = rows.get(classId);
    if (row) row.revenueInr -= inr;
  });
  /* WHO PAID — one profiles read for the whole list; a name the caller may not
     read simply stays blank (degrade, never fail) */
  const payerIds = [...new Set(counted.map((c) => c.row.user_id).filter((v): v is string => Boolean(v)))];
  const payerNames = new Map<string, string>();
  if (payerIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", payerIds.slice(0, 500));
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) if (p.full_name) payerNames.set(p.id, p.full_name);
  }
  out.revenueEntries = counted
    .map(({ row, kind, classId, sessionId }) => ({
      id: `${kind}:${row.id}`,
      kind,
      classTitle: rows.get(classId)?.title ?? "A class",
      sessionAt: sessionAt.get(sessionId) ?? null,
      at: kind === "refund" ? (row.updated_at ?? row.created_at) : row.created_at,
      amountInr: n(row.amount_inr),
      method: row.method ?? null,
      payerName: row.user_id ? (payerNames.get(row.user_id) ?? null) : null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  out.owedEntries.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  /* their own classes held here — shown, never counted into the team's money */
  for (const cls of ownClasses) {
    const row = blank(cls.id, cls, "member", "artist");
    row.closed = false;
    row.closedWhy = null;
    for (const s of ownSessionsByClass.get(cls.id) ?? []) {
      const booked = bookedBySession.get(s.id) ?? 0;
      if (s.ends_at < nowIso) {
        row.held += 1;
        row.booked += booked;
        row.fillBooked += booked;
        row.fillSeats += n(cls.capacity);
        if (!row.lastAt || s.starts_at > row.lastAt) row.lastAt = s.starts_at;
      } else if (s.starts_at > nowIso) {
        row.upcoming += 1;
        row.upBooked += booked;
        row.upSeats += n(cls.capacity);
        if (!row.nextAt || s.starts_at < row.nextAt) row.nextAt = s.starts_at;
      }
    }
    rows.set(cls.id, row);
  }

  const classes: TeamMemberClass[] = [...rows.values()].map(({ upBooked, upSeats, ...r }) => {
    if (r.held > 0) return { ...r, fillBasis: "held" as const };
    if (r.upcoming > 0) return { ...r, fillBooked: upBooked, fillSeats: upSeats, fillBasis: "upcoming" as const };
    return r;
  });

  return {
    ...out,
    distinctDancers: people.size,
    firstAt,
    lastAt,
    months: lastSixMonths(now).map((m) => ({ ...m, n: byMonth.get(m.key) ?? 0 })),
    styles: [...byStyle.entries()].map(([style, count]) => ({ style, n: count })).sort((a, b) => b.n - a.n || a.style.localeCompare(b.style)),
    classes: classes.sort((a, b) => Number(a.closed) - Number(b.closed) || b.held - a.held || a.title.localeCompare(b.title)),
    complete:
      claims.length < MAX_CLAIMS &&
      sessions.length < MAX_ROWS &&
      attendance.length < MAX_ROWS &&
      (paymentsRes.data ?? []).length < MAX_ROWS &&
      (refundsRes.data ?? []).length < MAX_ROWS,
  };
}
