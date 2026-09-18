import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import { addDays, dayKeyOf, hourOf } from "@/lib/format/month";
import type { CalendarEntry, CalendarEventEntry, CalendarSide } from "@/types/calendar";
import type { ClassLevel, ClassStatus } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";
import type { DanceEvent, MyEventBooking } from "@/types/event";
import { findClassArtists } from "./claims";
import { countEnrolledBySession } from "./enrollments";
import { findEventBySlug, findEventsByTenants, findMyEventBookings } from "./events";

/** Step 14 reads. No table, no RPC, no policy: a calendar is class sessions
 *  read through rows that already exist — a person's bookings and confirmed
 *  claims, a studio's sessions — under the RLS Steps 4, 11 and 3 set. Every
 *  query says whose rows it wants out loud (`user_id = …`, `business_id = …`):
 *  RLS is a ceiling, not a scoping mechanism, and a person who is both a
 *  learner and a studio's member can read far more than their own rows. */

/* a runaway guard, not a page size: the window is a handful of months */
const MAX_ROWS = 2000;

interface ClassBits {
  share_slug: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  price_inr: number;
  capacity: number;
  status: ClassStatus;
}

interface SessionBits {
  id: string;
  starts_at: string;
  ends_at: string;
  deleted_at?: string | null;
}

interface TenantBits {
  name: string;
  city: string | null;
}

interface MyBookingRow {
  id: string;
  status: EnrollmentStatus;
  session_id: string;
  class_id: string;
  class_sessions: SessionBits | null;
  classes: ClassBits | null;
  businesses: TenantBits | null;
}

interface MyClaimRow {
  kind: "artist" | "assistant";
  class_id: string;
  classes: (ClassBits & { businesses: TenantBits | null; class_sessions: SessionBits[] | null }) | null;
}

interface TenantSessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
  class_id: string;
  classes: ClassBits | null;
}

/* no `title`: a class's label is "{style} · {level}", derived (types/class.ts) */
const CLASS_BITS = "share_slug, style, level, room, price_inr, capacity, status";

const entryOf = (
  session: SessionBits,
  classId: string,
  c: ClassBits,
  tenant: TenantBits | null,
  side: CalendarSide,
  enrollment: CalendarEntry["enrollment"]
): CalendarEntry => ({
  sessionId: session.id,
  classId,
  shareSlug: c.share_slug,
  title: dosClassLabel(c.style, c.level),
  style: c.style,
  level: c.level,
  room: c.room,
  priceInr: c.price_inr,
  capacity: c.capacity,
  classStatus: c.status,
  startsAt: session.starts_at,
  endsAt: session.ends_at,
  dayKey: dayKeyOf(session.starts_at),
  hour: hourOf(session.starts_at),
  tenantName: tenant?.name ?? "",
  tenantCity: tenant?.city ?? null,
  side,
  enrollment,
  filled: 0,
  artist: null,
});

const inWindow = (iso: string, fromIso: string, toIso: string) => {
  const t = new Date(iso).getTime();
  return t >= new Date(fromIso).getTime() && t < new Date(toIso).getTime();
};

/** The two things every calendar entry needs and none of the queries above can
 *  give it: how full the session is, and WHO IS TEACHING IT — the face the card's
 *  centre column wears (18 Sep 2026). Two reads for a whole calendar, never one
 *  per card, and this is also what feeds Home's deck, which composes these. */
