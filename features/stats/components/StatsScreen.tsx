"use client";

import Link from "next/link";
import { useState } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { CalendarEntry } from "@/types/calendar";
import { CHART_METRICS, CHART_SEGMENTS, CREW_POINT_RULES, POINT_RULES, SIDE_TINT, SIDE_VERB, hoursWords, type ChartMetric, type ChartRow, type ChartSegment, type DanceStats, type HistoryRow, type Side } from "@/types/stats";

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

export function StatsScreen({
  name,
  role,
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
}: {
  name: string;
  role: "dancer" | "trainer" | "studio";
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
}) {
  const [open, setOpen] = useState<string | null>(null);
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
  const studioRows = tally(history, (r) => r.tenantName);
  /* two kinds of artist, and they are not the same person (9958) */
  const assistedFor = tally(bySide("assisted"), (r) => r.artistName);
  const trainedUnder = tally(bySide("attended"), (r) => r.artistName);

  const shown = history.filter((r) => (side === "all" || r.side === side) && (!styleSel || r.style === styleSel));
  const historyStyles = [...new Set(history.map((r) => r.style))];
  const isCrew = segment === "crew";
  const isStudio = segment === "studio";
  const peopleBoard = segment === "dancer" || segment === "artist";

  const chartHref = (over: { seg?: ChartSegment; city?: string | null; metric?: ChartMetric; style?: string | null }) => {
    const seg = over.seg ?? segment;
    const c = over.city === undefined ? city : over.city;
    const m = over.metric ?? metric;
    const st = over.style === undefined ? styleFilter : over.style;
    const q = [`tab=charts`, `seg=${seg}`, c ? `city=${encodeURIComponent(c)}` : null, m !== "overall" ? `metric=${m}` : null, st ? `style=${encodeURIComponent(st)}` : null].filter(Boolean).join("&");
    return `/stats?${q}`;
  };
  const tabHref = (t: Tab) => (t === "charts" ? chartHref({}) : `/stats?tab=${t}`);

  /* [label, figure, colour, the rows it opens] — the small cards; a zero is not drawn (10017) */
  const small: Array<[string, number, string, Array<[string, string]>]> = (
    [
      ["Styles", styleRows.length, "#22C55E", styleRows],
      ["Assisted for", assistedFor.length, "#0D9488", assistedFor],
      ["Trained under", trainedUnder.length, "#EAB308", trainedUnder],
      ["Studios", studioRows.length, "#14B8A6", studioRows],
    ] as Array<[string, number, string, Array<[string, string]>]>
  ).filter((c) => c[1] > 0);

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
  const keyOf = (r: HistoryRow) => (dim === "style" ? r.style : dim === "artist" ? (r.artistName ?? "—") : (r.tenantName ?? r.room ?? "—"));
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
    ["artist", role === "trainer" ? "Artist" : "Taught by"],
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

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {tab === "charts" ? (
        /* Charts has its own hero (9642-9647): violet into pink into amber */
        <div style={{ margin: "12px 16px 0", borderRadius: 22, padding: "22px 18px 18px", background: "linear-gradient(135deg,#7C3AED,#EC4899 55%,#F59E0B)", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", right: -24, top: -24, width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,.14)" }} />
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, opacity: 0.85 }}>DANCEOS · CHARTS</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 2, fontFamily: DOS_DISPLAY }}>Global Rankings</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }} data-testid="stats-points">
            Top {CHART_SEGMENTS.find((s) => s.k === segment)?.label.toLowerCase()} · counted live
          </div>
        </div>
      ) : (
        /* the room, lit in its own metal — the colour bleeds off the top (9866) */
        <div style={{ margin: "0 0 4px", padding: "22px 16px 18px", background: `linear-gradient(180deg, ${GOLD}b0 0%, ${GOLD}55 45%, ${GOLD}18 74%, ${LILAC} 100%)` }}>
          <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{tab === "history" ? "Your sessions" : "Your record"}</div>
          <div style={{ fontSize: 30, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1.2, lineHeight: 1.05, marginTop: 4 }}>{tab === "history" ? "History" : "Stats"}</div>
          {tab === "history" ? (
            <div style={{ fontSize: 11.5, color: SUB, margin: "2px 0 0" }}>Upcoming · completed — every filter, one page.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
              <span style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", border: "2.5px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(0,0,0,.45)", background: `linear-gradient(135deg,#F9E27D,#B8860B)`, color: "#fff", fontSize: 24, fontWeight: 900, letterSpacing: 0.5, fontFamily: DOS_DISPLAY }}>
                {initialsOf(name)}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 26, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1.1, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: SUB, marginTop: 3 }} data-testid="stats-points">
                  {stats.points} points{myPlace ? ` · #${myPlace.place} of ${myPlace.population} dancers` : ""}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: `${tab === "charts" ? 14 : 0}px 16px 0` }}>
        {/* three dresses, one page */}
        <div style={{ display: "flex", gap: 2, background: LINE, borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {(
            [
              ["record", "Your record"],
              ["history", "History"],
              ["charts", "Charts"],
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
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }}>{small.length} open</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 9 }}>
              {(
                [
                  ["conducted", stats.sessionsConducted, stats.hoursConducted],
                  ["assisted", stats.sessionsAssisted, stats.hoursAssisted],
                  ["attended", stats.sessionsAttended, stats.hoursAttended],
                ] as Array<[Side, number, number]>
              ).map(([k, n, h]) => {
                const c = SIDE_TINT[k];
                return (
                  <div key={k} aria-label={`${SIDE_CARD[k]} — ${n} sessions, ${hoursWords(h)}`} style={{ position: "relative", overflow: "hidden", background: `${c}12`, border: `1px solid ${c}55`, borderRadius: 14, padding: "12px 11px 13px" }}>
                    <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: c }} />
                    <div style={{ ...figure, fontSize: 23, fontWeight: 900, lineHeight: 1, color: c }} data-testid={`stat-${k}`}>
                      {n}
                    </div>
                    <div style={{ ...micro, color: SUB, marginTop: 5, letterSpacing: 0.5 }}>{SIDE_CARD[k]}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: c, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{hoursWords(h)}</div>
                  </div>
                );
              })}
            </div>

            {/* TWO COLUMNS (10050): a name and a number do not need a whole line */}
            {small.length > 0 ? (
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "4px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14 }}>
                {small.map(([l, v, c, rowsFor]) => {
                  const isOpen = open === l;
                  return (
                    <div key={l} style={{ gridColumn: isOpen ? "1 / -1" : "auto", borderBottom: `1px solid ${LINE}` }}>
                      <div role="button" tabIndex={0} aria-label={`${l} — ${v}, open the list`} aria-expanded={isOpen} onKeyDown={pressKey(() => setOpen(isOpen ? null : l))} onClick={() => setOpen(isOpen ? null : l)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 0", cursor: "pointer" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: c, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                        <span style={{ ...figure, fontSize: 14 }}>{v}</span>
                        <span style={{ color: MUTED, fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .16s", display: "inline-block" }}>›</span>
                      </div>
                      {isOpen ? (
                        <div style={{ padding: "0 0 10px" }}>
                          {rowsFor.map(([k, sub], i) => (
                            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderTop: `1px solid ${LINE}` }}>
                              <span style={{ ...figure, fontSize: 10, color: MUTED, width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{k}</span>
                                <span style={{ display: "block", fontSize: 10, color: MUTED, marginTop: 1 }}>{sub}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.5, marginTop: 10 }}>
              Counted off your own sessions — a class you taught or assisted once its session had ended, and a class you were <b style={{ color: SUB }}>checked in</b> to. A booking nobody marked is not a session danced, so it is not counted here.
              {stats.firstSession ? ` Your record runs from ${monthWords(stats.firstSession)} to ${monthWords(stats.lastSession)}.` : " Nothing has happened yet — your first session will start it."}
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
                      <span key={k} role="button" tabIndex={0} aria-label={`${SIDE_PAST[k]} — ${n}`} aria-pressed={on} onKeyDown={pressKey(() => setCvSide(k))} onClick={() => setCvSide(k)} style={{ flex: 1, position: "relative", overflow: "hidden", textAlign: "left", padding: "10px 11px 9px", borderRadius: 14, cursor: "pointer", boxSizing: "border-box", background: on ? `${c}1a` : CARD, border: `1px solid ${on ? c : LINE}`, transition: "background .15s" }}>
                        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: on ? c : "transparent" }} />
                        <span style={{ display: "block", fontSize: 19, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", color: on ? c : INK }}>{n}</span>
                        <span style={{ display: "block", ...micro, color: on ? c : MUTED, marginTop: 4 }}>{SIDE_PAST[k]}</span>
                      </span>
                    );
                  })}
                </div>

                {/* WHAT IT LOOKS LIKE OVER TIME (10248): the three sides stacked against the calendar */}
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "12px 13px 10px", marginBottom: 12 }}>
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
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "6px 14px 10px" }}>
                  {groups.length === 0 ? <div style={{ fontSize: 11.5, color: MUTED, padding: "10px 0" }}>Nothing on this side of the floor yet.</div> : null}
                  {groups.map((r, i) => {
                    const c = dim === "style" ? dosStyleColor(r.key) : "#5AC8FA";
                    const v = r[sortKey === "key" ? "sessions" : sortKey];
                    return (
                      <div key={r.key} style={{ padding: "9px 0", borderBottom: i === groups.length - 1 ? "none" : `1px solid ${LINE}` }}>
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

        {tab === "history" ? (
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
                  <span key={k} role="button" tabIndex={0} aria-pressed={on} aria-label={l} onKeyDown={pressKey(() => setSide(k))} onClick={() => setSide(k)} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: on ? INK : CARD, color: on ? LILAC : SUB, border: `1px solid ${on ? INK : LINE}` }}>
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
                      <Link key={`${e.sessionId}-${e.side}`} href={`/c/${e.shareSlug}`} aria-label={`Open ${e.title}`} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" }}>
                        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                          <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 2 }}>{[e.style, e.tenantName, e.room, e.tenantCity].filter(Boolean).join(" · ")}</span>
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
                          <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 2 }}>{[r.style, r.tenantName, r.room, r.city].filter(Boolean).join(" · ")}</span>
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2, fontFamily: DOS_MONO }}>
                            {timeWords(r.startsAt)} · {r.minutes} min
                          </span>
                        </span>
                        <span style={{ ...micro, color: SIDE_TINT[r.side], flexShrink: 0 }}>{SIDE_VERB[r.side]}</span>
                      </>
                    );
                    const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" };
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
            {/* the metric and the city (9654): two selects side by side — as links, because the address is the state */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select aria-label="Metric" value={metric} onChange={(e) => (window.location.href = chartHref({ metric: e.target.value as ChartMetric }))} style={{ flex: 1, minWidth: 0, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 10px", color: INK, fontSize: 11.5, fontWeight: 700, outline: "none", appearance: "none", fontFamily: "inherit" }}>
                {CHART_METRICS.map((m) => (
                  <option key={m.k} value={m.k}>
                    🏅 {m.label}
                  </option>
                ))}
              </select>
              <select aria-label="City" value={city ?? ""} onChange={(e) => (window.location.href = chartHref({ city: e.target.value || null }))} style={{ flex: 1, minWidth: 0, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 10px", color: INK, fontSize: 11.5, fontWeight: 700, outline: "none", appearance: "none", fontFamily: "inherit" }}>
                <option value="">📍 Everywhere</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    📍 {c}
                  </option>
                ))}
              </select>
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

            {/* HOW POINTS WORK (9660) — and what it does not count, said here */}
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ ...micro, letterSpacing: 1, color: MUTED }}>How points work</div>
              <div style={{ marginTop: 8 }}>
                {(isCrew ? CREW_POINT_RULES : POINT_RULES).map(([k, v, c]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                    <span style={{ fontSize: 12, color: SUB }}>{k}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, padding: "3px 10px", borderRadius: 999, background: `${c}1a`, color: c }}>{v}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                  Counted live off real rows, not refreshed on a schedule. {isCrew ? "A crew ranks by the events it has entered and the size of its confirmed roster — a battle WIN would be worth more than either, and nothing records a score yet." : "A battle win would be +10; no table holds a score yet, so wins are not counted here."} A place is always printed with the number it is out of.
                </div>
              </div>
            </div>

            {/* the pinned "you" row (9674-9683): one person on record — where YOU stand on this board */}
            {peopleBoard && boardPlace ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", marginBottom: 6, borderRadius: 14, background: "linear-gradient(120deg,#7C3AED22,#EC489922)", border: `1px solid ${LINE}` }} aria-label={`You — place ${boardPlace.place} of ${boardPlace.population}`}>
                <span style={{ width: 30, fontSize: 20, fontWeight: 900, textAlign: "center", fontFamily: DOS_DISPLAY, background: "linear-gradient(120deg,#7C3AED,#EC4899)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>#{boardPlace.place}</span>
                <span style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: "linear-gradient(135deg,#7C3AED,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15 }}>{initialsOf(name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900 }}>You</div>
                  <div style={{ fontSize: 10.5, color: SUB }}>
                    your {segment} ranking · {city ?? "everywhere"} · of {boardPlace.population}
                  </div>
                </div>
                <span style={{ ...figure, fontSize: 13, flexShrink: 0 }}>{boardPlace.points}</span>
              </div>
            ) : null}

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={shelf}>{CHART_SEGMENTS.find((s) => s.k === segment)?.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }} data-testid="chart-population">
                {chart.length ? `${chart.length} of ${chart[0].population}` : "0"}
              </span>
            </div>
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
                return (
                  <Link key={`${r.kind}-${r.id}`} href={href} aria-label={`${r.name} — place ${r.place} of ${r.population}`} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" }}>
                    {/* top-3 numerals in the charts' own gradient (9693-9694) */}
                    <span style={{ ...figure, fontSize: top3 ? 24 : 17, fontFamily: DOS_DISPLAY, fontWeight: 900, width: 30, textAlign: "center", flexShrink: 0, background: top3 ? "linear-gradient(120deg,#7C3AED,#EC4899)" : "none", WebkitBackgroundClip: top3 ? "text" : undefined, backgroundClip: top3 ? "text" : undefined, color: top3 ? "transparent" : MUTED }}>{r.place}</span>
                    <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${dosStyleColor(r.style ?? "Hip-Hop")},#7C3AED)`, color: "#fff", fontSize: 13, fontWeight: 900, fontFamily: DOS_DISPLAY }}>
                      {initialsOf(r.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
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
      </div>
    </div>
  );
}
