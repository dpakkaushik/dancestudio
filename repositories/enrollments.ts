import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassLevel, ClassStatus } from "@/types/class";
import type { EnrollmentStatus, MyEnrollment, RosterEntry } from "@/types/enrollment";

interface MyEnrollmentRow {
  id: string;
  status: EnrollmentStatus;
  session_id: string;
  class_id: string;
  class_sessions: { starts_at: string; ends_at: string } | null;
  classes: {
    title: string;
    share_slug: string;
    style: string;
    level: ClassLevel;
    room: string | null;
    price_inr: number;
    capacity: number;
    status: ClassStatus;
  } | null;
  tenants: { name: string; city: string | null } | null;
}

interface RosterRow {
  id: string;
  status: EnrollmentStatus;
  created_at: string;
  profiles: { full_name: string; city: string | null } | null;
}

/** Enroll (or waitlist, when full) via the atomic RPC. Returns the resulting status. */
export async function enrollInSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<EnrollmentStatus> {
  const { data, error } = await supabase.rpc("enroll_in_session", {
    p_session_id: sessionId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as { status: EnrollmentStatus }).status;
}

/** Cancel your own booking via the RPC — a freed spot promotes the first waitlisted. */
export async function cancelEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<void> {
  const { error } = await supabase.rpc("cancel_enrollment", {
    p_enrollment_id: enrollmentId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** The signed-in learner's live bookings, soonest session first. */
export async function findMyEnrollments(supabase: SupabaseClient): Promise<MyEnrollment[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select(
      "id, status, session_id, class_id, class_sessions (starts_at, ends_at), classes (title, share_slug, style, level, room, price_inr, capacity, status), tenants (name, city)"
    )
    .in("status", ["enrolled", "waitlisted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`enrollments.findMine failed: ${error.message}`);
  }
  return (data as unknown as MyEnrollmentRow[])
    .filter((r) => r.classes && r.class_sessions)
    .map((r) => ({
      id: r.id,
      status: r.status,
      sessionId: r.session_id,
      classId: r.class_id,
      title: r.classes!.title,
      shareSlug: r.classes!.share_slug,
      style: r.classes!.style,
      level: r.classes!.level,
      room: r.classes!.room,
      priceInr: r.classes!.price_inr,
      capacity: r.classes!.capacity,
      classStatus: r.classes!.status,
      startsAt: r.class_sessions!.starts_at,
      endsAt: r.class_sessions!.ends_at,
      tenantName: r.tenants?.name ?? "",
      tenantCity: r.tenants?.city ?? null,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Session ids of the learner's live bookings — marks tiles on the public listing. */
export async function findMyEnrolledSessionIds(
  supabase: SupabaseClient
): Promise<Map<string, { id: string; status: EnrollmentStatus }>> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, status, session_id")
    .in("status", ["enrolled", "waitlisted"])
    .is("deleted_at", null)
    .limit(200);

  if (error) {
    throw new Error(`enrollments.findMySessions failed: ${error.message}`);
  }
  const map = new Map<string, { id: string; status: EnrollmentStatus }>();
  (data as { id: string; status: EnrollmentStatus; session_id: string }[]).forEach((r) =>
    map.set(r.session_id, { id: r.id, status: r.status })
  );
  return map;
}

/** The roster for one class — RLS admits the tenant's members only. */
export async function findRosterByClass(
  supabase: SupabaseClient,
  classId: string
): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, status, created_at, profiles (full_name, city)")
    .eq("class_id", classId)
    .in("status", ["enrolled", "waitlisted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`enrollments.roster failed: ${error.message}`);
  }
  return (data as unknown as RosterRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    enrolledAt: r.created_at,
    learnerName: r.profiles?.full_name ?? "Learner",
    learnerCity: r.profiles?.city ?? null,
  }));
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
    throw new Error(`enrollments.counts failed: ${error.message}`);
  }
  const map = new Map<string, number>();
  (data as { session_id: string; enrolled: number }[]).forEach((r) =>
    map.set(r.session_id, Number(r.enrolled))
  );
  return map;
}
