import { redirect } from "next/navigation";
import { RoutinesDesk } from "@/features/routines/components/RoutinesDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyRoutines, findRoutinesLearned } from "@/repositories/routines";

/** /routines — the Routines tile on an artist's Home (18 Sep 2026), built
 *  19 Sep 2026. The prototype's S_choreos (17115): a routine is a song and a
 *  video, and the desk is the list of yours with what each has been used for.
 *  Every routine here is the caller's own — `my_routines()` is scoped to
 *  `auth.uid()` inside, so there is no id to pass and nobody else's to ask for. */
export default async function RoutinesPage() {
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
  const [routines, learned, plan] = await Promise.all([
    findMyRoutines(supabase).catch(() => []),
    findRoutinesLearned(supabase, user.id).catch(() => []),
    findMyArtistPlan(supabase).catch(() => null),
  ]);
  return <RoutinesDesk routines={routines} learned={learned} canMake={Boolean(plan?.active)} />;
}