async function withSeatCounts(supabase: SupabaseClient, entries: CalendarEntry[]): Promise<CalendarEntry[]> {
  const [counts, artists] = await Promise.all([
    countEnrolledBySession(supabase, [...new Set(entries.map((e) => e.sessionId))]),
    findClassArtists(supabase, entries.map((e) => e.classId)),
  ]);
  return entries
    .map((e) => ({ ...e, filled: counts.get(e.sessionId) ?? 0, artist: artists.get(e.classId) ?? null }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** One person's calendar: what they train in, teach and assist, in a window.
 *  A session they both teach and booked (odd, but possible) is Teach — the side
 *  the prototype's classifier picks first (hostsIt before the rest, 8899). */
export async function findMyCalendar(
  supabase: SupabaseClient,
  userId: string,
  fromIso: string,
  toIso: string
): Promise<CalendarEntry[]> {
  const [bookingsRes, claimsRes] = await Promise.all([
    supabase
      .from("class_bookings")
      .select(
        `id, status, session_id, class_id, class_sessions!inner (id, starts_at, ends_at), classes!inner (${CLASS_BITS}), businesses (name, city)`
      )
      .eq("user_id", userId)
      .in("status", ["enrolled", "waitlisted"])
      .is("deleted_at", null)
      .is("classes.deleted_at", null)
      .gte("class_sessions.starts_at", fromIso)
      .lt("class_sessions.starts_at", toIso)
      .limit(MAX_ROWS),
    supabase
      .from("class_people")
      .select(
        /* the key is named: classes has two into businesses since 18 Sep 2026 (the venue) */
        `kind, class_id, classes!inner (${CLASS_BITS}, businesses!classes_business_id_fkey (name, city), class_sessions (id, starts_at, ends_at, deleted_at))`
      )
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .is("classes.deleted_at", null)
      .limit(MAX_ROWS),
  ]);

  if (bookingsRes.error) {
    throw new Error(`calendar.findMine(bookings) failed: ${bookingsRes.error.message}`);
  }
  if (claimsRes.error) {
    throw new Error(`calendar.findMine(claims) failed: ${claimsRes.error.message}`);
  }

  const bySession = new Map<string, CalendarEntry>();

  for (const row of (claimsRes.data ?? []) as unknown as MyClaimRow[]) {
    if (!row.classes) continue;
    for (const s of row.classes.class_sessions ?? []) {
      if (s.deleted_at || !inWindow(s.starts_at, fromIso, toIso)) continue;
      const side: CalendarSide = row.kind === "artist" ? "hosting" : "assisting";
      const existing = bySession.get(s.id);
      // teaching outranks assisting on the same session
      if (existing && existing.side === "hosting") continue;
      bySession.set(s.id, entryOf(s, row.class_id, row.classes, row.classes.businesses, side, null));
    }
  }

  for (const row of (bookingsRes.data ?? []) as unknown as MyBookingRow[]) {
    if (!row.classes || !row.class_sessions) continue;
    if (bySession.has(row.session_id)) continue;
    bySession.set(
      row.session_id,
      entryOf(row.class_sessions, row.class_id, row.classes, row.businesses, "attending", {
        id: row.id,
        status: row.status,
      })
    );
  }

  return withSeatCounts(supabase, [...bySession.values()]);
}

/** A studio's calendar: every session of every live class, drafts included —
 *  RLS admits the studio's members and nobody else to the drafts. The prototype
 *  keeps a studio's calendar to studio sessions ("the owner's own bookings live
 *  on their artist profile", 8893), which is what this reads. */
export async function findTenantCalendar(
  supabase: SupabaseClient,
  tenantId: string,
  tenant: TenantBits,
  fromIso: string,
  toIso: string
): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select(`id, starts_at, ends_at, class_id, classes!inner (${CLASS_BITS})`)
    .eq("business_id", tenantId)
    .is("deleted_at", null)
    .is("classes.deleted_at", null)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`calendar.findTenant failed: ${error.message}`);
  }

  const entries = ((data ?? []) as unknown as TenantSessionRow[])
    .filter((r) => r.classes)
    .map((r) =>
      entryOf(
        { id: r.id, starts_at: r.starts_at, ends_at: r.ends_at },
        r.class_id,
        r.classes as ClassBits,
        tenant,
        "hosting",
        null
      )
    );
  /* AND THE ARTISTS' CLASSES IT HOLDS (18 Sep 2026): a class an artist asked to
     run in one of this studio's rooms, once the studio has ACCEPTED — the room is
     held from then on, so it belongs on the calendar the rooms are planned from */
  const hosted = await findVenueEntries(supabase, tenantId, tenant, fromIso, toIso, false);
  return withSeatCounts(supabase, [...entries, ...hosted]);
}

