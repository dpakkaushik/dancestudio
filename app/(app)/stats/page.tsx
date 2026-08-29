import { redirect } from "next/navigation";
import { StatsScreen } from "@/features/stats/components/StatsScreen";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCalendar } from "@/repositories/calendar";
import { findProfileById } from "@/repositories/profiles";
import { findChart, findMyHistory, findMyPlace, findMyStats } from "@/repositories/stats";
import { parseChartMetric, type ChartSegment } from "@/types/stats";

const TABS = ["record", "history", "charts"] as const;
const SEGMENTS: ChartSegment[] = ["dancer", "artist", "studio", "crew"];
const DAY_MS = 86_400_000;

/** Stats — the prototype's three dresses of one screen (S_profiletab's
 *  historyOnly / classesOnly / chartsOnly), as URL state so a board is a link:
 *  `tab`, `seg`, `city`, `metric` and `style` all live in the address. Every
 *  figure comes from a database function, so a number and the list behind it
 *  cannot disagree (prototype 9950). */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ tab?: string; seg?: string; city?: string; metric?: string; style?: string }> }) {
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
  const metric = parseChartMetric(params.metric);
  const styleFilter = (DOS_STYLE_NAMES as readonly string[]).includes(params.style ?? "") ? (params.style as string) : null;

  /* the server's clock, once: the record's buckets and the History's UPCOMING
     group are both cut against it */
  const nowIso = new Date().toISOString();
  const aheadIso = new Date(new Date(nowIso).getTime() + 120 * DAY_MS).toISOString();

  const [profile, stats, history, upcoming, chart, myPlace, boardPlace] = await Promise.all([
    findProfileById(supabase, user.id),
    findMyStats(supabase),
    findMyHistory(supabase),
    tab === "history" ? findMyCalendar(supabase, user.id, nowIso, aheadIso) : Promise.resolve([]),
    tab === "charts" ? findChart(supabase, { segment, city, style: styleFilter }) : Promise.resolve([]),
    findMyPlace(supabase, "dancer", null),
    /* where you stand on THIS board — a people board only (the prototype pins a
       "you" row on Dancers and Artists, 9674) */
    tab === "charts" && (segment === "dancer" || segment === "artist") ? findMyPlace(supabase, segment, city) : Promise.resolve(null),
  ]);

  /* the styles a board can be narrowed by: the ones its rows carry, plus the
     one already chosen (so a filter that empties the board can still be cleared) */
  const chartStyles = [...new Set([...(styleFilter ? [styleFilter] : []), ...chart.map((r) => r.style).filter((s): s is string => Boolean(s))])];

  return (
    <StatsScreen
      name={profile?.fullName ?? "You"}
      role={profile?.role ?? "dancer"}
      stats={stats}
      history={history}
      upcoming={upcoming.filter((e) => new Date(e.startsAt).getTime() >= new Date(nowIso).getTime())}
      chart={chart}
      segment={segment}
      metric={metric}
      city={city}
      styleFilter={styleFilter}
      cities={DOS_CITIES}
      chartStyles={chartStyles}
      myPlace={myPlace}
      boardPlace={boardPlace}
      tab={tab}
      nowIso={nowIso}
    />
  );
}
