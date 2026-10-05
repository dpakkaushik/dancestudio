import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import { classOwnerOf, type ClassLevel, type ClassStatus } from "@/types/class";
import type { ClassBookingStatus, MyClassBooking } from "@/types/classBooking";
import type { Business } from "@/types/business";
import { TENANT_COLUMNS, toBusiness, type BusinessRow } from "./businesses";
import { findClassArtists } from "./classPeople";

interface MyClassBookingRow {
  id: string;
  status: ClassBookingStatus;
  session_id: string;
  class_id: string;
  class_sessions: { starts_at: string; ends_at: string } | null;
  classes: {
    share_slug: string;
    style: string;
    level: ClassLevel;
    room: string | null;
    price_inr: number;
    capacity: number;
    status: ClassStatus;
    poster_path: string | null;
    venue_status: "requested" | "accepted" | "declined" | null;
    venue: { name: string; type: string | null; profile_photo_path: string | null } | null;
  } | null;
  businesses: { name: string; city: string | null; type: string | null; profile_photo_path: string | null } | null;
}

/** Book a seat via the atomic RPC. A full class is refused in words — there is
 *  no waitlist since 4 Oct 2026. Returns the resulting status. */
export async function bookClassSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ClassBookingStatus> {
  const { data, error } = await supabase.rpc("book_class_session", {
    p_session_id: sessionId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as { status: ClassBookingStatus }).status;
}

/** The sentence a cancel of a finished class is refused with — the app's and,
 *  once `20261004170000` is applied, the database's own, word for word. */
export const CLASS_OVER_SENTENCE = "This class is over — it can no longer be cancelled or refunded";

/** The sentence a cancel of a class that has STARTED is refused with — the
 *  app's and, since `20261006090000`, the database's own, word for word. */
export const CLASS_STARTED_SENTENCE = "This class has started — it can no longer be cancelled";

/** ⚠ A FINISHED CLASS IS FINAL (4 Oct 2026, the user: "cancel / refund class
 *  should not be possible if class is over") — AND SINCE 6 Oct 2026 A STARTED
 *  ONE IS TOO, for the person holding the seat (the user's decision 1: a seat
 *  in a room that is already dancing is not a seat that can be handed back).
 *  Asked BEFORE the cancel RPC, which refuses the same two things itself
 *  (`_cancel_one_class_booking`); a studio calling a class off is a different
 *  door and is untouched. Reads the booking under the caller's own RLS: a row
 *  they cannot read is left for the RPC to refuse in its own words. */
export async function assertBookingNotOver(supabase: SupabaseClient, classBookingId: string): Promise<void> {
  const { data } = await supabase
    .from("class_bookings")
    .select("id, class_sessions (starts_at, ends_at)")
    .eq("id", classBookingId)
    .maybeSingle();
  const row = data as { class_sessions: { starts_at: string | null; ends_at: string | null } | null } | null;
  const endsAt = row?.class_sessions?.ends_at;
  if (endsAt && Date.parse(endsAt) <= Date.now()) {
    throw new Error(CLASS_OVER_SENTENCE);
  }
  const startsAt = row?.class_sessions?.starts_at;
  if (startsAt && Date.parse(startsAt) <= Date.now()) {
    throw new Error(CLASS_STARTED_SENTENCE);
  }
}

/** Cancel your own booking via the RPC — the freed seat goes back on sale. */
export async function cancelClassBooking(
  supabase: SupabaseClient,
  classBookingId: string
): Promise<void> {
  await assertBookingNotOver(supabase, classBookingId);
  const { error } = await supabase.rpc("cancel_class_booking", {
    p_class_booking_id: classBookingId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** The signed-in learner's live bookings, soonest session first. */
export async function findMyClassBookings(supabase: SupabaseClient): Promise<MyClassBooking[]> {
  /* ⚠ MINE MEANS MINE (19 Sep 2026, the user: "classes booked section is only
     for bookings made for attending the class and nothing else"). This read
     leaned on RLS for "my bookings" — and a studio's members read their
     studio's whole roster, so an owner's Booked segment listed every seat in
     their studio. RLS is a ceiling, not a scope: the spine says `user_id`. */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("class_bookings")
    .select(
      "id, status, session_id, class_id, class_sessions (starts_at, ends_at), classes (share_slug, style, level, room, price_inr, capacity, status, poster_path, venue_status, venue:businesses!classes_venue_business_id_fkey (name, type, profile_photo_path)), businesses (name, city, type, profile_photo_path)"
    )
    .eq("user_id", user.id)
    .eq("status", "enrolled")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`class_bookings.findMine failed: ${error.message}`);
  }
  return (data as unknown as MyClassBookingRow[])
    .filter((r) => r.classes && r.class_sessions)
    .map((r) => ({
      id: r.id,
      status: r.status,
      sessionId: r.session_id,
      classId: r.class_id,
      title: dosClassLabel(r.classes!.style, r.classes!.level),
      shareSlug: r.classes!.share_slug,
      style: r.classes!.style,
      level: r.classes!.level,
      room: r.classes!.room,
      priceInr: r.classes!.price_inr,
      capacity: r.classes!.capacity,
      classStatus: r.classes!.status,
      posterPath: r.classes!.poster_path ?? null,
      startsAt: r.class_sessions!.starts_at,
      endsAt: r.class_sessions!.ends_at,
      businessName: r.businesses?.name ?? "",
      businessCity: r.businesses?.city ?? null,
      owner: classOwnerOf(r.businesses),
      venue: r.classes!.venue_status === "accepted" ? classOwnerOf(r.classes!.venue) : null,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** THE STUDIOS YOU HAVE TAKEN CLASSES AT (18 Sep 2026, the user's Home grid: a
 *  person's Studios tile lists "studios which they have taken classes at").
 *  Every business behind one of your bookings, once each, most recent first —
 *  a booking you cancelled still means you were there, so status is not
 *  filtered; a business you can no longer read (unlisted, gone) simply does not
 *  come back through RLS. Says `user_id = auth.uid()` out loud.
 *
 *  ⚠ IT LOST ONE OF ITS TWO CALLERS ON 27 Sep 2026 and KEEPS THE OTHER. The
 *  Train group on a person's own Profile tab went at the user's word ("Train
 *  section to be removed from profiles") and this was nearly deleted with it —
 *  typecheck caught that the **Studios hub** (`/business`, R22's "STUDIOS YOU
 *  HAVE LEARNT AT") reads it too, which a grep scoped to `repositories/` had
 *  missed. A tile the user has not asked about is still a caller. */
export async function findStudiosAttended(supabase: SupabaseClient, userId: string): Promise<Business[]> {
  const { data, error } = await supabase
    .from("class_bookings")
    .select(`created_at, businesses (${TENANT_COLUMNS})`)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`class_bookings.studiosAttended failed: ${error.message}`);
  }
  const seen = new Set<string>();
  const out: Business[] = [];
  for (const row of (data ?? []) as unknown as Array<{ businesses: BusinessRow | null }>) {
    const b = row.businesses;
    /* the `type === "org"` skip went with organizations (29 Sep 2026) — nobody
       ever booked a class at one, so it excluded nothing it still needed to */
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(toBusiness(b));
  }
  return out;
}

/** WHO TAUGHT YOU, AND WHERE (1 Oct 2026, the user: *"where you learned in
 *  studios should have studio list and collapsible teacher list in it to see the
 *  record of from who you learned where"*).
 *
 *  Keyed by studio id: the teachers of the classes YOU booked there, each with
 *  how many of those classes they took and the latest one. ⚠ The SAME bookings
 *  as `findStudiosAttended` above — `user_id = me`, live rows — so a studio in
 *  that list and its teachers here are counted off one set and cannot disagree.
 *  ⚠ The teacher is the class's CONFIRMED artist (`findClassArtists`, one query
 *  for the whole history); a class nobody took, or whose teacher's profile a
 *  reader may not see, adds nobody rather than a "Someone". A cancelled seat is
 *  not a class you learned in, so it is left out of these counts. */
export interface LearnedFrom {
  userId: string;
  name: string;
  avatarPath: string | null;
  classes: number;
  last: string;
}
export async function findTeachersByStudioAttended(supabase: SupabaseClient, userId: string): Promise<Record<string, LearnedFrom[]>> {
  const { data, error } = await supabase
    .from("class_bookings")
    .select("class_id, business_id, created_at, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    throw new Error(`class_bookings.teachersByStudio failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{ class_id: string; business_id: string; created_at: string }>;
  const artists = await findClassArtists(supabase, rows.map((r) => r.class_id));
  const byStudio = new Map<string, Map<string, LearnedFrom>>();
  /* one class booked twice (two sessions) is two classes taught — count per seat */
  for (const r of rows) {
    const a = artists.get(r.class_id);
    if (!a) continue;
    const s = byStudio.get(r.business_id) ?? new Map<string, LearnedFrom>();
    const cur = s.get(a.userId);
    if (cur) {
      cur.classes += 1;
      if (r.created_at > cur.last) cur.last = r.created_at;
    } else {
      s.set(a.userId, { userId: a.userId, name: a.name, avatarPath: a.avatarPath, classes: 1, last: r.created_at });
    }
    byStudio.set(r.business_id, s);
  }
  return Object.fromEntries([...byStudio].map(([k, m]) => [k, [...m.values()].sort((x, y) => y.classes - x.classes || y.last.localeCompare(x.last))]));
}

/** Session ids of the learner's live bookings — marks tiles on the public listing.
 *
 *  ⚠⚠ MINE MEANS MINE HERE TOO (30 Sep 2026) — the SEVENTH time this file has
 *  had to write it, and the direct sibling of `findMyClassBookings` above, which
 *  was fixed for exactly this on 19 Sep and left this one alone.
 *
 *  `class_bookings` carries TWO select policies: *your own rows*, and *the
 *  business's members read its roster*. This read filtered on neither — so for
 *  anybody on a studio's team it came back with EVERY live booking in that
 *  studio, keyed by session. On Discover and `/classes` that painted
 *  "Enrolled ✓" on their own studio's classes because a LEARNER had booked one,
 *  with a Cancel button carrying that learner's booking id. Nothing was ever
 *  cancelled (`cancel_class_booking` is `user_id = auth.uid()` and refused it),
 *  so the cost was a screen that lied in both directions: somebody else's seat
 *  shown as yours, and — past the 200-row cap on a busy studio — your own seat
 *  missing from a list it had crowded out.
 *
 *  ⚠ Walk-ins made it worse rather than better: since 29 Sep a walk-in row
 *  carries `user_id = null`, and a null passes an unfiltered read exactly as a
 *  stranger's row does.
 *
 *  RLS IS A CEILING, NOT A SCOPE. The spine says `user_id`. */
export async function findMyEnrolledSessionIds(
  supabase: SupabaseClient
): Promise<Map<string, { id: string; status: ClassBookingStatus }>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();
  const { data, error } = await supabase
    .from("class_bookings")
    .select("id, status, session_id")
    .eq("user_id", user.id)
    .eq("status", "enrolled")
    .is("deleted_at", null)
    .limit(200);

  if (error) {
    throw new Error(`class_bookings.findMySessions failed: ${error.message}`);
  }
  const map = new Map<string, { id: string; status: ClassBookingStatus }>();
  (data as { id: string; status: ClassBookingStatus; session_id: string }[]).forEach((r) =>
    map.set(r.session_id, { id: r.id, status: r.status })
  );
  return map;
}

/** Enrolled counts per session — aggregate-only RPC, safe for public listings. */
export async function countEnrolledBySession(
  supabase: SupabaseClient,
  sessionIds: string[]
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase.rpc("session_seat_counts", {
    p_session_ids: sessionIds,
  });
  if (error) {
    throw new Error(`class_bookings.counts failed: ${error.message}`);
  }
  const map = new Map<string, number>();
  (data as { session_id: string; enrolled: number }[]).forEach((r) =>
    map.set(r.session_id, Number(r.enrolled))
  );
  return map;
}
