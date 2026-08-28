import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKeyOf, hourOf } from "@/lib/format/month";
import type { CalendarEntry, CalendarSide } from "@/types/calendar";
import type { ClassLevel, ClassStatus } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";
import { countEnrolledBySession } from "./enrollments";

/** Step 14 reads. No table, no RPC, no policy: a calendar is class sessions
 *  read through rows that already exist — a person's bookings and confirmed
 *  claims, a studio's sessions — under the RLS Steps 4, 11 and 3 set. Every
 *  query says whose rows it wants out loud (`user_id = …`, `tenant_id = …`):
 *  RLS is a ceiling, not a scoping mechanism, and a person who is both a
 *  learner and a studio's member can read far more than their own rows. */

/* a runaway guard, not a page size: the window is a handful of months */
const MAX_ROWS = 2000;

interface ClassBits {
  title: string;
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
  tenants: TenantBits | null;
}

interface MyClaimRow {
  kind: "artist" | "assistant";
  class_id: string;
  classes: (ClassBits & { tenants: TenantBits | null; class_sessions: SessionBits[] | null }) | null;
}

interface TenantSessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
  class_id: string;
  classes: ClassBits | null;
}

const CLASS_BITS = "title, share_slug, style, level, room, price_inr, capacity, status";

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
  title: c.title,
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
});

const inWindow = (iso: string, fromIso: string, toIso: string) => {
  const t = new Date(iso).getTime();
  return t >= new Date(fromIso).getTime() && t < new Date(toIso).getTime();
};

async function withSeatCounts(supabase: SupabaseClient, entries: CalendarEntry[]): Promise<CalendarEntry[]> {
  const counts = await countEnrolledBySession(supabase, [...new Set(entries.map((e) => e.sessionId))]);
  return entries
    .map((e) => ({ ...e, filled: counts.get(e.sessionId) ?? 0 }))
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
      .from("enrollments")
      .select(
        `id, status, session_id, class_id, class_sessions!inner (id, starts_at, ends_at), classes!inner (${CLASS_BITS}), tenants (name, city)`
      )
      .eq("user_id", userId)
      .in("status", ["enrolled", "waitlisted"])
      .is("deleted_at", null)
      .is("classes.deleted_at", null)
      .gte("class_sessions.starts_at", fromIso)
      .lt("class_sessions.starts_at", toIso)
      .limit(MAX_ROWS),
    supabase
      .from("class_claims")
      .select(
        `kind, class_id, classes!inner (${CLASS_BITS}, tenants (name, city), class_sessions (id, starts_at, ends_at, deleted_at))`
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
      bySession.set(s.id, entryOf(s, row.class_id, row.classes, row.classes.tenants, side, null));
    }
  }

  for (const row of (bookingsRes.data ?? []) as unknown as MyBookingRow[]) {
    if (!row.classes || !row.class_sessions) continue;
    if (bySession.has(row.session_id)) continue;
    bySession.set(
      row.session_id,
      entryOf(row.class_sessions, row.class_id, row.classes, row.tenants, "attending", {
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
    .eq("tenant_id", tenantId)
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
  return withSeatCounts(supabase, entries);
}