interface VenueClassRow {
  id: string;
  class_sessions: SessionBits[] | null;
  share_slug: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  price_inr: number;
  capacity: number;
  status: ClassStatus;
}

/** the classes a studio HOSTS for artists (venue accepted), as calendar entries;
 *  `publishedOnly` for the public schedule, drafts included for the studio's own */
async function findVenueEntries(
  supabase: SupabaseClient,
  tenantId: string,
  tenant: TenantBits,
  fromIso: string,
  toIso: string,
  publishedOnly: boolean
): Promise<CalendarEntry[]> {
  let q = supabase
    .from("classes")
    .select(`id, ${CLASS_BITS}, class_sessions (id, starts_at, ends_at, deleted_at)`)
    .eq("venue_business_id", tenantId)
    .eq("venue_status", "accepted")
    .is("deleted_at", null)
    .limit(MAX_ROWS);
  if (publishedOnly) q = q.eq("status", "published");
  const { data, error } = await q;
  if (error) {
    throw new Error(`calendar.findVenueEntries failed: ${error.message}`);
  }
  const out: CalendarEntry[] = [];
  for (const row of (data ?? []) as unknown as VenueClassRow[]) {
    for (const s of row.class_sessions ?? []) {
      if (s.deleted_at || !inWindow(s.starts_at, fromIso, toIso)) continue;
      out.push(entryOf(s, row.id, row, tenant, "hosting", null));
    }
  }
  return out;
}

// ── EVENTS ON THE CALENDAR (18 Sep 2026) ─────────────────────────────────────
// The calendar has drawn classes only since Step 14, while Home's deck has
// carried tickets, entries and the events you run since Step 21 — so a person
// booked a ticket, saw it on Home for one day, and never saw it again, and an
// organization (which hosts every event in the app and teaches no class) had a
// calendar that could only ever be empty. See `CalendarEventEntry`.

const IST_OFFSET = "+05:30";
/* a guard, not a rule: no real festival runs two months, and a bad end date
   must not spin this loop */
const MAX_EVENT_DAYS = 60;

/** An event as calendar rows: ONE PER DAY it covers inside the window, because
 *  the calendar groups by day and a festival is on every day of itself. Each day
 *  carries the event's own start time — the doors open at the same hour each
 *  day, which is the only time the record holds. */
function eventEntries(
  ev: DanceEvent,
  roleLabel: string,
  href: string,
  fromIso: string,
  toIso: string
): CalendarEventEntry[] {
  const last = ev.endDate && ev.endDate >= ev.startDate ? ev.endDate : ev.startDate;
  const time = ev.startTime || "00:00";
  const out: CalendarEventEntry[] = [];
  let day = ev.startDate;
  for (let n = 0; day <= last && n < MAX_EVENT_DAYS; day = addDays(day, 1), n++) {
    const startsAt = `${day}T${time}:00${IST_OFFSET}`;
    if (!inWindow(startsAt, fromIso, toIso)) continue;
    out.push({
      key: `event:${ev.id}:${day}`,
      eventId: ev.id,
      title: ev.title,
      style: ev.style,
      startsAt,
      endsAt: `${day}T23:59:59${IST_OFFSET}`,
      dayKey: day,
      hour: hourOf(startsAt),
      roleLabel,
      href,
      event: ev,
    });
  }
  return out;
}

const byStart = (a: CalendarEventEntry, b: CalendarEventEntry) => a.startsAt.localeCompare(b.startsAt);

/** A PERSON's events: the ones they hold a ticket or an entry for, and the ones
 *  their businesses are running. Drafts are left out — a draft is not "on", the
 *  same rule Home's deck keeps — and an event you RUN outranks a seat on it, so
 *  it is drawn once, as the thing you are running. */
