import { StatsScreen } from "@/features/stats/components/StatsScreen";
import { findDiscoverCities } from "@/repositories/cities";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCalendar } from "@/repositories/calendar";
import { findChart, findMyHistory, findMyPlace, findMyStats } from "@/repositories/stats";
import { parseChartMetric, type ChartSegment } from "@/types/stats";

const TABS = ["record", "history", "charts"] as const;
const SEGMENTS: ChartSegment[] = ["dancer", "artist", "studio", "crew"];
const DAY_MS = 86_400_000;

export type StatsQuery = { tab?: string; seg?: string; city?: string; metric?: string; style?: string };

/** THE OWNER'S OWN RECORD, WHEREVER IT IS READ FROM (22 Sep 2026).
 *
 *  This was the whole body of `/stats/page.tsx`, and it is a component for the
 *  same reason `OwnProfileScreen` is (C40): a person's stats had **two
 *  addresses** — `/stats`, which drew this screen, and `/person/{me}/stats`,
 *  which drew `EntityStatsPage`, the version built for somebody ELSE to read.
 *  So typing your own id showed you the stranger's view of yourself: the same
 *  defect C32 and C40 closed for the profile, one page further on.
 *
 *  ⚠ The reads cannot simply be pointed at from a redirect, because seven of
 *  them are scoped to `auth.uid()` INSIDE the database (`my_dance_stats`,
 *  `my_session_history`, `my_chart_place`) — there is no `p_user_id` to aim at
 *  anybody, by Step 25's own design. So the owner's screen is the caller's, and
 *  `/person/{id}/stats` renders it only when the id IS the caller.
 *
 *  ⚠ `basePath` is what the screen builds its own tab, segment, city, metric and
 *  style links from. Passing it is not decoration: every one of those is URL
 *  state, and they were `/stats?…` — the address that is a redirect now. */
export async function OwnStatsScreen({ userId, name, isArtist, query, basePath }: { userId: string; name: string; isArtist: boolean; query: StatsQuery; basePath: string }) {
  const supabase = await createSupabaseServerClient();

  const tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as (typeof TABS)[number]) : "record";
  const segment: ChartSegment = SEGMENTS.includes((query.seg ?? "") as ChartSegment) ? (query.seg as ChartSegment) : "studio";
  /* the boards filter by any city the registry knows (11 Sep 2026) — it was one
     of twelve, so a dancer could not see their own city's board unless DanceOS
     had thought of it */
  const cityList = await findDiscoverCities(supabase);
  const city = cityList.some((c) => c.city === query.city) ? (query.city as string) : null;
  const metric = parseChartMetric(query.metric);
  const styleFilter = (DOS_STYLE_NAMES as readonly string[]).includes(query.style ?? "") ? (query.style as string) : null;

  /* the server's clock, once: the record's buckets and the History's UPCOMING
     group are both cut against it */
  const nowIso = new Date().toISOString();
  const aheadIso = new Date(new Date(nowIso).getTime() + 120 * DAY_MS).toISOString();

  const [stats, history, upcoming, chart, myPlace, boardPlace] = await Promise.all([
    findMyStats(supabase),
    findMyHistory(supabase),
    tab === "history" ? findMyCalendar(supabase, userId, nowIso, aheadIso) : Promise.resolve([]),
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
      name={name}
      isArtist={isArtist}
      stats={stats}
      history={history}
      upcoming={upcoming.filter((e) => new Date(e.startsAt).getTime() >= new Date(nowIso).getTime())}
      chart={chart}
      segment={segment}
      metric={metric}
      city={city}
      styleFilter={styleFilter}
      cities={cityList.map((c) => c.city)}
      chartStyles={chartStyles}
      myPlace={myPlace}
      boardPlace={boardPlace}
      tab={tab}
      nowIso={nowIso}
      basePath={basePath}
    />
  );
}
