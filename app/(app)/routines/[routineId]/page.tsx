import { notFound, redirect } from "next/navigation";
import { RoutinePage } from "@/features/routines/components/RoutinePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassArtists } from "@/repositories/classPeople";
import { findMyRoutines, findRoutineClassFacts, findRoutineClassStudios, findRoutineClasses, findRoutineStudents } from "@/repositories/routines";
import { findProfileById } from "@/repositories/profiles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /routines/{id} — one routine and its usage (19 Sep 2026). The routine comes
 *  from the caller's OWN list rather than from a read by id, which is what makes
 *  "not found" the honest answer for somebody else's: the usage reads answer
 *  nobody but the owner either, so there is nothing to leak by guessing an id. */
export default async function OneRoutinePage({ params, searchParams }: { params: Promise<{ routineId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { routineId } = await params;
  /* the column the server opens on — Classes, the first, unless the address names
     Students. ⚠ The Studios column is gone (4 Oct 2026, the user: "Routine detail -
     remove studio section"), so an old `?show=studios` lands on Classes, whose
     Studio grouping is where it went (Rule 14: a link handed out still opens) */
  const asked = (await searchParams).show;
  const show = asked === "students" ? asked : "classes";
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
  /* where each class is danced, who teaches it, its room and its sessions — the
     Classes column's groupings and boxes (4 Oct 2026); each degrades to nothing */
  const ids = classes.map((c) => c.classId);
  const [studios, artists, facts] = await Promise.all([
    findRoutineClassStudios(supabase, ids).catch(() => new Map()),
    findClassArtists(supabase, ids).catch(() => new Map()),
    findRoutineClassFacts(supabase, ids).catch(() => new Map()),
  ]);
  return (
    <RoutinePage
      routine={routine}
      classes={classes.map((c) => {
        const a = artists.get(c.classId);
        return {
          ...c,
          studio: studios.get(c.classId) ?? null,
          artist: a ? { userId: a.userId, name: a.name, photoPath: a.avatarPath ?? null } : null,
          facts: facts.get(c.classId) ?? null,
        };
      })}
      students={students}
      maker={{ userId: user.id, name: me?.fullName ?? "You", photoPath: me?.avatarPath ?? null }}
      show={show}
    />
  );
}
