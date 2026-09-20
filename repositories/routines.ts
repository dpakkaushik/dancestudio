import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassLevel } from "@/types/class";

/** A ROUTINE IS A SONG AND A VIDEO (19 Sep 2026, the user: "Routines are just a
 *  combination of Music — link or MP3 — and Video — link").
 *
 *  Everything here is a read of rows the app already keeps, or a call to one of
 *  the migration's doors. The USAGE is never stored: `my_routines`,
 *  `routine_classes` and `routine_students` count it from the classes a routine
 *  is attached to and the attendance those classes took — and all three are the
 *  routine owner's alone, which is why they are definer functions rather than
 *  policy-shaped reads. */

export interface Routine {
  id: string;
  title: string;
  style: string;
  level: ClassLevel;
  songTitle: string | null;
  songUrl: string | null;
  songIsFile: boolean;
  videoUrl: string | null;
  status: "live" | "draft";
  createdAt: string;
}

/** a routine with what it has been used for — the desk's row */
export interface RoutineWithUsage extends Routine {
  /** how many classes carry it */
  classes: number;
  /** how many of their sessions have actually ENDED */
  sessions: number;
  /** how many distinct people turned up to one (attendance, not bookings) */
  students: number;
}

export interface RoutineClass {
  classId: string;
  shareSlug: string;
  style: string;
  level: ClassLevel;
  status: "draft" | "published" | "completed";
  businessName: string;
  startsAt: string | null;
  sessions: number;
  students: number;
}

export interface RoutineStudent {
  userId: string;
  name: string;
  avatarPath: string | null;
  city: string | null;
  sessions: number;
  lastOn: string;
}

interface RoutineRow {
  id: string;
  title: string;
  style: string;
  level: ClassLevel;
  song_title: string | null;
  song_url: string | null;
  song_is_file: boolean;
  video_url: string | null;
  status: "live" | "draft";
  created_at: string;
}

const toRoutine = (r: RoutineRow): Routine => ({
  id: r.id,
  title: r.title,
  style: r.style,
  level: r.level,
  songTitle: r.song_title,
  songUrl: r.song_url,
  songIsFile: Boolean(r.song_is_file),
  videoUrl: r.video_url,
  status: r.status,
  createdAt: r.created_at,
});

/** The desk: every routine of the caller's own, newest first, with its usage. */
export async function findMyRoutines(supabase: SupabaseClient): Promise<RoutineWithUsage[]> {
  const { data, error } = await supabase.rpc("my_routines");
  if (error) {
    throw new Error(`routines.mine failed: ${error.message}`);
  }
  return ((data ?? []) as Array<RoutineRow & { classes: number; sessions: number; students: number }>).map((r) => ({
    ...toRoutine(r),
    classes: Number(r.classes ?? 0),
    sessions: Number(r.sessions ?? 0),
    students: Number(r.students ?? 0),
  }));
}

/** The classes a routine is taught in — the owner's alone (empty for anybody else). */
export async function findRoutineClasses(supabase: SupabaseClient, routineId: string): Promise<RoutineClass[]> {
  const { data, error } = await supabase.rpc("routine_classes", { p_routine_id: routineId });
  if (error) {
    throw new Error(`routines.classes failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ class_id: string; share_slug: string; style: string; level: ClassLevel; status: RoutineClass["status"]; business_name: string; starts_at: string | null; sessions: number; students: number }>).map((r) => ({
    classId: r.class_id,
    shareSlug: r.share_slug,
    style: r.style,
    level: r.level,
    status: r.status,
    businessName: r.business_name ?? "",
    startsAt: r.starts_at,
    sessions: Number(r.sessions ?? 0),
    students: Number(r.students ?? 0),
  }));
}

/** Who has danced it, and how many of its sessions each turned up to. */
export async function findRoutineStudents(supabase: SupabaseClient, routineId: string): Promise<RoutineStudent[]> {
  const { data, error } = await supabase.rpc("routine_students", { p_routine_id: routineId });
  if (error) {
    throw new Error(`routines.students failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ user_id: string; full_name: string; profile_photo_path: string | null; city: string | null; sessions: number; last_on: string }>).map((r) => ({
    userId: r.user_id,
    name: r.full_name ?? "Someone",
    avatarPath: r.profile_photo_path,
    city: r.city,
    sessions: Number(r.sessions ?? 0),
    lastOn: r.last_on,
  }));
}

/** The routines a class is taught from — RLS decides: the class's own people
 *  always, anybody at all once the class is published by a listed business. */
