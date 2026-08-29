import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/features/auth/components/OnboardingForm";
import { ONBOARDING_COOKIE } from "@/lib/auth/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** Onboarding — four screens (prototype 3781-3943). A person with a profile is
 *  sent to Home UNLESS they are still in the door: the first screen creates the
 *  row (the photo, styles and links are written onto it), and every server
 *  action after that refetches this route — so "a row exists" alone would end
 *  the flow at the photo. The cookie says the flow is still running, and the
 *  form resumes from whatever the row already holds. */
export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  const inFlight = (await cookies()).get(ONBOARDING_COOKIE)?.value === "1";
  if (profile && !inFlight) {
    redirect("/");
  }
  return <OnboardingForm userId={user.id} existing={profile} />;
}
