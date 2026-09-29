"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CitySelect } from "@/features/geo/components/CitySelect";
import { useState } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { Sheet } from "@/features/profiles/components/profile-kit";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { CalendarEntry } from "@/types/calendar";
import { CHART_METRICS, CHART_SEGMENTS, CREW_POINT_RULES, POINT_RULES, SEG_WORD, SIDE_TINT, SIDE_VERB, chartRowWords, hoursWords, type ChartMetric, type ChartRow, type ChartSegment, type DanceStats, type HistoryRow, type Side, type Standing } from "@/types/stats";

/** Stats — the prototype's Stats is one screen in three dresses, all of
 *  S_profiletab: YOUR RECORD (historyOnly 9862 — "A LIBRARY, NOT A DASHBOARD"),
 *  HISTORY (classesOnly 9708) and GLOBAL RANKINGS (chartsOnly 9610). The tab is
 *  URL state so a board is a link.
 *
 *  The rule the whole screen is built on is the prototype's own (9950): a number
 *  and the list behind it are THE SAME NUMBER. Every tally here is counted off the
 *  rows the History list prints, so they cannot disagree — and "a zero is not a
 *  record, it is an empty shelf" (10017): a small card with nothing behind it is
 *  not drawn.
 *
 *  Lifted this run (the parity audit's X1-X5): the three record cards in their
 *  own colours with the hours on them, the two kinds of artist ("Assisted for" /
 *  "Trained under" — 9958: two different relationships), no Rooms card for a
 *  dancer, WHAT YOU DANCE MOST (10077), THE WHOLE RECORD (10194: the side tiles,
 *  the stacked SESSIONS chart by day / week / month with the total over every
 *  bar, and group-by with sortable bars), History as its own page with its
 *  groups and day headings (9775), Charts with its own hero, a metric selector,
 *  a style filter, the pinned "you" row and top-3 gradient numerals (9642). Not
 *  lifted, tracked: the Competing arm and Wins (no score is recorded), the
 *  ▲/▼ movement (no rank history), the filters drawer's provider / assistant /
 *  room rows, drafts on a person's History (a person has none). */