export async function findClassRoutines(supabase: SupabaseClient, classId: string): Promise<Routine[]> {
  const { data, error } = await supabase
    .from("class_routines")
    .select("routines (id, title, style, level, song_title, song_url, song_is_file, video_url, status, created_at)")
    .eq("class_id", classId)
    .is("deleted_at", null)
    .limit(20);
  if (error) {
    throw new Error(`routines.onClass failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<{ routines: RoutineRow | null }>)
    .filter((r) => r.routines)
    .map((r) => toRoutine(r.routines as RoutineRow));
}

/** a routine somebody LEARNED — the routine, and the class they danced it in */
export interface LearnedRoutine extends Routine {
  classId: string;
  shareSlug: string;
  classStyle: string;
  classLevel: string;
  tenantName: string | null;
  /** how many of that class's sessions this person actually turned up to */
  sessions: number;
  lastOn: string | null;
}

/** ROUTINES YOU LEARNED (20 Sep 2026, the user: "routines you learned should
 *  also be a seprate tab in routines section and should be visible to user
 *  profiles as well in tools").
 *
 *  ⚠ NO MIGRATION, AND THE REASON IS THE RULE THIS FILE ALREADY KEEPS: a routine
 *  you learned is not a new fact, it is two rows the app already has — an
 *  `attendance` row saying you were in the room, and a `class_routines` row
 *  saying what was taught there. Both are readable under the policies that
 *  already exist: Step 10 admits you to your own check-ins, and
 *  `20260919160000` lets everybody who can read the class read its routines.
 *
 *  ⚠ IT COUNTS ATTENDANCE, NOT BOOKINGS — the same rule the owner's side of the
 *  desk keeps, and the one Step 25 set: a seat nobody marked is not a session
 *  danced, so a class you booked and did not attend teaches you nothing here.
 *  The screen says so. */
export async function findRoutinesLearned(supabase: SupabaseClient, userId: string): Promise<LearnedRoutine[]> {
  const { data: attended, error: aErr } = await supabase
    .from("attendance")
    .select("class_id, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (aErr) {
    throw new Error(`routines.learned(attendance) failed: ${aErr.message}`);
  }
  const rows = (attended ?? []) as Array<{ class_id: string; created_at: string }>;
  if (rows.length === 0) return [];
  /* how many times each class was actually danced, and when it last was */
  const times = new Map<string, { n: number; last: string }>();
  for (const r of rows) {
    const at = times.get(r.class_id);
    if (at) at.n += 1;
    else times.set(r.class_id, { n: 1, last: r.created_at });
  }
  const classIds = [...times.keys()];
  const { data, error } = await supabase
    .from("class_routines")
    .select("class_id, routines (id, title, style, level, song_title, song_url, song_is_file, video_url, status, created_at), classes (share_slug, style, level, businesses!classes_business_id_fkey (name))")
    .in("class_id", classIds)
    .is("deleted_at", null)
    .limit(200);
  if (error) {
    throw new Error(`routines.learned failed: ${error.message}`);
  }
  type Row = {
    class_id: string;
    routines: RoutineRow | null;
    classes: { share_slug: string; style: string; level: string; businesses: { name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.routines && r.classes)
    .map((r) => {
      const t = times.get(r.class_id);
      return {
        ...toRoutine(r.routines as RoutineRow),
        classId: r.class_id,
        shareSlug: (r.classes as NonNullable<Row["classes"]>).share_slug,
        classStyle: (r.classes as NonNullable<Row["classes"]>).style,
        classLevel: (r.classes as NonNullable<Row["classes"]>).level,
        tenantName: (r.classes as NonNullable<Row["classes"]>).businesses?.name ?? null,
        sessions: t?.n ?? 0,
        lastOn: t?.last ?? null,
      };
    })
    .sort((a, b) => (b.lastOn ?? "").localeCompare(a.lastOn ?? ""));
}

export interface RoutineInput {
  routineId?: string | null;
  title: string;
  style: string;
  level: ClassLevel;
  songTitle: string | null;
  songUrl: string | null;
  songIsFile: boolean;
  videoUrl: string | null;
  status: "live" | "draft";
}

export async function saveRoutine(supabase: SupabaseClient, input: RoutineInput): Promise<Routine> {
  const { data, error } = await supabase.rpc("save_routine", {
    p_routine_id: input.routineId ?? null,
    p_title: input.title,
    p_style: input.style,
    p_level: input.level,
    p_song_title: input.songTitle,
    p_song_url: input.songUrl,
    p_song_is_file: input.songIsFile,
    p_video_url: input.videoUrl,
    p_status: input.status,
  });
  if (error) {
    throw new Error(error.message);
  }
  return toRoutine(data as RoutineRow);
}

const rpcVoid = async (supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<void> => {
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
};

export const deleteRoutine = (supabase: SupabaseClient, routineId: string) => rpcVoid(supabase, "delete_routine", { p_routine_id: routineId });
export const addClassRoutine = (supabase: SupabaseClient, classId: string, routineId: string) => rpcVoid(supabase, "add_class_routine", { p_class_id: classId, p_routine_id: routineId });
export const removeClassRoutine = (supabase: SupabaseClient, classId: string, routineId: string) => rpcVoid(supabase, "remove_class_routine", { p_class_id: classId, p_routine_id: routineId });

/** Whether the signed-in person may put a routine on this class — its confirmed
 *  artist, or the business's owner. A failed read is "no", never an error. */
export async function canSetClassRoutines(supabase: SupabaseClient, classId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_set_class_routines", { p_class_id: classId });
  if (error) return false;
  return Boolean(data);
}
