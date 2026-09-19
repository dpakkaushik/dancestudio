import { redirect } from "next/navigation";
import { RoutinesDesk } from "@/features/routines/components/RoutinesDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyRoutines } from "@/repositories/routines";

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
  const routines = await findMyRoutines(supabase).catch(() => []);
  return <RoutinesDesk routines={routines} userId={user.id} />;
}
