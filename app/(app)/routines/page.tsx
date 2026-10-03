import { redirect } from "next/navigation";
import { RoutineForm } from "@/features/routines/components/RoutineForm";
import { RoutinesDesk } from "@/features/routines/components/RoutinesDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyRoutines, findRoutinesLearned } from "@/repositories/routines";
import { findProfileById } from "@/repositories/profiles";

/** /routines — the Routines tile on an artist's Home (18 Sep 2026), built
 *  19 Sep 2026. The prototype's S_choreos (17115): a routine is a song and a
 *  video, and the desk is the list of yours with what each has been used for.
 *  Every routine here is the caller's own — `my_routines()` is scoped to
 *  `auth.uid()` inside, so there is no id to pass and nobody else's to ask for. */
export default async function RoutinesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* ⚠ THE DESK HAS TWO SIDES NOW (20 Sep 2026, the user: "routines you learned
     should also be a seprate tab in routines section and should be visible to
     user profiles as well in tools"). Yours — the ones you made and teach from —
     and LEARNED, the ones that were taught in a class you actually turned up to.
     A plain user makes none and learns plenty, which is why the tile is on their
     grid now; the making side simply has nothing in it for them, and says so. */
  const [routines, learned, me] = await Promise.all([
    findMyRoutines(supabase).catch(() => []),
    findRoutinesLearned(supabase, user.id).catch(() => []),
    /* the maker of every routine on Yours — the card leads with them (3 Oct 2026) */
    findProfileById(supabase, user.id).catch(() => null),
  ]);
  /* ⚠ THE FORM OPENS OVER THE DESK (22 Sep 2026), and `?new=1` is what says so —
     the same shape as the gear's `?settings=1`: the phone's back gesture closes
     it, and the desk pays for nothing until it is asked for.
     ⚠ NO PLAN GATE (3 Oct 2026, the user: "users can also create routines"). It
     was the app's alone — `save_routine` never read the Artist plan — so every
     signed-in person makes routines, and the form is offered to all of them. */
  return (
    <>
      <RoutinesDesk routines={routines} learned={learned} me={{ name: me?.fullName ?? "You", photoPath: me?.avatarPath ?? null }} />
      {opening ? <RoutineForm userId={user.id} sheet /> : null}
    </>
  );
}
