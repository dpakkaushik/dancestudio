import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

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
 *  ⚠ THE ROUTE STAYS, AND MUST (Rule 14). The crew desk's "See crew ranking"
 *  and a crew's home both open `/stats?tab=charts&seg=crew`, `OrgDashboard`
 *  opens `…&seg=studio`, and neither knows the VIEWER's id — which is the whole
 *  reason `/profile` survives too. A bookmark and the installed TWA's last URL
 *  are the rest of it.
 *
 *  ⚠⚠ AND THE QUERY RIDES ALONG, WHICH IS MOST OF THE POINT. Every tab, board,
 *  city, metric and style on that screen is URL state (19 Sep 2026), so a
 *  redirect that dropped the parameters would have answered every "see the crew
 *  ranking" with somebody's own record instead — a silent half-fix that only a
 *  press finds, exactly as `?settings=1` would have been on `/profile`. */
export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0] != null) q.set(k, v[0]);
  }
  const search = q.size > 0 ? `?${q.toString()}` : "";
  redirect(`${profile.role === "org" ? "/org" : "/person"}/${user.id}/stats${search}`);
}
