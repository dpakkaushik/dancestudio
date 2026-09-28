import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** `/profile` IS AN ADDRESS NOW, NOT A SCREEN (21 Sep 2026).
 *
 *  The user: *"how can you reduce the no. of pages per profile type without
 *  changing functionality"*, then *"keep stats as a seprate page and push to
 *  live."* Your own profile and your public page were two addresses drawing the
 *  same person from the same read — the pair this file has recorded drifting
 *  five ways (C32) and the pair whose two corners pointed at each other until
 *  C37. It is one address now — **`/person/{me}`** — and that route draws the
 *  owner's version when the subject is you (`OwnProfileScreen`). ⚠ The second
 *  arm, `/org/{me}`, went with organizations on 29 Sep 2026, and the profile
 *  read that chose between the two went with it: this is one hop and no round
 *  trip.
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
  const settings = (await searchParams).settings === "1" ? "?settings=1" : "";
  redirect(`/person/${user.id}${settings}`);
}
