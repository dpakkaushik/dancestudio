import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** `/stats` IS AN ADDRESS NOW, NOT A SCREEN (22 Sep 2026).
 *
 *  The user: *"fix duplicates first."* A person's stats had two addresses —
 *  this one, which drew `StatsScreen`, and `/person/{me}/stats`, which drew
 *  `EntityStatsPage`, the version written for somebody ELSE to read. So the
 *  richer screen was the one you could only reach by not naming yourself, and
 *  typing your own id gave you the stranger's view of your own record. That is
 *  the pair C32 found drifting five ways on the profile and C40 collapsed;
 *  this is the same pair one page further on.
 *
 *  ⚠ THE ROUTE STAYS, AND MUST (Rule 14): a bookmark, a link somebody was
 *  handed and the installed TWA's last URL all still open it. Every CONTROL
 *  that pointed here is gone — the crew desk's "See crew ranking" went with the
 *  battle record and `OrgDashboard` with organizations (both 29 Sep 2026), and
 *  the crew home's chip and the stats page's own "see the whole board" went the
 *  same day with the boards.
 *
 *  ⚠⚠ THE QUERY STILL RIDES ALONG, AND IT NOW BUYS NOTHING — WHICH IS WHY IT IS
 *  KEPT RATHER THAN DROPPED. Every tab, board, city, metric and style was URL
 *  state (19 Sep 2026) and the screen that read them went on 29 Sep, when the
 *  two stats screens became one (the user: "should only have one view when
 *  looking at your profile or someone else"). `EntityStatsPage` ignores them.
 *  Carrying them costs a line and means an old `?tab=charts&seg=crew` bookmark
 *  lands on a real record rather than a 404 — and the day a board screen comes
 *  back, the parameters are already arriving. */
export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0] != null) q.set(k, v[0]);
  }
  const search = q.size > 0 ? `?${q.toString()}` : "";
  redirect(`/person/${user.id}/stats${search}`);
}
