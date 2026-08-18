import { redirect } from "next/navigation";
import { OnboardingForm } from "@/features/auth/components/OnboardingForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (profile) {
    redirect("/");
  }
  return <OnboardingForm />;
}
