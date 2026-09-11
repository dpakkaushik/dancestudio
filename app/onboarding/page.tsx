import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/features/auth/components/OnboardingForm";
import { ONBOARDING_COOKIE } from "@/lib/auth/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findProfileById } from "@/repositories/profiles";

/** Onboarding — four screens for a person, five for an organization since R16
 *  added the photos (prototype 3781-3943). A person with a profile is
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
  /* a platform admin is ADMIN ONLY (9 Sep 2026): it never onboards as a person
     or an organization — the verification queue is its whole app */
  if (!profile && (await amIPlatformAdmin(supabase))) {
    redirect("/admin/verifications");
  }
  /* an organization is asked for no photos during onboarding any more (11 Sep
     2026) — the 5-10 photos belong to a STUDIO and are shown for one on the
     hub, after it exists. The read that fetched them went with the screen. */
  return <OnboardingForm userId={user.id} existing={profile} />;
}
