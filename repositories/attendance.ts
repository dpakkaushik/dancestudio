import type { SupabaseClient } from "@supabase/supabase-js";

/** The class page's live register (prototype attend tab, 12043-12138): who holds
 *  a seat and whether they are in the room. RLS admits the business's members;
 *  writes go through the RPCs only.
 *  ⚠ THE WAITLIST QUEUE WENT ON 4 Oct 2026 (the user: "remove waitlist
 *  mechanism") — `WaitlistRow`, `giveSpot` and `removeFromWaitlist` with it, and
 *  `20261004160000` drops the two RPCs they called. */

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
  /** ⚠ A SEAT TAKEN AT THE DOOR (2 Oct 2026) — a walk-in, or a person the
   *  register booked in (`created_by` is not the person). Only such a seat can be
   *  marked Paid; a seat the person booked themselves is the payment rail's. */
  atDoor: boolean;
  /** when the door recorded it paid — `set_door_paid` (20261002140000) */
  doorPaidAt: string | null;
}

export interface ClassRegister {
  rows: RegisterRow[];
  checkedInCount: number;
}

interface RegisterQueryRow {
  id: string;
  /** ⚠ NULL for a walk-in recorded by name (29 Sep 2026, shape 2) */
  user_id: string | null;
  attendee_name: string | null;
  status: "enrolled";
  created_by?: string | null;
  door_paid_at?: string | null;
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
  const read = (cols: string) =>
    supabase
      .from("class_bookings")
      .select(cols)
      .eq("class_id", classId)
      .eq("status", "enrolled")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(500);
  const BASE = "id, user_id, attendee_name, status, created_by, profiles (full_name, profile_photo_path), attendance (id, deleted_at)";
  /* ⚠ `door_paid_at` arrives with 20261002140000; until it is applied the read
     answers "column does not exist", so it falls back to the read without it
     rather than taking the register down (the 27 Sep `poster_path` lesson) */
  let { data, error } = await read(`${BASE}, door_paid_at`);
  if (error && /door_paid_at/.test(error.message)) {
    ({ data, error } = await read(BASE));
  }
  if (error) {
    throw new Error(`attendance.register failed: ${error.message}`);
  }
  const all = data as unknown as RegisterQueryRow[];
  const rows = all
    .map((r) => ({
      classBookingId: r.id,
      learnerName: nameOf(r),
      checkedIn: r.attendance.some((a) => a.deleted_at === null),
      userId: r.user_id,
      avatarPath: r.profiles?.profile_photo_path ?? null,
      /** a walk-in: no account, and the only row the studio may take back off */
      walkIn: r.user_id === null,
      atDoor: r.user_id === null || (r.created_by != null && r.created_by !== r.user_id),
      doorPaidAt: r.door_paid_at ?? null,
    }));
  return {
    rows,
    checkedInCount: rows.filter((r) => r.checkedIn).length,
  };
}

/** PAID AT THE DOOR (2 Oct 2026) — the register records a door seat as paid, or
 *  takes it back. Every rule is the RPC's (who may run the register, a free class,
 *  a self-booked or online-paid seat). ⚠ Before 20261002140000 is applied the RPC
 *  does not exist, and PostgREST answers PGRST202 — said in words, not raw. */
export async function setDoorPaid(supabase: SupabaseClient, classBookingId: string, paid: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_door_paid", { p_class_booking_id: classBookingId, p_paid: paid });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Marking a seat paid is not switched on yet");
    throw new Error(error.message);
  }
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
