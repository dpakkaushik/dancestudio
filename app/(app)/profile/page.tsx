import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** `/profile` IS AN ADDRESS NOW, NOT A SCREEN (21 Sep 2026).
 *
 *  The user: *"how can you reduce the no. of pages per profile type without
 *  changing functionality"*, then *"keep stats as a seprate page and push to
 *  live."* Your own profile and your public page were two addresses drawing the
 *  same person from the same read — the pair this file has recorded drifting
 *  five ways (C32) and the pair whose two corners pointed at each other until
 *  C37. They are one address each now: **`/person/{me}` for a person,
 *  `/org/{me}` for an organization**, and those routes draw the owner's version
 *  when the subject is you (`OwnProfileScreen`).
 *
 *  ⚠ THE ROUTE STAYS, AND MUST (Rule 14). The installed TWA reopens on the last
 *  URL it showed, the chrome's gear links `/profile?settings=1`, and a studio's
 *  and a crew's own home point their corner here because neither knows the
 *  VIEWER's id. All of those keep working: this is a server redirect, so it
 *  costs one hop and leaves no extra history entry to walk back through.
 *
 *  ⚠ AND `?settings=1` RIDES ALONG. The gear's whole job is to open the Settings
 *  sheet, whose open state IS the address (19 Sep 2026) — dropping the parameter
 *  here would have made the gear a link to a profile and nothing else, which is
 *  the kind of silent half-fix that only a press finds. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const settings = (await searchParams).settings === "1" ? "?settings=1" : "";
  redirect(`${profile.role === "org" ? "/org" : "/person"}/${user.id}${settings}`);
}
