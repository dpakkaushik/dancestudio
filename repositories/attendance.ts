import type { SupabaseClient } from "@supabase/supabase-js";

/** The class page's live register (prototype attend tab, 12043-12138): who holds
 *  a seat and whether they are in the room, plus the waitlist queue in join
 *  order. RLS admits the business's members; writes go through the RPCs only. */

export interface RegisterRow {
  classBookingId: string;
  learnerName: string;
  checkedIn: boolean;
  /** the learner — the row opens their page. ⚠ NULL for a walk-in (shape 2,
   *  29 Sep 2026): there is no page to open, so the row draws no door. */
  userId: string | null;
  avatarPath: string | null;
  /** recorded at the door by name, with no DanceOS account */
  walkIn: boolean;
}

export interface WaitlistRow {
  classBookingId: string;
  learnerName: string;
  /** ⚠ WHO THIS IS (28 Sep 2026). The register's scanner has to tell "waiting for
   *  a spot" from "not booked at all" — two different sentences to say at a door,
   *  and without the id they are the same silence. The column was already in the
   *  query; only the row shape had dropped it.
   *  ⚠ NULL for a walk-in — though a walk-in is never waitlisted (both doors
   *  refuse a full class outright), so this is the type being honest rather
   *  than a case that can arise. */
  userId: string | null;
}

export interface ClassRegister {
  rows: RegisterRow[];
  waitlist: WaitlistRow[];
  checkedInCount: number;
}

interface RegisterQueryRow {
  id: string;
  /** ⚠ NULL for a walk-in recorded by name (29 Sep 2026, shape 2) */
  user_id: string | null;
  attendee_name: string | null;
  status: "enrolled" | "waitlisted";
  profiles: { full_name: string; profile_photo_path?: string | null } | null;
  attendance: Array<{ id: string; deleted_at: string | null }>;
}

/** ⚠⚠ WHERE A ROW'S NAME COMES FROM, NOW THAT A SEAT NEED NOT BE A PERSON.
 *
 *  A walk-in has no `profiles` row to embed, so the old `?? "Learner"` fallback
 *  would have drawn every one of them as the word "Learner" — the "Someone" bug
 *  of 29 Sep in a second place, and this time on a register somebody is reading
 *  out at a door. The name on the booking is the answer, and it is only ever
 *  set when `user_id` is not. */
const nameOf = (r: RegisterQueryRow): string =>
  r.profiles?.full_name ?? r.attendee_name ?? "Learner";

export async function findClassRegister(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassRegister> {
  const { data, error } = await supabase
    .from("class_bookings")
    .select("id, user_id, attendee_name, status, profiles (full_name, profile_photo_path), attendance (id, deleted_at)")
    .eq("class_id", classId)
    .in("status", ["enrolled", "waitlisted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    throw new Error(`attendance.register failed: ${error.message}`);
  }
  const all = data as unknown as RegisterQueryRow[];
  const rows = all
    .filter((r) => r.status === "enrolled")
    .map((r) => ({
      classBookingId: r.id,
      learnerName: nameOf(r),
      checkedIn: r.attendance.some((a) => a.deleted_at === null),
      userId: r.user_id,
      avatarPath: r.profiles?.profile_photo_path ?? null,
      /** a walk-in: no account, and the only row the studio may take back off */
      walkIn: r.user_id === null,
    }));
  const waitlist = all
    .filter((r) => r.status === "waitlisted")
    .map((r) => ({
      classBookingId: r.id,
      learnerName: nameOf(r),
      userId: r.user_id,
    }));
  return {
    rows,
    waitlist,
    checkedInCount: rows.filter((r) => r.checkedIn).length,
  };
}

export async function checkIn(supabase: SupabaseClient, classBookingId: string): Promise<void> {
  const { error } = await supabase.rpc("check_in", { p_class_booking_id: classBookingId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function undoCheckIn(supabase: SupabaseClient, classBookingId: string): Promise<void> {
  const { error } = await supabase.rpc("undo_check_in", { p_class_booking_id: classBookingId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function giveSpot(supabase: SupabaseClient, classBookingId: string): Promise<void> {
  const { error } = await supabase.rpc("give_spot", { p_class_booking_id: classBookingId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeFromWaitlist(
  supabase: SupabaseClient,
  classBookingId: string
): Promise<void> {
  const { error } = await supabase.rpc("remove_from_waitlist", { p_class_booking_id: classBookingId });
  if (error) {
    throw new Error(error.message);
  }
}

/** THE DOOR (29 Sep 2026) — book somebody who is standing in front of you.
 *
 *  ⚠ It hands back the new booking's id, and that is the point of returning
 *  anything at all: the door's next act is to CHECK THEM IN, and waiting for a
 *  `router.refresh()` to bring the row back before it can would be the same race
 *  the scan sheet was bitten by on 28 Sep (a prop only moves when the round trip
 *  lands, so a second scan read a stale register and said "✓ checked in" twice).
 *
 *  Everything that decides is the RPC's: who may run the register, the register's
 *  own 30-minutes-before-until-it-ends window, capacity, and the three answers a
 *  door has to tell apart. Nothing here re-implements any of it. */
export async function bookForPerson(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("book_class_session_for_person", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = data as { id?: string } | null;
  if (!row?.id) {
    throw new Error("The door did not hand back a booking");
  }
  return row.id;
}

/** THE DOOR, SHAPE 2 — somebody with no DanceOS account, by name.
 *
 *  ⚠ Hands back the booking id for the same reason `bookForPerson` does: the
 *  door's next act is to check them in, and the row is not in the page's props
 *  yet. */
export async function addWalkIn(
  supabase: SupabaseClient,
  sessionId: string,
  name: string
): Promise<string> {
  const { data, error } = await supabase.rpc("add_class_walk_in", {
    p_session_id: sessionId,
    p_name: name,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = data as { id?: string } | null;
  if (!row?.id) {
    throw new Error("The door did not hand back a booking");
  }
  return row.id;
}

/** Undo a walk-in. ⚠ The RPC refuses any booking that carries a `user_id`, so
 *  this can never reach a real person's seat — theirs stays theirs to cancel. */
export async function removeWalkIn(
  supabase: SupabaseClient,
  classBookingId: string
): Promise<void> {
  const { error } = await supabase.rpc("remove_class_walk_in", {
    p_class_booking_id: classBookingId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
