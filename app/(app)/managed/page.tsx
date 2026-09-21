import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** /managed — kept as an ADDRESS, not a page (21 Sep 2026, the user: *"No need
 *  for it"*).
 *
 *  It was S_managed (6332-6378), one list over everything a person runs. What
 *  made it redundant was not this decision but the year's worth before it: the
 *  Classes and Events tiles on every grid open the same rows through the desks
 *  that can actually ACT on them, so this screen had become a view of a view.
 *  ⚠ Its last door went on 21 Sep with the empty-day pills, and nothing on any
 *  grid had named it since 19 Sep — so it has been reachable only by typing the
 *  address, which is the state the user was asked about and answered.
 *
 *  ⚠ IT IS A REDIRECT AND NOT A 404 (Rule 14: a link handed out is a promise,
 *  and the installed TWA reopens on the last URL it showed). The nearest true
 *  thing is the screen that lists what the account asking actually runs: an
 *  organization's is the HUB — every studio it owns, each with its own desks
 *  behind it — and everybody else's register is their classes.
 *  ⚠ NOT the organization's events desk, though that was the first instinct:
 *  its address needs the hosting row's id, and `my_org_business()` MAKES that
 *  row on first ask, so a redirect would be a WRITE. The hub is one read and
 *  is the truer answer anyway — S_managed was "everything you manage", and for
 *  an organization that is its studios.
 *
 *  What went with the page: `ManagedScreen`, `repositories/managed.ts`,
 *  `types/managed.ts` and `rls-proof-managed.ps1`. ⚠ Deleted rather than left
 *  standing, because this repo's own rule is that a branch nobody renders is
 *  where a defect hides — the dead "Where you stand with DanceOS" link found
 *  earlier today had survived in exactly that way. The reads it used are
 *  ordinary ones every desk still makes. */
export default async function ManagedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id).catch(() => null);
  redirect(profile?.role === "org" ? "/business" : "/my-classes?show=manage");
}
