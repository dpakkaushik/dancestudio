import { StatsScreen } from "@/features/stats/components/StatsScreen";
import { findDiscoverCities } from "@/repositories/cities";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findChart, findEntityChartRow, findMyHistory, findMyPlace, findMyStats } from "@/repositories/stats";
import { EMPTY_STATS, parseChartMetric, type ChartSegment, type DanceStats, type Standing } from "@/types/stats";

/* ⚠ "history" went on 2 Oct 2026 (the user: "remove history from stats for all
   profiles") — an old `?tab=history` link falls through to Record */
const TABS = ["record", "charts"] as const;
const SEGMENTS: ChartSegment[] = ["dancer", "artist", "studio", "crew"];

export type StatsQuery = { tab?: string; seg?: string; city?: string; metric?: string; style?: string };

export interface StatsSubject {
  kind: "person" | "studio" | "crew";
  id: string;
  name: string;
  /** the kind's word over the name — Dancer · Artist · Studio · Crew */
  eyebrow: string;
  accent: string;
  /** the page this record belongs to */
  backHref: string;
  /** the board this subject stands on — NOT the board being browsed */
  segment: ChartSegment;
  city: string | null;
  isArtist: boolean;
  /** a person's figures, already read by the page: their own, or
   *  `person_dance_stats` for somebody else. Null for a studio and a crew,
   *  whose record is their board row. */
  stats?: DanceStats | null;
}

/** ONE STATS SCREEN, THREE COLUMNS, EVERY PROFILE (29 Sep 2026).
 *
 *  The user: *"you messed up with the stats page — it was supposed to be the one
 *  with the graphs and number grid, history and rankings in 3 columns for all
 *  profiles."* They are right, and this undoes C86: that day the two stats
 *  screens were collapsed the WRONG WAY ROUND — `StatsScreen`, the three-column
 *  one, was deleted and the thin `EntityStatsPage` kept, so the record's graphs,
 *  the number grid and the whole History library went with it. What the ask
 *  wanted was the rich screen made universal, not the poor one.
 *
 *  This is the gatherer for it, and it is a component rather than a route for
 *  the reason `OwnStatsScreen` was (C40, 22 Sep): seven of these reads are
 *  scoped to `auth.uid()` INSIDE the database, so they cannot be pointed at a
 *  subject from a redirect.
 *
 *  ⚠⚠ WHAT EACH COLUMN CAN HONESTLY ANSWER, AND WHY, because it is not uniform:
 *  · **Rankings** works for every profile and every reader — `entity_chart_row`
 *    answers for a public artist, a listed studio and a live crew even signed
 *    out, and `dance_chart` gives any signed-in reader the boards.
 *  · **Record** works for every profile: a person's three sides come from
 *    `person_dance_stats` (the same arithmetic as `my_dance_stats`, keyed on a
 *    person), a studio's and a crew's from their own board row.
 *  · **History, the graphs and the number grid's LISTS are the caller's own** —
 *    `my_session_history` has no `p_user_id` by Step 25's design, and there is
 *    no per-studio or per-crew equivalent at all. The columns are still drawn
 *    and say which read is missing, because an empty shelf would read as a
 *    measured zero. The migration that closes it is held for the user's word. */
export async function StatsPageBody({ subject, query, basePath }: { subject: StatsSubject; query: StatsQuery; basePath: string }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isMe = subject.kind === "person" && user?.id === subject.id;
  /** ⚠ `dance_chart` is granted to `authenticated` only (Step 25: "a person's
   *  activity is not public data"), so a signed-out reader gets the standings —
   *  which ARE public for a public entity — and is told where the boards are. */
  const canBrowseBoards = Boolean(user);

  const tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as (typeof TABS)[number]) : "record";
  /** the board being BROWSED. It opens on the subject's own, which is what
   *  somebody pressing Rankings on a profile came to see. */
  const segment: ChartSegment = SEGMENTS.includes((query.seg ?? "") as ChartSegment) ? (query.seg as ChartSegment) : subject.segment;
  const cityList = await findDiscoverCities(supabase);
  const city = cityList.some((c) => c.city === query.city) ? (query.city as string) : null;
  const metric = parseChartMetric(query.metric);
  const styleFilter = (DOS_STYLE_NAMES as readonly string[]).includes(query.style ?? "") ? (query.style as string) : null;

  /* the server's clock, once: the record's buckets are cut against it */
  const nowIso = new Date().toISOString();

  /* ⚠ the History column's UPCOMING read (`findMyCalendar`) went with it (2 Oct
     2026). The past sessions (`findMyHistory`) stay: Record's graphs and number
     grid are counted off them */
  const [ownStats, history, chart, myPlace, boardPlace, everywhere, inCity] = await Promise.all([
    isMe ? findMyStats(supabase) : Promise.resolve(null),
    isMe ? findMyHistory(supabase) : Promise.resolve([]),
    tab === "charts" && canBrowseBoards ? findChart(supabase, { segment, city, style: styleFilter }) : Promise.resolve([]),
    isMe ? findMyPlace(supabase, "dancer", null) : Promise.resolve(null),
    /* where YOU stand on THIS board — a people board only, and only when it is
       your own record (the prototype pins a "you" row on Dancers and Artists) */
    isMe && tab === "charts" && (segment === "dancer" || segment === "artist") ? findMyPlace(supabase, segment, city) : Promise.resolve(null),
    findEntityChartRow(supabase, { segment: subject.segment, id: subject.id }),
    subject.city ? findEntityChartRow(supabase, { segment: subject.segment, id: subject.id, city: subject.city }) : Promise.resolve(null),
  ]);

  const standings: Standing[] = [{ scope: "Everywhere", row: everywhere }, ...(subject.city ? [{ scope: `In ${subject.city}`, row: inCity }] : [])];

  /* the styles a board can be narrowed by: the ones its rows carry, plus the
     one already chosen (so a filter that empties the board can still be cleared) */
  const chartStyles = [...new Set([...(styleFilter ? [styleFilter] : []), ...chart.map((r) => r.style).filter((s): s is string => Boolean(s))])];

  return (
    <StatsScreen
      name={subject.name}
      eyebrow={subject.eyebrow}
      accent={subject.accent}
      backHref={subject.backHref}
      subjectKind={subject.kind}
      isMe={isMe}
      canBrowseBoards={canBrowseBoards}
      standings={standings}
      boardRow={everywhere}
      isArtist={subject.isArtist}
      stats={ownStats ?? subject.stats ?? EMPTY_STATS}
      history={history}
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
