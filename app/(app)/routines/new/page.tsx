import { redirect } from "next/navigation";
import { RoutineForm } from "@/features/routines/components/RoutineForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** /routines/new — the form left the desk for a page of its own (21 Sep 2026,
 *  the user: "same should be for new routine and new membership").
 *
 *  ⚠ NO PLAN GATE (3 Oct 2026, the user: "users can also create routines"). This
 *  page sent anybody without the Artist plan back to the desk, on the belief
 *  that `save_routine` reads the plan — and it never has: the live function asks
 *  only that you are signed in and that a file sits in your own folder. So the
 *  gate was the app's alone, and it is gone; a signed-in person is the whole
 *  requirement, which this page still checks because a page is a door anybody
 *  can type. */
export default async function NewRoutinePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return <RoutineForm userId={user.id} />;
}
