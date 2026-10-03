import { notFound, redirect } from "next/navigation";
import { RoutinePage } from "@/features/routines/components/RoutinePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyRoutines, findRoutineClassStudios, findRoutineClasses, findRoutineStudents } from "@/repositories/routines";
import { findProfileById } from "@/repositories/profiles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /routines/{id} — one routine and its usage (19 Sep 2026). The routine comes
 *  from the caller's OWN list rather than from a read by id, which is what makes
 *  "not found" the honest answer for somebody else's: the usage reads answer
 *  nobody but the owner either, so there is nothing to leak by guessing an id. */
export default async function OneRoutinePage({ params, searchParams }: { params: Promise<{ routineId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { routineId } = await params;
  /* the column the server opens on — Studios unless the address says Students */
  const show = (await searchParams).show === "students" ? "students" : "studios";
  if (!UUID_RE.test(routineId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [mine, classes, students, me] = await Promise.all([
    findMyRoutines(supabase).catch(() => []),
    findRoutineClasses(supabase, routineId).catch(() => []),
    findRoutineStudents(supabase, routineId).catch(() => []),
    /* the maker — the page leads with them, as the card does (3 Oct 2026) */
    findProfileById(supabase, user.id).catch(() => null),
  ]);
  const routine = mine.find((r) => r.id === routineId);
  if (!routine) {
    notFound();
  }
  /* where each class is danced — the Studios column's faces (4 Oct 2026) */
  const studios = await findRoutineClassStudios(supabase, classes.map((c) => c.classId)).catch(() => new Map());
  return (
    <RoutinePage
      routine={routine}
      classes={classes.map((c) => ({ ...c, studio: studios.get(c.classId) ?? null }))}
      students={students}
      maker={{ userId: user.id, name: me?.fullName ?? "You", photoPath: me?.avatarPath ?? null }}
      show={show}
    />
  );
}