type Tab = "record" | "history" | "charts";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const shelf: React.CSSProperties = { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, fontFamily: DOS_DISPLAY };
const figure: React.CSSProperties = { fontFamily: DOS_MONO, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 };
const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
const dayWords = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(iso));
const timeWords = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toLowerCase();
const monthWords = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`)) : "—");
/** "WED 12 AUG" — the day heading over a group of sessions (9843) */
const dayHeading = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(",", "").toUpperCase();
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D";

/* the side's own words on the record page (9998-10000): what the figure MEANS */
const SIDE_CARD: Record<Side, string> = { conducted: "Classes taught", assisted: "Assisted on", attended: "Classes taken" };
const SIDE_PAST: Record<Side, string> = { conducted: "Taught", assisted: "Assisted", attended: "Trained" };
const SIDES: Side[] = ["conducted", "assisted", "attended"];

type Grain = "day" | "week" | "month";
type Dim = "style" | "artist" | "studio";
type SortKey = "sessions" | "hours" | "key";

const DAY_MS = 86_400_000;

/** WHERE THIS SUBJECT STANDS, ONE SCOPE PER CARD — nationally, then in its own
 *  city. Lifted out of `EntityStatsPage` (push 2, 19 Sep 2026) when that screen
 *  was folded back into this one: it is the half of it that was right, and it is
 *  what makes the Rankings column about the profile you are looking at rather
 *  than only a board you are browsing.
 *
 *  ⚠ Step 25's rule: a place is never printed without its population, and a
 *  subject that is not on the board yet is SAID rather than drawn as "#0". */
function StandingCard({ s, accent }: { s: Standing; accent: string }) {
  const r = s.row;
  return (
    <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderLeft: `4px solid ${accent}`, borderRadius: 16, padding: "12px 14px", marginBottom: 8 }} data-testid="standing-card">
      <div style={{ ...micro, color: MUTED }}>{s.scope}</div>
      {r ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
          <span aria-label={`Place ${r.place} of ${r.population}`} style={{ display: "flex", alignItems: "baseline", gap: 1, lineHeight: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 900, fontFamily: DOS_DISPLAY, color: accent, opacity: 0.8 }}>#</span>
            <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", background: "linear-gradient(120deg,#7C3AED,#EC4899)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{r.place}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>
              of {r.population} {r.population === 1 ? SEG_WORD[r.kind].one : SEG_WORD[r.kind].many}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{chartRowWords(r)}</span>
          </span>
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", ...figure, fontSize: 15 }}>{r.points}</span>
            <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: MUTED }}>pts</span>
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: SUB, marginTop: 6, lineHeight: 1.45 }}>Not on this board yet — nothing counted here so far.</div>
      )}
    </div>
  );
}

export function StatsScreen({
  name,
  eyebrow,
  accent,
  backHref,
  subjectKind,
  isMe,
  canBrowseBoards,
  standings,
  boardRow,
  isArtist,
  stats,
  history,
  upcoming,
  chart,
  segment,
  metric,
  city,
  styleFilter,
  cities,
  chartStyles,
  myPlace,
  boardPlace,
  tab,
  nowIso,
  basePath,
}: {
  name: string;
  /** the kind's word over the name — Dancer · Artist · Studio · Crew */
  eyebrow: string;
  /** the entity's own colour: the hero's wash and the standing cards' edge */
  accent: string;
  /** the page this record belongs to */
  backHref: string;
  subjectKind: "person" | "studio" | "crew";
  /** ⚠ WHOSE RECORD THIS IS, AND IT DECIDES WHAT CAN BE DRAWN AT ALL (29 Sep
   *  2026). `my_session_history` and `my_dance_stats` are scoped to `auth.uid()`
   *  INSIDE the database by Step 25's own design — there is no `p_user_id` to
   *  aim at anybody — so the per-session rows every graph, the number grid's
   *  LISTS and the whole History column are built on exist for the caller and
   *  for nobody else. A person's FIGURES do reach further (`person_dance_stats`),
   *  and a studio's and a crew's come off their board row. So this flag is not a
   *  permission: it is what the reads can answer, and each column says so rather
   *  than drawing an empty shelf that reads as a zero. */
  isMe: boolean;
  /** ⚠ `dance_chart` is granted to `authenticated` only, so a signed-out reader
   *  gets the standings — public for a public entity — and is told where the
   *  boards are rather than meeting an error. */
  canBrowseBoards: boolean;
  /** where this subject stands — nationally, then in its city */
  standings: Standing[];
  /** its own row on its board: a studio's and a crew's record IS this */
  boardRow: ChartRow | null;
  /** the plan's word — an artist reads "Artist" where a learner reads "Taught by" */
  isArtist: boolean;
  stats: DanceStats;
  history: HistoryRow[];
  /** what is still to come — bookings and confirmed claims (the calendar's rows) */
  upcoming: CalendarEntry[];
  chart: ChartRow[];
  segment: ChartSegment;
  metric: ChartMetric;
  city: string | null;
  styleFilter: string | null;
  cities: readonly string[];
  /** the styles a board can be narrowed by — off the rows themselves */
  chartStyles: string[];
  /** where you stand among dancers — the hero's line */
  myPlace: { place: number; population: number; points: number } | null;
  /** where you stand on THIS board, when it is a people board */
  boardPlace: { place: number; population: number; points: number } | null;
  tab: Tab;
  /** the server's clock — the record's buckets are counted against it, never against a clock read during render */
  nowIso: string;
  /** ⚠ THE ADDRESS THIS SCREEN IS BEING READ AT — `/person/{id}/stats` (22 Sep
   *  2026). Every tab, segment, metric, city and style on this screen is URL
   *  state, and they were all built as `/stats?…` — the address that is now a
   *  REDIRECT to this one, so each press would have cost a round trip to land
   *  where it already was. A STRING, never a builder: a server component may
   *  not hand a function to a client one, which cost two minutes and a runtime
   *  React #441 on the Earnings screen (21 Sep). */
  basePath: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /** the points rules on the Charts board — a disclosure since 27 Sep, where a
   *  permanent full-width card stood between the controls and the board */
  const [rulesOpen, setRulesOpen] = useState(false);
  const [side, setSide] = useState<Side | "all">("all");
  const [styleSel, setStyleSel] = useState<string | null>(null);
  const [cvSide, setCvSide] = useState<Side>("attended");
  const [grain, setGrain] = useState<Grain>("week");
  const [dim, setDim] = useState<Dim>("style");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [asc, setAsc] = useState(false);

  /* the tallies the record opens into, counted off the SAME rows the list prints */
  const tally = (rows: HistoryRow[], pick: (r: HistoryRow) => string | null): Array<[string, string]> => {
    const m = new Map<string, { n: number; last: string }>();
    rows.forEach((r) => {
      const k = pick(r);
      if (!k) return;
      const cur = m.get(k);
      if (cur) cur.n += 1;
      else m.set(k, { n: 1, last: dayWords(r.startsAt) });
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, `${v.n} session${v.n === 1 ? "" : "s"} · last ${v.last}`]);
  };
  const bySide = (s: Side) => history.filter((r) => r.side === s);
  const styleRows = tally(history, (r) => r.style);
  const studioRows = tally(history, (r) => r.businessName);
  /* two kinds of artist, and they are not the same person (9958) */
  const assistedFor = tally(bySide("assisted"), (r) => r.artistName);
  const trainedUnder = tally(bySide("attended"), (r) => r.artistName);

  const shown = history.filter((r) => (side === "all" || r.side === side) && (!styleSel || r.style === styleSel));
  const historyStyles = [...new Set(history.map((r) => r.style))];
  const isCrew = segment === "crew";
  const isStudio = segment === "studio";
  const peopleBoard = segment === "dancer" || segment === "artist";

  const router = useRouter();
  const chartHref = (over: { seg?: ChartSegment; city?: string | null; metric?: ChartMetric; style?: string | null }) => {
    const seg = over.seg ?? segment;
    const c = over.city === undefined ? city : over.city;
    const m = over.metric ?? metric;
    const st = over.style === undefined ? styleFilter : over.style;
    const q = [`tab=charts`, `seg=${seg}`, c ? `city=${encodeURIComponent(c)}` : null, m !== "overall" ? `metric=${m}` : null, st ? `style=${encodeURIComponent(st)}` : null].filter(Boolean).join("&");
    return `${basePath}?${q}`;
  };
  const tabHref = (t: Tab) => (t === "charts" ? chartHref({}) : `${basePath}?tab=${t}`);

  /** ⚠⚠ A ZERO IS DRAWN NOW (27 Sep 2026, the user: *"show all metrics for
   *  that particular profile type even if its 0"*), which REVERSES the
   *  prototype's own rule at 10017 and the 29 Aug lift of it.
   *
   *  The old rule made a record read as a different SHAPE for every person: a
   *  dancer who had not assisted saw three cards, somebody who had saw four,
   *  and neither could tell whether the fourth was missing or zero. A metric
   *  that belongs to this kind of profile is part of what the record IS, and
   *  "0" is a measurement — the thing this file refuses to print is a RANK of
   *  zero ("#0 is not a rank"), which is a different claim entirely and is
   *  still refused, in EntityStatsPage and in the pinned you-row.
   *
   *  ⚠ The three BIG cards above have always drawn their zeros, so this also
   *  ends a disagreement inside one screen. */
  const small: Array<[string, number, string, Array<[string, string]>]> = [
    ["Styles", styleRows.length, "#22C55E", styleRows],
    ["Assisted for", assistedFor.length, "#0D9488", assistedFor],
    ["Trained under", trainedUnder.length, "#EAB308", trainedUnder],
    ["Studios", studioRows.length, "#14B8A6", studioRows],
  ];

  /** WHICH OF THE FOUR IS OPEN, AND ITS ROWS (27 Sep 2026). Derived from `open`
   *  rather than held beside it, so the sheet cannot come to show one card's
   *  heading over another's list — and a card whose rows change under it (the
   *  side filter re-counts `small` on every render) keeps showing the right
   *  ones. */
  const openRows = open ? (small.find(([l]) => l === open) ?? null) : null;

  /* WHAT YOU DANCE MOST (10077): the styles, most-danced first, at most eight */
  const styleShelf = (() => {
    const by = new Map<string, number>();
    history.forEach((r) => by.set(r.style, (by.get(r.style) ?? 0) + 1));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  /* THE WHOLE RECORD (10194): the chosen side, bucketed against the calendar */
  const now = new Date(nowIso).getTime();
  const B = grain === "day" ? 14 : grain === "week" ? 8 : 3;
  const per = grain === "day" ? 1 : grain === "week" ? 7 : 30;
  const buckets = Array.from({ length: B }, () => ({ conducted: 0, assisted: 0, attended: 0 }));
  history.forEach((r) => {
    const back = Math.floor((now - new Date(r.startsAt).getTime()) / (DAY_MS * per));
    if (back >= 0 && back < B) buckets[B - 1 - back][r.side] += 1;
  });
  const top = Math.max(1, ...buckets.map((b) => b.conducted + b.assisted + b.attended));
  const grainLabel = grain === "day" ? "last 14 days" : grain === "week" ? "last 8 weeks" : "last 3 months";
  const keyOf = (r: HistoryRow) => (dim === "style" ? r.style : dim === "artist" ? (r.artistName ?? "—") : (r.businessName ?? r.room ?? "—"));
  const groups = (() => {
    const g = new Map<string, { key: string; sessions: number; hours: number }>();
    bySide(cvSide).forEach((r) => {
      const k = keyOf(r);
      const cur = g.get(k) ?? { key: k, sessions: 0, hours: 0 };
      cur.sessions += 1;
      cur.hours += r.minutes / 60;
      g.set(k, cur);
    });
    const rows = [...g.values()].map((x) => ({ ...x, hours: Math.round(x.hours * 10) / 10 }));
    rows.sort((a, b) => (sortKey === "key" ? (asc ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)) : asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return rows;
  })();
  const mx = Math.max(1, ...groups.map((x) => x[sortKey === "key" ? "sessions" : sortKey]));
  const DIMS: Array<[Dim, string]> = [
    ["style", "Dance style"],
    ["artist", isArtist ? "Artist" : "Taught by"],
    ["studio", "Studio"],
  ];

  /* the History groups (9840-9857): what is still to come, and what is over, each under its day */
  const withDays = <T,>(rows: T[], at: (r: T) => string) => {
    const out: Array<{ day: string; rows: T[] }> = [];
    rows.forEach((r) => {
      const d = dayHeading(at(r));
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    });
    return out;
  };
  const upcomingShown = upcoming.filter((e) => (!styleSel || e.style === styleSel) && (side === "all" || (side === "conducted" ? e.side === "hosting" : side === "assisted" ? e.side === "assisting" : e.side === "attending")));

  /* the board, in the order the metric asks for (9612, 9699-9703) */
  const valueOf = (r: ChartRow) => (metric === "overall" ? r.points : metric === "conducted" ? r.conducted : metric === "assisted" ? r.assisted : metric === "attended" ? r.attended : Math.round(r.hours * 10) / 10);
  const unit = CHART_METRICS.find((m) => m.k === metric)?.unit ?? "pts";
  const board = metric === "overall" ? chart : [...chart].sort((a, b) => valueOf(b) - valueOf(a)).map((r, i) => ({ ...r, place: i + 1 }));

  /* ── WHOSE RECORD, AND WHAT CAN BE SAID ABOUT IT ─────────────────────────── */
  const isPerson = subjectKind === "person";
  /** the subject's own row on its own board — its national standing, falling back
   *  to whichever scope did answer. `kind` on it is the subject's segment, which
   *  is NOT `segment`: that is the board currently being browsed. */
  const subjectRow = standings.find((s) => s.row)?.row ?? boardRow;
  /** ⚠ ONE LINE, THREE READINGS, so the same pixels never mean two things: your
   *  place if the caller's own read answered, otherwise the subject's own row. */
  const placeLine = myPlace
    ? `#${myPlace.place} of ${myPlace.population} dancers`
    : subjectRow
      ? `#${subjectRow.place} of ${subjectRow.population} ${SEG_WORD[subjectRow.kind].many}`
      : null;
  const recordPoints = isPerson ? stats.points : (subjectRow?.points ?? 0);
  const heroLine =
    tab === "charts"
      ? placeLine
        ? `${placeLine} · ${recordPoints} points`
        : "Not on a board yet"
      : `${recordPoints} points${placeLine ? ` · ${placeLine}` : ""}`;
  /** ⚠ THE SESSIONS BEHIND THE FIGURES ARE THE CALLER'S OWN, AND ONLY THEIRS.
   *  So the graphs, the number grid's lists and the History column are drawn
   *  when this record IS the caller's, and what stands in their place elsewhere
   *  is the sentence saying which read is missing — never an empty shelf, which
   *  would read as a measured zero (the rule at 10017, pointing the other way). */
  /* ⚠ `history` is EMPTY for anybody but the caller, so the two blocks below it
     — "What you dance most" and "The whole record" — already draw nothing on
     somebody else's record by their own `length > 0` guards. No second flag
     gates them: one condition, in one place, is what stops the two disagreeing. */

  /** THE CARDS THAT ARE THE RECORD. A person's are the three sides of the floor
   *  (Step 25's own trio, and they work for anybody — `person_dance_stats` is the
   *  same arithmetic keyed on a person). A studio's and a crew's are their own
   *  board row, which is the only per-entity arithmetic the database publishes
   *  for them; it is thinner, and it is thin honestly rather than padded. */
  const recordCards: Array<{ key: string; label: string; n: number; sub: string; aria: string; colour: string }> = isPerson
    ? SIDES.map((k) => {
        const n = k === "conducted" ? stats.sessionsConducted : k === "assisted" ? stats.sessionsAssisted : stats.sessionsAttended;
        const h = hoursWords(k === "conducted" ? stats.hoursConducted : k === "assisted" ? stats.hoursAssisted : stats.hoursAttended);
        /* ⚠ THE ACCESSIBLE NAME IS THE PROTOTYPE'S SENTENCE, unchanged through
           this rebuild: "Classes taken — 0 sessions, 0 h". It is what the suite
           reads a card by, and a card whose name is assembled from its own
           fragments ("— 0 0 h") is legible to nobody. */
        return { key: k, label: SIDE_CARD[k], n, sub: h, aria: `${SIDE_CARD[k]} — ${n} session${n === 1 ? "" : "s"}, ${h}`, colour: SIDE_TINT[k] };
      })
    : subjectKind === "studio"
      ? [
          { key: "conducted", label: "Sessions held", n: subjectRow?.conducted ?? 0, sub: hoursWords(subjectRow?.hours ?? 0), aria: `Sessions held — ${subjectRow?.conducted ?? 0}, ${hoursWords(subjectRow?.hours ?? 0)}`, colour: SIDE_TINT.conducted },
          { key: "floor", label: "On the floor", n: subjectRow?.extra ?? 0, sub: "people", aria: `On the floor — ${subjectRow?.extra ?? 0} people`, colour: SIDE_TINT.attended },
          { key: "points", label: "Points", n: Math.round(subjectRow?.points ?? 0), sub: "on the board", aria: `Points — ${Math.round(subjectRow?.points ?? 0)} on the board`, colour: "#7C3AED" },
        ]
      : [
          { key: "members", label: "Members", n: subjectRow?.extra ?? 0, sub: "confirmed", aria: `Members — ${subjectRow?.extra ?? 0} confirmed`, colour: SIDE_TINT.attended },
          { key: "points", label: "Points", n: Math.round(subjectRow?.points ?? 0), sub: "on the board", aria: `Points — ${Math.round(subjectRow?.points ?? 0)} on the board`, colour: "#7C3AED" },
        ];

  /** THE NUMBER GRID. For the caller it is counted off the very rows the History
   *  column prints, so a figure and the list behind it are THE SAME NUMBER
   *  (9950) and a press opens that list. For anybody else only the FIGURES
   *  exist, so the rows do not open — and ⚠ "Assisted for" / "Trained under" are
   *  LEFT OUT rather than drawn as 0, because `person_dance_stats` returns no
   *  artists count at all (`publicPerson.ts` hard-codes it) and a zero nobody
   *  measured is not a measurement. */
  const grid: Array<{ label: string; n: number; colour: string; rows: Array<[string, string]> | null }> = isMe
    ? small.map(([label, n, colour, rows]) => ({ label, n, colour, rows }))
    : isPerson
      ? [
          { label: "Styles", n: stats.styles, colour: "#22C55E", rows: null },
          { label: "Studios", n: stats.studios, colour: "#14B8A6", rows: null },
        ]
      : [];
  const sessionsNote = isPerson
    ? `${name.split(" ")[0]}'s own sessions are theirs to read — the record above is counted from them.`
    : `${name}'s sessions are read by its own people — the record above is counted from them.`;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* ⚠⚠ ONE TOP HALF, ON ALL THREE (27 Sep 2026, the user: *"make top half
          of stats page similar in all columns"*).

          It was three: the record wore a gold bleed with a 64px squircle, a
          name and a points line; History wore the same gold with NO figure at
          all and a sentence instead; Charts wore a violet-pink-amber card of
          its own with a decorative circle. Three tabs of one screen, and
          switching between them redrew the page above the switch — which is
          also why the tab bar sat at a different height on each.

          Now the gold hero is the page's, the eyebrow and the title are the
          tab's, and the identity row is drawn on all three. ⚠ The points line
          says what the TAB is about: your record's total on the first two, your
          place on THIS board on Charts — one line, three readings, so the same
          pixels never mean two things. */}
      <div style={{ margin: "0 0 4px", padding: "22px 16px 18px", background: `linear-gradient(180deg, ${accent}b0 0%, ${accent}55 45%, ${accent}18 74%, ${LILAC} 100%)` }}>
        <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{tab === "history" ? "Sessions" : tab === "charts" ? "DanceOS · India" : `${eyebrow} · Record`}</div>
        <div style={{ fontSize: 30, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1.2, lineHeight: 1.05, marginTop: 4 }}>{tab === "history" ? "History" : tab === "charts" ? "Rankings" : "Stats"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
          <span style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", border: "2.5px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(0,0,0,.45)", background: `linear-gradient(135deg,${accent},#7C3AED)`, color: "#fff", fontSize: 24, fontWeight: 900, letterSpacing: 0.5, fontFamily: DOS_DISPLAY }}>
            {initialsOf(name)}
          </span>
          {/* a DIV, not a span: the heading below is a block element and an
              `<h1>` inside an inline is invalid nesting */}
          <div style={{ minWidth: 0 }}>
            {/* ⚠⚠ THE PAGE'S OWN `<h1>`, AND IT HAD NONE (29 Sep 2026, found by
                the suite). `StatsScreen` drew the name as a `<span>` and the tab
                word as a `<div>`, so the screen had NO heading for a screen
                reader to move by — the SIXTH time this repo has found that exact
                shape (the desks 18 Sep, the studio Team desk 21 Sep, `EventForm`
                and `/rooms` 22 Sep, the Inbox 27 Sep, Discover 28 Sep). It
                survived because this was your own screen behind a tab, where the
                chrome draws the wordmark; `EntityStatsPage`, written for a
                visitor, had one from the start — so folding the rich screen back
                in would have LOST it. The name is the heading: this page is
                "{name}'s stats", and the word above it says which column. */}
            <h1 style={{ margin: 0, display: "block", fontSize: 26, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1.1, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</h1>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: SUB, marginTop: 3 }} data-testid="stats-points">
              {heroLine}
            </span>
          </div>
        </div>
        {/* ⚠ THE WAY BACK, ON EVERY TAB (29 Sep 2026). `EntityStatsPage` carried
            one and this screen never did, because it was only ever reached from
            your own Stats chip — it is reached from anybody's now, and a record
            three taps inside somebody else's profile needs the door home. */}
        <Link href={backHref} aria-label={`Back to ${name}`} style={{ display: "inline-block", marginTop: 12, fontSize: 11, fontWeight: 800, color: SUB, textDecoration: "none" }}>
          ‹ Back to the page
        </Link>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* three dresses, one page */}
        <div style={{ display: "flex", gap: 2, background: LINE, borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {(
            [
              /* ⚠ THE USER'S OWN THREE WORDS (29 Sep 2026): *"the graphs and
                 number grid, history and rankings in 3 columns for all
                 profiles"*. "Your record" and "Charts" were written when this
                 screen could only ever be your own and the boards were a place
                 you browsed; it is anybody's now, and the third column is what
                 the hero has always called it. */
              ["record", "Record"],
              ["history", "History"],
              ["charts", "Rankings"],
            ] as Array<[Tab, string]>
          ).map(([k, l]) => (
            <Link key={k} href={tabHref(k)} aria-pressed={tab === k} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: tab === k ? LILAC : "transparent", color: tab === k ? INK : SUB, boxShadow: tab === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
              {l}
            </Link>
          ))}
        </div>

        {tab === "record" ? (
          <>
            {/* THE NUMBERS (10024): the three that ARE the record wear their own colour
                as a bar across the top, with their hours on them */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0 10px" }}>
              <span style={shelf}>The numbers</span>
              {grid.length > 0 ? <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }}>{grid.length} open</span> : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${recordCards.length}, 1fr)`, gap: 8, marginBottom: 9 }}>
              {recordCards.map((c) => (
                <div key={c.key} aria-label={c.aria} style={{ position: "relative", overflow: "hidden", background: `${c.colour}12`, border: `1.5px solid ${c.colour}55`, borderRadius: 14, padding: "12px 11px 13px" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: c.colour }} />
                  <div style={{ ...figure, fontSize: 23, fontWeight: 900, lineHeight: 1, color: c.colour }} data-testid={`stat-${c.key}`}>
                    {c.n}
                  </div>
                  <div style={{ ...micro, color: SUB, marginTop: 5, letterSpacing: 0.5 }}>{c.label}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: c.colour, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* TWO COLUMNS (10050): a name and a number do not need a whole line.
                ⚠⚠ AND A PRESS OPENS A SHEET, NOT THE GRID ITSELF (27 Sep 2026,
                the user: *"the grid which show numbers for styles, assisted for,
                trained under studios etc should open lists like follow following
                instead of opening and closing inside the stats grid"*).
                It used to expand IN PLACE — the pressed cell took
                `gridColumn: "1 / -1"`, so opening one re-flowed the other three
                around it and the row you had just pressed jumped under your
                thumb; opening a second closed the first and the whole block
                changed height twice. The Followers and Following figures three
                screens away already answer a number with a sheet, and these are
                the same gesture: a figure, pressed, showing the list behind it.
                ⚠ The rows are IDENTICAL to what the drawer drew — the numbered
                two-line row — so nothing about the list changed but where it
                appears. */}
            {grid.length > 0 ? (
              <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 16, padding: "4px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14 }}>
                {grid.map((g) => {
                  const inner = (
                    <>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: g.colour, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                      <span style={{ ...figure, fontSize: 14 }}>{g.n}</span>
                      {/* ⚠ NO CHEVRON WHERE THERE IS NOTHING TO OPEN — a control
                          that cannot answer is not offered (the rule the tile
                          audit settled on 21 Sep: "a door that would be refused
                          is not offered"). */}
                      {g.rows ? <span style={{ color: MUTED, fontSize: 12, display: "inline-block" }}>›</span> : null}
                    </>
                  );
                  const box: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "11px 0" };
                  return (
                    <div key={g.label} style={{ borderBottom: `1.5px solid ${LINE}` }}>
                      {g.rows ? (
                        <div role="button" tabIndex={0} aria-label={`${g.label} — ${g.n}, open the list`} onKeyDown={pressKey(() => setOpen(g.label))} onClick={() => setOpen(g.label)} style={{ ...box, cursor: "pointer" }}>
                          {inner}
                        </div>
                      ) : (
                        <div aria-label={`${g.label} — ${g.n}`} style={box}>
                          {inner}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* THE LIST BEHIND THE NUMBER (27 Sep 2026) — the same sheet the
                Followers and Following figures open, so one gesture answers a
                figure everywhere in the app. `Sheet` carries `useCloseOnBack`,
                so system back closes it rather than leaving the page. */}
            {openRows ? (
              <Sheet label={openRows[0]} onClose={() => setOpen(null)} maxHeight="78vh">
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <b style={{ fontSize: 16, fontFamily: DOS_DISPLAY }}>{openRows[0]}</b>
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: MUTED }}>{openRows[3].length}</span>
                </div>
                {/* ⚠ A ZERO OPENS ON NOTHING AND HAS TO SAY SO (27 Sep 2026, kept
                    word for word from the drawer this replaced): now that a zero
                    IS drawn, a press that opened an empty box read as a broken
                    control rather than as an empty list. */}
                {openRows[3].length === 0 ? <div style={{ fontSize: 12, color: SUB, padding: "14px 2px" }}>Nothing here yet</div> : null}
                {openRows[3].map(([k, sub], i) => (
                  <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "9px 0", borderTop: `1.5px solid ${LINE}` }}>
                    <span style={{ ...figure, fontSize: 10, color: MUTED, width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{k}</span>
                      <span style={{ display: "block", fontSize: 10, color: MUTED, marginTop: 1 }}>{sub}</span>
                    </span>
                  </div>
                ))}
                <button type="button" onClick={() => setOpen(null)} style={{ width: "100%", marginTop: 12, textAlign: "center", padding: 12, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                  Done
                </button>
              </Sheet>
            ) : null}

            <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.5, marginTop: 10 }}>
              {isMe ? (
                <>
                  Counted off your own sessions — a class you taught or assisted once its session had ended, and a class you were <b style={{ color: SUB }}>checked in</b> to. A booking nobody marked is not a session danced, so it is not counted here.
                  {stats.firstSession ? ` Your record runs from ${monthWords(stats.firstSession)} to ${monthWords(stats.lastSession)}.` : " Nothing has happened yet — your first session will start it."}
                </>
              ) : isPerson ? (
                <>
                  Counted off sessions that have <b style={{ color: SUB }}>ended</b> — taught, assisted, or danced and checked in to. {sessionsNote}
                  {stats.firstSession ? ` This record runs from ${monthWords(stats.firstSession)} to ${monthWords(stats.lastSession)}.` : ""}
                </>
              ) : (
                <>Counted off sessions that have ended and registers that were run. {sessionsNote}</>
              )}
            </div>

            {/* WHAT YOU DANCE MOST (10077): the way a library shows the artists you play most */}
            {styleShelf.length > 0 ? (
              <div style={{ padding: "18px 0 2px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                  <span style={shelf}>What you dance most</span>
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }}>{styleShelf.length} styles</span>
                </div>
                <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", padding: "9px 0 6px" }}>
                  {styleShelf.map(([st, n], i) => (
                    <div key={st} aria-label={`${st} — ${n} sessions`} style={{ flexShrink: 0, textAlign: "center", minWidth: 0 }}>
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        <DosStyleTile label={st} color={dosStyleColor(st)} />
                        {i === 0 ? <span style={{ position: "absolute", right: -6, top: -7, fontSize: 8.5, fontWeight: 900, padding: "2px 6px", borderRadius: 999, background: "var(--text)", color: "var(--solid)" }}>TOP</span> : null}
                      </div>
                      <div style={{ fontSize: 9.5, color: MUTED, marginTop: 1 }}>{n} session{n === 1 ? "" : "s"}</div>
                      <div style={{ height: 3, borderRadius: 2, background: LINE, marginTop: 5, overflow: "hidden" }}>
                        <div style={{ height: 3, borderRadius: 2, width: `${Math.round((100 * n) / (styleShelf[0][1] || 1))}%`, background: dosStyleColor(st) }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* THE WHOLE RECORD (10194) — not labelled "CV": the whole page is the dancer's CV */}
            {history.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "22px 0 8px" }}>
                  <span style={shelf}>The whole record</span>
                </div>
                {/* WHICH SIDE OF THE FLOOR (10225): the chosen side takes its own colour */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {SIDES.map((k) => {
                    const on = cvSide === k;
                    const c = SIDE_TINT[k];
                    const n = bySide(k).length;
                    return (
                      <span key={k} role="button" tabIndex={0} aria-label={`${SIDE_PAST[k]} — ${n}`} aria-pressed={on} onKeyDown={pressKey(() => setCvSide(k))} onClick={() => setCvSide(k)} style={{ flex: 1, position: "relative", overflow: "hidden", textAlign: "left", padding: "10px 11px 9px", borderRadius: 14, cursor: "pointer", boxSizing: "border-box", background: on ? `${c}1a` : CARD, border: `1.5px solid ${on ? c : LINE}`, transition: "background .15s" }}>
                        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: on ? c : "transparent" }} />
                        <span style={{ display: "block", fontSize: 19, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", color: on ? c : INK }}>{n}</span>
                        <span style={{ display: "block", ...micro, color: on ? c : MUTED, marginTop: 4 }}>{SIDE_PAST[k]}</span>
                      </span>
                    );
                  })}
                </div>

                {/* WHAT IT LOOKS LIKE OVER TIME (10248): the three sides stacked against the calendar */}
                <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 16, padding: "12px 13px 10px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ ...micro, color: MUTED }}>SESSIONS · {grainLabel.toUpperCase()}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", gap: 2, background: LINE, borderRadius: 10, padding: 2 }}>
                      {(
                        [
                          ["day", "Day"],
                          ["week", "Week"],
                          ["month", "Month"],
                        ] as Array<[Grain, string]>
                      ).map(([k, l]) => (
                        <span key={k} role="button" tabIndex={0} aria-label={`By ${k}`} aria-pressed={grain === k} onKeyDown={pressKey(() => setGrain(k))} onClick={() => setGrain(k)} style={{ padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap", transition: "background .18s ease, color .18s ease", background: grain === k ? INK : "transparent", color: grain === k ? LILAC : SUB }}>
                          {l}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: grain === "day" ? 3 : 8, height: 104 }}>
                    {buckets.map((b, i) => {
                      const tot = b.conducted + b.assisted + b.attended;
                      return (
                        <span key={i} title={`${tot} session${tot === 1 ? "" : "s"}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch", height: "100%", gap: 1.5 }}>
                          <span style={{ display: "block", textAlign: "center", fontSize: grain === "day" ? 8 : 10, fontWeight: 900, lineHeight: 1, marginBottom: 3, fontVariantNumeric: "tabular-nums", color: tot ? INK : LINE }}>{tot || "·"}</span>
                          {SIDES.map((k) =>
                            b[k] ? <span key={k} style={{ display: "block", width: "100%", borderRadius: 3, transition: "height .22s cubic-bezier(.22,.9,.34,1)", height: `${Math.max(3, Math.round((74 * b[k]) / top))}px`, background: SIDE_TINT[k] }} /> : null
                          )}
                          {tot === 0 ? <span style={{ display: "block", width: "100%", height: 3, borderRadius: 2, background: LINE }} /> : null}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 9, flexWrap: "wrap" }}>
                    {SIDES.map((k) => (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, color: SUB }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: SIDE_TINT[k] }} />
                        {SIDE_PAST[k]}
                      </span>
                    ))}
                  </div>
                </div>

                {/* group by, and order by (10325) */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", scrollbarWidth: "none" }}>
                  {DIMS.map(([k, l]) => (
                    <span key={k} role="button" tabIndex={0} aria-label={`Group by ${l}`} aria-pressed={dim === k} onKeyDown={pressKey(() => setDim(k))} onClick={() => setDim(k)} style={{ padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0, background: dim === k ? INK : LINE, color: dim === k ? LILAC : SUB }}>
                      {l}
                    </span>
                  ))}
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, flexShrink: 0 }}>
                    {(
                      [
                        ["sessions", "sessions"],
                        ["hours", "hours"],
                        ["key", "name"],
                      ] as Array<[SortKey, string]>
                    ).map(([k, l]) => (
                      <span
                        key={k}
                        role="button"
                        tabIndex={0}
                        aria-label={`Sort by ${l}`}
                        aria-pressed={sortKey === k}
                        onKeyDown={pressKey(() => {
                          if (sortKey === k) setAsc(!asc);
                          else {
                            setSortKey(k);
                            setAsc(false);
                          }
                        })}
                        onClick={() => {
                          if (sortKey === k) setAsc(!asc);
                          else {
                            setSortKey(k);
                            setAsc(false);
                          }
                        }}
                        style={{ padding: "6px 10px", borderRadius: 999, cursor: "pointer", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", background: sortKey === k ? LINE : "transparent", color: sortKey === k ? INK : MUTED }}
                      >
                        {l}
                        {sortKey === k ? (asc ? " ↑" : " ↓") : ""}
                      </span>
                    ))}
                  </span>
                </div>
                <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 16, padding: "6px 14px 10px" }}>
                  {groups.length === 0 ? <div style={{ fontSize: 11.5, color: MUTED, padding: "10px 0" }}>Nothing on this side of the floor yet.</div> : null}
                  {groups.map((r, i) => {
                    const c = dim === "style" ? dosStyleColor(r.key) : "#5AC8FA";
                    const v = r[sortKey === "key" ? "sessions" : sortKey];
                    return (
                      <div key={r.key} style={{ padding: "9px 0", borderBottom: i === groups.length - 1 ? "none" : `1.5px solid ${LINE}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 16, fontSize: 10, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i + 1}</span>
                          {dim === "style" ? <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: c, flexShrink: 0 }} /> : null}
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {r.sessions} <span style={{ fontSize: 9.5, fontWeight: 800, color: MUTED }}>{r.sessions === 1 ? "session" : "sessions"}</span>
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: SUB, fontVariantNumeric: "tabular-nums", flexShrink: 0, width: 38, textAlign: "right" }}>{r.hours}h</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: LINE, marginTop: 6, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round((100 * v) / mx)}%`, background: c, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {/* ⚠ THE COLUMN IS ALWAYS THERE AND SAYS WHY IT IS EMPTY (29 Sep 2026).
            `my_session_history` is scoped to `auth.uid()` inside the database,
            so a library of somebody else's sessions is a READ THAT DOES NOT
            EXIST — not a permission this screen is withholding. Drawing the
            tab and then drawing nothing would read as "they have danced
            nothing", which is the opposite of true. */}
        {tab === "history" && !isMe ? (
          <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 18, padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: DOS_DISPLAY }}>{isPerson ? "This library is theirs" : "This library is its own"}</div>
            <div style={{ fontSize: 11.5, color: SUB, marginTop: 6, lineHeight: 1.5 }}>{sessionsNote} Record and Rankings are counted from the same sessions.</div>
          </div>
        ) : null}

        {tab === "history" && isMe ? (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 9, overflowX: "auto", scrollbarWidth: "none" }}>
              {(
                [
                  ["all", "Everything"],
                  ["conducted", "Taught"],
                  ["assisted", "Assisted"],
                  ["attended", "Danced"],
                ] as Array<[Side | "all", string]>
              ).map(([k, l]) => {
                const on = side === k;
                return (
                  <span key={k} role="button" tabIndex={0} aria-pressed={on} aria-label={l} onKeyDown={pressKey(() => setSide(k))} onClick={() => setSide(k)} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: on ? INK : CARD, color: on ? LILAC : SUB, border: `1.5px solid ${on ? INK : LINE}` }}>
                    {l}
                  </span>
                );
              })}
            </div>
            {historyStyles.length > 1 ? (
              <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
                {historyStyles.map((s) => {
                  const on = styleSel === s;
                  return (
                    <span key={s} role="button" tabIndex={0} aria-pressed={on} aria-label={s} onKeyDown={pressKey(() => setStyleSel(on ? null : s))} onClick={() => setStyleSel(on ? null : s)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, background: on ? INK : LINE, color: on ? LILAC : SUB }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: dosStyleColor(s) }} />
                      {s}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {/* UPCOMING (9848): what is still to come, under its day */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "6px 0 6px" }}>UPCOMING · {upcomingShown.length}</div>
            {upcomingShown.length === 0 ? (
              <div style={{ textAlign: "center", padding: "18px 12px", color: SUB, fontSize: 12, border: `1.5px dashed ${LINE}`, borderRadius: 14, marginBottom: 12 }}>Nothing upcoming.</div>
            ) : (
              withDays(upcomingShown, (e) => e.startsAt).map((g) => (
                <div key={g.day}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, margin: "8px 0 6px" }}>{g.day}</div>
                  {g.rows.map((e) => {
                    const c = dosStyleColor(e.style);
                    const word = e.side === "hosting" ? "Teach" : e.side === "assisting" ? "Assist" : "Train";
                    const tint = e.side === "hosting" ? SIDE_TINT.conducted : e.side === "assisting" ? SIDE_TINT.assisted : SIDE_TINT.attended;
                    return (
                      <Link key={`${e.sessionId}-${e.side}`} href={`/c/${e.shareSlug}`} aria-label={`Open ${e.title}`} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" }}>
                        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                          <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 2 }}>{[e.style, e.businessName, e.room, e.businessCity].filter(Boolean).join(" · ")}</span>
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2, fontFamily: DOS_MONO }}>{timeWords(e.startsAt)}</span>
                        </span>
                        <span style={{ ...micro, color: tint, flexShrink: 0 }}>{word}</span>
                      </Link>
                    );
                  })}
                </div>
              ))
            )}

            {/* COMPLETED (9853): the record, under its days */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 6px" }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED }}>COMPLETED · {shown.length}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }} data-testid="history-count">
                {shown.length} of {history.length}
              </span>
            </div>
            {shown.length === 0 ? (
              <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 18, padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: DOS_DISPLAY }}>{history.length === 0 ? "Nothing on the record yet" : "Nothing matches that"}</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>{history.length === 0 ? "A session appears here once it has ended and you were on the floor for it." : "Try another side or style."}</div>
              </div>
            ) : (
              withDays(shown, (r) => r.startsAt).map((g) => (
                <div key={g.day}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, margin: "8px 0 6px" }}>{g.day}</div>
                  {g.rows.map((r) => {
                    const c = dosStyleColor(r.style);
                    const body = (
                      <>
                        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                          <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 2 }}>{[r.style, r.businessName, r.room, r.city].filter(Boolean).join(" · ")}</span>
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2, fontFamily: DOS_MONO }}>
                            {timeWords(r.startsAt)} · {r.minutes} min
                          </span>
                        </span>
                        <span style={{ ...micro, color: SIDE_TINT[r.side], flexShrink: 0 }}>{SIDE_VERB[r.side]}</span>
                      </>
                    );
                    const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" };
                    return r.shareSlug ? (
                      <Link key={`${r.sessionId}-${r.side}`} href={`/c/${r.shareSlug}`} aria-label={`Open ${r.title}`} style={style}>
                        {body}
                      </Link>
                    ) : (
                      <div key={`${r.sessionId}-${r.side}`} style={style}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </>
        ) : null}

        {tab === "charts" ? (
          <>
            {/* ⚠ WHERE THIS PROFILE STANDS COMES FIRST, THEN THE BOARD IT STANDS
                ON (29 Sep 2026, the user: *"charts when looking at someone
                else's profile also should have a view with that person's
                rankings"*). Browsing the four boards is the rest of the column;
                this is the answer to "how is THIS one doing", which is the
                question somebody opening a profile's stats actually has. */}
            {standings.length > 0 ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...micro, color: MUTED, marginBottom: 8 }}>Where {name} stands</div>
                {standings.map((s) => (
                  <StandingCard key={s.scope} s={s} accent={accent} />
                ))}
              </div>
            ) : null}

            {!canBrowseBoards ? (
              <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 18, padding: "28px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: DOS_DISPLAY }}>Sign in to browse the boards</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 6, lineHeight: 1.5 }}>Where {name} stands is above, and it is public. The four boards are for people with an account.</div>
              </div>
            ) : null}
            {canBrowseBoards ? (
              <>
            <div style={{ ...micro, color: MUTED, marginBottom: 8 }}>Browse the boards</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {CHART_SEGMENTS.map((s) => {
                const on = segment === s.k;
                return (
                  <Link key={s.k} href={chartHref({ seg: s.k })} aria-pressed={on} style={{ flex: 1, textAlign: "center", padding: "9px 2px", borderRadius: 12, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? INK : CARD, color: on ? LILAC : SUB, border: `1.5px solid ${on ? INK : LINE}` }}>
                    {s.label}
                  </Link>
                );
              })}
            </div>
            {/* ⚠ THE METRIC IS A ROW OF CHIPS, NOT A NATIVE SELECT (27 Sep 2026,
                the user: *"all list drop downs should be within the app only not
                open a seprate screen"*). On a phone a `<select>` is answered by
                a full-screen OS picker; there are five metrics and they fit on
                one scrolling line, so the list IS the control and nothing
                leaves the app. The city keeps `CitySelect`, which is a sheet
                now for the same reason. The address is still the state, and a
                change REPLACES it in place. */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 8 }}>
              {CHART_METRICS.map((m) => {
                const on = metric === m.k;
                return (
                  <Link key={m.k} href={chartHref({ metric: m.k })} replace scroll={false} aria-pressed={on} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", textDecoration: "none", background: on ? INK : CARD, color: on ? LILAC : SUB, border: `1.5px solid ${on ? INK : LINE}` }}>
                    {m.label}
                  </Link>
                );
              })}
            </div>
            <div style={{ marginBottom: 8 }}>
              {/* ⚠ `navigates` — picking replaces the address, so the sheet must
                  not spend its history entry (useCloseOnBack rule 2) */}
              <CitySelect value={city} cities={cities} ariaLabel="City" allowNone noneLabel="Everywhere" placeholder="Everywhere" navigates onChange={(c) => router.replace(chartHref({ city: c }), { scroll: false })} />
            </div>
            {chartStyles.length > 0 ? (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 6, marginBottom: 8 }}>
                {chartStyles.map((st) => {
                  const on = styleFilter === st;
                  return (
                    <Link key={st} href={chartHref({ style: on ? null : st })} aria-pressed={on} aria-label={`Only ${st}`} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", background: on ? INK : LINE, color: on ? LILAC : SUB }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: dosStyleColor(st) }} />
                      {st}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {/* ⚠⚠ THE RANKINGS SECTION, RE-CUT (27 Sep 2026, the user: *"fix the
                rankings section properly. make it better"*, and *"remove global
                from name as only for india"*).

                THREE THINGS WENT, and each was in the way of the board itself:
                · **the word "Global"**, which was never true — every city on
                  this board is an Indian city and the registry is the eight the
                  user fixed on 19 Sep. The hero says "DanceOS · India" now.
                · **the "How points work" CARD**, which stood between the
                  controls and the board on every load, at the full width of the
                  screen, saying the same four rules for ever. It is a Rules
                  DISCLOSURE beside the count now — pressed when somebody
                  actually asks "why am I here", closed the rest of the time.
                · **the paragraph under those rules**, which was three sentences
                  about what is NOT counted. What a board owes its reader is the
                  denominator, and that is printed on every place.
                · **the pinned "you" row**, which repeated the place the hero now
                  prints for this exact board — and printed it in a third set of
                  colours. Your own row is HIGHLIGHTED in the board instead, so
                  where you stand is shown among the people you stand among. */}

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={shelf}>{CHART_SEGMENTS.find((s) => s.k === segment)?.label}</span>
              {/* the rules, beside the count, open only when asked */}
              <button type="button" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen} style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, letterSpacing: 0.3, color: MUTED, background: "none", border: "none", padding: "2px 4px", cursor: "pointer", fontFamily: "inherit" }}>
                {rulesOpen ? "Hide points" : "Points"}
              </button>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED }} data-testid="chart-population">
                {chart.length ? `${chart.length} of ${chart[0].population}` : "0"}
              </span>
            </div>
            {rulesOpen ? (
              <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "4px 12px", marginBottom: 8 }}>
                {(isCrew ? CREW_POINT_RULES : POINT_RULES).map(([k, v, c]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1.5px solid ${LINE}` }}>
                    <span style={{ fontSize: 12, color: SUB }}>{k}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, padding: "3px 10px", borderRadius: 999, background: `${c}1a`, color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {board.length === 0 ? (
              <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 18, padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: DOS_DISPLAY }}>No board here yet</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>Nobody in {city ?? "any city"} has finished a session on this board — a board of nobody is not a ranking.</div>
              </div>
            ) : (
              board.map((r) => {
                const href = r.kind === "crew" ? `/crew/${r.id}` : r.kind === "studio" ? `/studio/${r.id}` : `/person/${r.id}`;
                const line =
                  r.kind === "crew"
                    ? `${r.conducted} event${r.conducted === 1 ? "" : "s"} entered · ${r.extra} member${r.extra === 1 ? "" : "s"}`
                    : isStudio
                      ? `${r.conducted} session${r.conducted === 1 ? "" : "s"} held · ${hoursWords(r.hours)} · ${r.extra} on the floor`
                      : segment === "artist"
                        ? `${r.conducted} taught · ${r.assisted} assisted · ${hoursWords(r.hours)}`
                        : `${r.attended} danced · ${hoursWords(r.hours)}`;
                const top3 = r.place <= 3;
                /* ⚠ YOUR OWN ROW, IN THE BOARD (27 Sep 2026) — where the pinned
                   card used to be. A ranking is a list of the people you are
                   ranked among, and lifting one of them out of it to say the
                   same place a third time is the duplication the rest of this
                   session has been taking out. */
                const isYou = peopleBoard && boardPlace != null && r.place === boardPlace.place;
                return (
                  <Link key={`${r.kind}-${r.id}`} href={href} aria-label={`${isYou ? "You — " : ""}${r.name} — place ${r.place} of ${r.population}`} style={{ display: "flex", alignItems: "center", gap: 10, background: isYou ? "linear-gradient(120deg,#7C3AED22,#EC489922)" : CARD, border: `1.5px solid ${isYou ? "#7C3AED77" : LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" }}>
                    {/* top-3 numerals in the charts' own gradient (9693-9694) */}
                    <span style={{ ...figure, fontSize: top3 ? 24 : 17, fontFamily: DOS_DISPLAY, fontWeight: 900, width: 30, textAlign: "center", flexShrink: 0, background: top3 ? "linear-gradient(120deg,#7C3AED,#EC4899)" : "none", WebkitBackgroundClip: top3 ? "text" : undefined, backgroundClip: top3 ? "text" : undefined, color: top3 ? "transparent" : MUTED }}>{r.place}</span>
                    <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${dosStyleColor(r.style ?? "Hip-Hop")},#7C3AED)`, color: "#fff", fontSize: 13, fontWeight: 900, fontFamily: DOS_DISPLAY }}>
                      {initialsOf(r.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                        {isYou ? <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, padding: "2px 6px", borderRadius: 999, background: "#7C3AED", color: "#fff", verticalAlign: "middle" }}>YOU</span> : null}
                      </span>
                      <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 1 }}>{[r.city, r.style].filter(Boolean).join(" · ")}</span>
                      <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2 }}>{line}</span>
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ display: "block", ...figure, fontSize: 13 }}>{valueOf(r)}</span>
                      <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: MUTED }}>{unit}</span>
                    </span>
                  </Link>
                );
              })
            )}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
