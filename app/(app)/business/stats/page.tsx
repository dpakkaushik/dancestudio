import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** `/business/stats` IS AN ADDRESS NOW, NOT A SCREEN (22 Sep 2026).
 *
 *  It drew `OrgDashboard` — an organization's figures combined and studio by
 *  studio — while `/org/{me}/stats` drew the aggregate a VISITOR reads. Two
 *  addresses, one subject, two different screens, and the one an organization
 *  wanted was the one that did not name it. `/org/{id}/stats` renders the
 *  dashboard when the id is the caller's, so the merge is the C40 shape.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): `OrgDashboard` itself is the kind of screen
 *  somebody bookmarks, and the installed TWA reopens on the last URL it showed.
 *  A server redirect costs one hop and leaves no extra history entry. */
export default async function OrgStatsAddress() {
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
  /* a person's stats are their record; this address is the organization's */
  redirect(`${profile.role === "org" ? "/org" : "/person"}/${user.id}/stats`);
}
