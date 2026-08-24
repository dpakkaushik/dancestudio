import type { SupabaseClient } from "@supabase/supabase-js";

/** The class page's live register (prototype attend tab, 12043-12138): who holds
 *  a seat and whether they are in the room, plus the waitlist queue in join
 *  order. RLS admits the tenant's members; writes go through the RPCs only. */

export interface RegisterRow {
  enrollmentId: string;
  learnerName: string;
  checkedIn: boolean;
}

export interface WaitlistRow {
  enrollmentId: string;
  learnerName: string;
}

export interface ClassRegister {
  rows: RegisterRow[];
  waitlist: WaitlistRow[];
  checkedInCount: number;
}

interface RegisterQueryRow {
  id: string;
  status: "enrolled" | "waitlisted";
  profiles: { full_name: string } | null;
  attendance: Array<{ id: string; deleted_at: string | null }>;
}

export async function findClassRegister(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassRegister> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, status, profiles (full_name), attendance (id, deleted_at)")
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
      enrollmentId: r.id,
      learnerName: r.profiles?.full_name ?? "Learner",
      checkedIn: r.attendance.some((a) => a.deleted_at === null),
    }));
  const waitlist = all
    .filter((r) => r.status === "waitlisted")
    .map((r) => ({
      enrollmentId: r.id,
      learnerName: r.profiles?.full_name ?? "Learner",
    }));
  return {
    rows,
    waitlist,
    checkedInCount: rows.filter((r) => r.checkedIn).length,
  };
}

export async function checkIn(supabase: SupabaseClient, enrollmentId: string): Promise<void> {
  const { error } = await supabase.rpc("check_in", { p_enrollment_id: enrollmentId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function undoCheckIn(supabase: SupabaseClient, enrollmentId: string): Promise<void> {
  const { error } = await supabase.rpc("undo_check_in", { p_enrollment_id: enrollmentId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function giveSpot(supabase: SupabaseClient, enrollmentId: string): Promise<void> {
  const { error } = await supabase.rpc("give_spot", { p_enrollment_id: enrollmentId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeFromWaitlist(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<void> {
  const { error } = await supabase.rpc("remove_from_waitlist", { p_enrollment_id: enrollmentId });
  if (error) {
    throw new Error(error.message);
  }
}
