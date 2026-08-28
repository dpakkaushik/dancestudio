import { redirect } from "next/navigation";
import { StatsScreen } from "@/features/stats/components/StatsScreen";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findChart, findMyHistory, findMyPlace, findMyStats } from "@/repositories/stats";
import type { ChartSegment } from "@/types/stats";

const TABS = ["record", "history", "charts"] as const;
const SEGMENTS: ChartSegment[] = ["dancer", "artist", "studio", "crew"];

/** Stats — the prototype's three dresses of one screen (S_profiletab's
 *  historyOnly / classesOnly / chartsOnly), as URL state so a board is a link.
 *  Every figure comes from a database function, so a number and the list behind
 *  it cannot disagree (prototype 9950). */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ tab?: string; seg?: string; city?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tab = (TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as (typeof TABS)[number]) : "record";
  const segment: ChartSegment = SEGMENTS.includes((params.seg ?? "") as ChartSegment) ? (params.seg as ChartSegment) : "studio";
  const city = (DOS_CITIES as readonly string[]).includes(params.city ?? "") ? (params.city as string) : null;

  const [profile, stats, history, chart, myPlace] = await Promise.all([
    findProfileById(supabase, user.id),
    findMyStats(supabase),
    findMyHistory(supabase),
    tab === "charts" ? findChart(supabase, { segment, city }) : Promise.resolve([]),
    findMyPlace(supabase, "dancer", null),
  ]);

  return (
    <StatsScreen
      name={profile?.fullName ?? "You"}
      stats={stats}
      history={history}
      chart={chart}
      segment={segment}
      city={city}
      cities={DOS_CITIES}
      myPlace={myPlace}
      tab={tab}
    />
  );
}