export async function findMyCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
  tenantIds: string[],
  fromIso: string,
  toIso: string
): Promise<CalendarEventEntry[]> {
  const [tickets, hosted] = await Promise.all([
    findMyEventBookings(supabase, userId),
    tenantIds.length ? findEventsByTenants(supabase, tenantIds) : Promise.resolve([] as DanceEvent[]),
  ]);

  const out: CalendarEventEntry[] = [];
  const running = new Set<string>();
  for (const ev of hosted) {
    if (ev.status === "draft") continue;
    running.add(ev.id);
    out.push(...eventEntries(ev, "Running", `/business/${ev.tenantId}/events/${ev.id}`, fromIso, toIso));
  }

  /* one row per EVENT however many tickets you hold on it — the register lists
     them; a calendar says you are going */
  const mine = new Map<string, MyEventBooking>();
  for (const t of tickets) {
    if (running.has(t.eventId) || mine.has(t.eventId)) continue;
    mine.set(t.eventId, t);
  }
  const held = [...mine.values()];
  /* a booking carries its event's START date and no end, so the EVENT decides
     which days it covers — one read per distinct event booked, as the deck does */
  const full = await Promise.all(held.map((t) => findEventBySlug(supabase, t.eventShareSlug)));
  full.forEach((ev, i) => {
    if (!ev) return;
    out.push(
      ...eventEntries(ev, held[i].kind === "participant" ? "Competing" : "Spectator", `/e/${ev.shareSlug}`, fromIso, toIso)
    );
  });

  return out.sort(byStart);
}

/** A BUSINESS's own events, for the organiser's calendar — drafts INCLUDED, for
 *  the reason a studio's calendar includes draft classes: this is the plan, not
 *  the shop window, and something you have not published yet is exactly what you
 *  open a calendar to find. */
export async function findBusinessCalendarEvents(
  supabase: SupabaseClient,
  tenantIds: string[],
  fromIso: string,
  toIso: string
): Promise<CalendarEventEntry[]> {
  if (!tenantIds.length) return [];
  const events = await findEventsByTenants(supabase, tenantIds);
  const out: CalendarEventEntry[] = [];
  for (const ev of events) {
    const role = ev.status === "draft" ? "Draft" : ev.status === "completed" ? "Over" : "Running";
    out.push(...eventEntries(ev, role, `/business/${ev.tenantId}/events/${ev.id}`, fromIso, toIso));
  }
  return out.sort(byStart);
}

/** A business's PUBLIC schedule (prototype `pubSchedule`, 8902-8907): published
 *  classes that have not happened yet, and nothing else — not drafts, not what
 *  is over. "A public schedule is an offer — a list of classes somebody can
 *  still book." RLS already draws this line for a stranger (published classes
 *  of listed businesses); the status and time filters draw it for a member too. */
export async function findPublicTenantSchedule(
  supabase: SupabaseClient,
  tenantId: string,
  tenant: TenantBits,
  nowIso: string,
  toIso: string
): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select(`id, starts_at, ends_at, class_id, classes!inner (${CLASS_BITS})`)
    .eq("business_id", tenantId)
    .eq("classes.status", "published")
    .is("deleted_at", null)
    .is("classes.deleted_at", null)
    .gte("starts_at", nowIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`calendar.findPublicSchedule failed: ${error.message}`);
  }

  const entries = ((data ?? []) as unknown as TenantSessionRow[])
    .filter((r) => r.classes)
    .map((r) =>
      entryOf(
        { id: r.id, starts_at: r.starts_at, ends_at: r.ends_at },
        r.class_id,
        r.classes as ClassBits,
        tenant,
        "hosting",
        null
      )
    );
  /* the artists' published classes it holds are on offer here too (18 Sep 2026) */
  const hosted = await findVenueEntries(supabase, tenantId, tenant, nowIso, toIso, true);
  return withSeatCounts(supabase, [...entries, ...hosted]);
}
