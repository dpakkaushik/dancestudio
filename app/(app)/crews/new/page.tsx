import { redirect } from "next/navigation";
import { CrewForm } from "@/features/crews/components/CrewForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** Create your crew — prototype CrewFormPage (18828): S_profiletab with crewFormOnly. */
export default async function NewCrewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  return <CrewForm defaultCity={profile.city} />;
}
