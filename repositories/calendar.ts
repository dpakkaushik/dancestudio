import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
/* ⚠ `addDays` walked a multi-day event into one row per day and went with
   events (29 Sep 2026) — a class session is one day by construction */
import { dayKeyOf, hourOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import type { CalendarEntry, CalendarSide } from "@/types/calendar";
import type { ClassLevel, ClassStatus } from "@/types/class";
import type { ClassBookingStatus } from "@/types/classBooking";
import { findClassArtists } from "./classPeople";
import { countEnrolledBySession } from "./classBookings";

/** Step 14 reads. No table, no RPC, no policy: a calendar is class sessions
 *  read through rows that already exist — a person's bookings and confirmed
 *  classPeople, a studio's sessions — under the RLS Steps 4, 11 and 3 set. Every
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

interface BusinessBits {
  name: string;
  city: string | null;
}

interface MyBookingRow {
  id: string;
  status: ClassBookingStatus;
  session_id: string;
  class_id: string;
  class_sessions: SessionBits | null;
  classes: ClassBits | null;
  businesses: BusinessBits | null;
}

interface MyClassPersonRow {
  kind: "artist" | "assistant";
  class_id: string;
  classes: (ClassBits & { businesses: BusinessBits | null; class_sessions: SessionBits[] | null }) | null;
}

interface BusinessSessionRow {
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
  business: BusinessBits | null,
  side: CalendarSide,
  classBooking: CalendarEntry["classBooking"]
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
  businessName: business?.name ?? "",
  businessCity: business?.city ?? null,
  side,
  classBooking,
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
  const [bookingsRes, classPeopleRes] = await Promise.all([
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
  if (classPeopleRes.error) {
    throw new Error(`calendar.findMine(classPeople) failed: ${classPeopleRes.error.message}`);
  }

  const bySession = new Map<string, CalendarEntry>();

  for (const row of (classPeopleRes.data ?? []) as unknown as MyClassPersonRow[]) {
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
export async function findBusinessCalendar(
  supabase: SupabaseClient,
  businessId: string,
  business: BusinessBits,
  fromIso: string,
  toIso: string
): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select(`id, starts_at, ends_at, class_id, classes!inner (${CLASS_BITS})`)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .is("classes.deleted_at", null)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`calendar.findBusiness failed: ${error.message}`);
  }

  const entries = ((data ?? []) as unknown as BusinessSessionRow[])
    .filter((r) => r.classes)
    .map((r) =>
      entryOf(
        { id: r.id, starts_at: r.starts_at, ends_at: r.ends_at },
        r.class_id,
        r.classes as ClassBits,
        business,
        "hosting",
        null
      )
    );
  /* AND THE ARTISTS' CLASSES IT HOLDS (18 Sep 2026): a class an artist asked to
     run in one of this studio's rooms, once the studio has ACCEPTED — the room is
     held from then on, so it belongs on the calendar the rooms are planned from */
  const hosted = await findVenueEntries(supabase, businessId, business, fromIso, toIso, false);
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
  businessId: string,
  business: BusinessBits,
  fromIso: string,
  toIso: string,
  publishedOnly: boolean
): Promise<CalendarEntry[]> {
  let q = supabase
    .from("classes")
    .select(`id, ${CLASS_BITS}, class_sessions (id, starts_at, ends_at, deleted_at)`)
    .eq("venue_business_id", businessId)
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
      out.push(entryOf(s, row.id, row, business, "hosting", null));
    }
  }
  return out;
}

// ── ⚠⚠ EVENTS ON THE CALENDAR WENT ON 29 Sep 2026 ────────────────────────────
// The user: *"Remove Organization and Events completely from the system."*
// `findMyCalendarEvents`, `eventEntries` and `MAX_EVENT_DAYS` were here, and
// with them the only thing in this file that had to be expanded ONE ROW PER DAY
// (a festival is on every day of itself, where a class session is one evening).
// The Classes/Events switch the screen drew above the sides went too.
//
// ⚠ It cost the calendar three reads per visit — the tickets, the businesses'
// events, and one `findEventBySlug` per distinct event held — so a person's
// calendar is materially cheaper than it was.

/** HOW FAR A PUBLIC SCHEDULE LOOKS — three months, starting now. There is no
 *  history on an offer to scroll back into. */
export const PUBLIC_SCHEDULE_MONTHS = 3;

/** The exclusive upper bound of that window, from one function.
 *
 *  ⚠ ONE FUNCTION BECAUSE TWO SCREENS ASK IT NOW (30 Sep 2026): the schedule
 *  page, and the NEXT SESSIONS summary on the profile whose Schedule bar opens
 *  it. A summary naming a class the page behind it does not list is a number
 *  and the list behind it disagreeing — the prototype's own complaint (9950,
 *  "the grid used to say 86 students and open a list of five"), which this repo
 *  has already had to fix twice in its follower counts. */
export const publicScheduleToIso = (nowIso: string): string => {
  const months = monthsWindow(nowIso, 0, PUBLIC_SCHEDULE_MONTHS);
  return monthStartIso(shiftMonthKey(months[months.length - 1].key, -1));
};

/** A business's PUBLIC schedule (prototype `pubSchedule`, 8902-8907): published
 *  classes that have not happened yet, and nothing else — not drafts, not what
 *  is over. "A public schedule is an offer — a list of classes somebody can
 *  still book." RLS already draws this line for a stranger (published classes
 *  of listed businesses); the status and time filters draw it for a member too. */
export async function findPublicBusinessSchedule(
  supabase: SupabaseClient,
  businessId: string,
  business: BusinessBits,
  nowIso: string,
  toIso: string
): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select(`id, starts_at, ends_at, class_id, classes!inner (${CLASS_BITS})`)
    .eq("business_id", businessId)
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

  const entries = ((data ?? []) as unknown as BusinessSessionRow[])
    .filter((r) => r.classes)
    .map((r) =>
      entryOf(
        { id: r.id, starts_at: r.starts_at, ends_at: r.ends_at },
        r.class_id,
        r.classes as ClassBits,
        business,
        "hosting",
        null
      )
    );
  /* the artists' published classes it holds are on offer here too (18 Sep 2026) */
  const hosted = await findVenueEntries(supabase, businessId, business, nowIso, toIso, true);
  return withSeatCounts(supabase, [...entries, ...hosted]);
}

/** THE FIRST FEW CLASSES BEHIND A PROFILE'S SCHEDULE BAR (30 Sep 2026, #0aj).
 *
 *  ⚠ THE SAME FUNCTION AND THE SAME WINDOW AS THE SCHEDULE PAGE, deliberately —
 *  the summary sits directly under the bar that opens that page, and a summary
 *  naming a class the page behind it does not list is the number-and-list
 *  disagreement this app has already had to fix in its follower counts. It
 *  reads the whole window and the caller shows three: the cost of slicing here
 *  instead would be a second set of rules about what "next" means.
 *
 *  ⚠ IT DEGRADES TO NOTHING RATHER THAN FAILING. A profile page must not 500
 *  over a PREVIEW of a list that has a page of its own — the bar above the
 *  summary still opens the real thing. */
export async function findNextPublicSessions(
  supabase: SupabaseClient,
  businessId: string,
  business: BusinessBits
): Promise<CalendarEntry[]> {
  const now = new Date().toISOString();
  return findPublicBusinessSchedule(supabase, businessId, business, now, publicScheduleToIso(now)).catch(() => []);
}
