import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** /managed — kept as an ADDRESS, not a page (21 Sep 2026, the user: *"No need
 *  for it"*).
 *
 *  It was S_managed (6332-6378), one list over everything a person runs. What
 *  made it redundant was not this decision but the year's worth before it: the
 *  Classes tile on every grid opens the same rows through the desk that can
 *  actually ACT on them, so this screen had become a view of a view.
 *  ⚠ Its last door went on 21 Sep with the empty-day pills, and nothing on any
 *  grid had named it since 19 Sep — so it has been reachable only by typing the
 *  address, which is the state the user was asked about and answered.
 *
 *  ⚠ IT IS A REDIRECT AND NOT A 404 (Rule 14: a link handed out is a promise,
 *  and the installed TWA reopens on the last URL it showed). The nearest true
 *  thing is the screen that lists what the account asking actually runs, which
 *  is their register. ⚠ The organization arm — the studios hub — went with
 *  organizations on 29 Sep 2026, and with it the read that decided between the
 *  two, so this is one hop and no round trip at all.
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
  /* ⚠ the organization arm ("/business", its studios' desks) went with
     organizations on 29 Sep 2026 — everybody's register is their classes */
  redirect("/my-classes?show=manage");
}
