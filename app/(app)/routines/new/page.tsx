import { redirect } from "next/navigation";
import { RoutineForm } from "@/features/routines/components/RoutineForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan } from "@/repositories/plans";

/** /routines/new — the form left the desk for a page of its own (21 Sep 2026,
 *  the user: "same should be for new routine and new membership").
 *
 *  ⚠ THE GATE IS THE SAME ONE THE DESK DRAWS, and it is checked HERE as well:
 *  making a routine is an artist's tool (`save_routine` reads the plan), so
 *  somebody without one is sent back to the desk — which says so in words —
 *  rather than being shown a form the database would refuse. A page is a door
 *  anybody can type, so the guard cannot live only on the button that opens it. */
export default async function NewRoutinePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const plan = await findMyArtistPlan(supabase).catch(() => null);
  if (!plan?.active) {
    redirect("/routines");
  }
  return <RoutineForm userId={user.id} />;
}
