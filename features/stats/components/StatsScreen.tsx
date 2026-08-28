"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { CHART_SEGMENTS, CREW_POINT_RULES, POINT_RULES, SIDE_TINT, SIDE_VERB, hoursWords, type ChartRow, type ChartSegment, type DanceStats, type HistoryRow, type Side } from "@/types/stats";

/** Stats — the prototype's three dresses of one screen, on one page with a
 *  segment switch: YOUR RECORD (historyOnly 9862), HISTORY (classesOnly 9708)
 *  and CHARTS (chartsOnly 9610).
 *
 *  "A LIBRARY, NOT A DASHBOARD" (9866): the colour bleeds off the top and dies
 *  into the page, the title is the room's name, and the numbers open into the
 *  lists behind them — because "a number and the list behind it are THE SAME
 *  NUMBER" (9950). Every figure here is counted by one database function off the
 *  rows the History list prints, so they cannot disagree.
 *
 *  Said on the screen, not hidden in a comment: a battle win is +10 in the
 *  prototype's points card and nothing holds a score yet, so wins are not in the
 *  formula; points are computed live rather than "daily at midnight"; and a rank
 *  is printed with the population it is out of, because "#4" on a pilot is a
 *  number pretending to be a league. */

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
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const timeWords = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toLowerCase();
const monthWords = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`)) : "—");

type Tab = "record" | "history" | "charts";

export function StatsScreen({
  name,
  stats,
  history,
  chart,
  segment,
  city,
  cities,
  myPlace,
  tab,
}: {
  name: string;
  stats: DanceStats;
  history: HistoryRow[];
  chart: ChartRow[];
  segment: ChartSegment;
  city: string | null;
  cities: readonly string[];
  myPlace: { place: number; population: number; points: number } | null;
  tab: Tab;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [side, setSide] = useState<Side | "all">("all");
  const [styleSel, setStyleSel] = useState<string | null>(null);

  /* the tallies the record opens into, counted off the SAME rows the list prints */
  const tally = (pick: (r: HistoryRow) => string | null) => {
    const m = new Map<string, { n: number; last: string }>();
    history.forEach((r) => {
      const k = pick(r);
      if (!k) return;
      const cur = m.get(k);
      if (cur) cur.n += 1;
      else m.set(k, { n: 1, last: dayWords(r.startsAt) });
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, `${v.n} session${v.n === 1 ? "" : "s"} · last ${v.last}`] as [string, string]);
  };
  const styleRows = useMemo(() => tally((r) => r.style), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  const studioRows = useMemo(() => tally((r) => r.tenantName), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  const artistRows = useMemo(() => tally((r) => (r.side === "attended" ? r.artistName : null)), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomRows = useMemo(() => tally((r) => r.room), [history]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = history.filter((r) => (side === "all" || r.side === side) && (!styleSel || r.style === styleSel));
  const historyStyles = [...new Set(history.map((r) => r.style))];
  const totalSessions = stats.sessionsConducted + stats.sessionsAssisted + stats.sessionsAttended;
  const totalHours = Math.round((stats.hoursConducted + stats.hoursAssisted + stats.hoursAttended) * 10) / 10;
  const isCrew = segment === "crew";
  const isStudio = segment === "studio";

  const tabHref = (t: Tab) => `/stats?tab=${t}${t === "charts" ? `&seg=${segment}${city ? `&city=${encodeURIComponent(city)}` : ""}` : ""}`;

  /* [label, figure, tint, the rows it opens — or null if it opens nothing] (9978) */
  const cards: Array<[string, string, string, Array<[string, string]> | null]> = [
    ["Sessions", String(totalSessions), "#EC4899", null],
    ["On the floor", hoursWords(totalHours), "#7C3AED", null],
    ["Styles", String(styleRows.length), "#5AC8FA", styleRows],
    ["Studios", String(studioRows.length), "#3B82F6", studioRows],
    ["Artists you learn from", String(artistRows.length), GOLD, artistRows],
    ["Rooms", String(roomRows.length), "#0D9488", roomRows],
  ];

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* the room, lit in its own metal — the colour bleeds off the top (9866) */}
      <div style={{ margin: "0 0 4px", padding: "22px 16px 18px", background: `linear-gradient(180deg, ${GOLD}b0 0%, ${GOLD}55 45%, ${GOLD}18 74%, ${LILAC} 100%)` }}>
        <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>Your record</div>
        <div style={{ fontSize: 30, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1.2, lineHeight: 1.05, marginTop: 4 }}>Stats</div>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
          <span style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", border: "2.5px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(0,0,0,.45)", background: `linear-gradient(135deg,#F9E27D,#B8860B)`, color: "#fff", fontSize: 24, fontWeight: 900, letterSpacing: 0.5, fontFamily: DOS_DISPLAY }}>
            {name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D"}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 26, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1.1, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: SUB, marginTop: 3 }} data-testid="stats-points">
              {stats.points} points{myPlace ? ` · #${myPlace.place} of ${myPlace.population} dancers${city ? ` in ${city}` : ""}` : ""}
            </span>
          </span>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
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
            {/* the three sides, at the size of figures */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 9 }}>
              {(
                [
                  ["conducted", stats.sessionsConducted, stats.hoursConducted],
                  ["assisted", stats.sessionsAssisted, stats.hoursAssisted],
                  ["attended", stats.sessionsAttended, stats.hoursAttended],
                ] as Array<[Side, number, number]>
              ).map(([k, n, h]) => (
                <div key={k} aria-label={`${SIDE_VERB[k]} — ${n} sessions, ${hoursWords(h)}`} style={{ background: CARD, border: `1px solid ${LINE}`, borderTop: `3px solid ${SIDE_TINT[k]}`, borderRadius: 14, padding: "11px 10px" }}>
                  <div style={{ ...figure, fontSize: 20 }} data-testid={`stat-${k}`}>
                    {n}
                  </div>
                  <div style={{ ...micro, color: SUB, marginTop: 3 }}>{SIDE_VERB[k]}</div>
                  <div style={{ ...figure, fontSize: 10, color: SIDE_TINT[k], marginTop: 3 }}>{hoursWords(h)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 8px" }}>
              <span style={shelf}>The numbers</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }}>{cards.filter((c) => c[3] && c[3]!.length).length} open</span>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "4px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14 }}>
              {cards.map(([l, v, c, rowsFor]) => {
                const openable = Boolean(rowsFor && rowsFor.length);
                const isOpen = open === l;
                return (
                  <div key={l} style={{ gridColumn: isOpen ? "1 / -1" : "auto", borderBottom: `1px solid ${LINE}` }}>
                    <div
                      role={openable ? "button" : undefined}
                      tabIndex={openable ? 0 : undefined}
                      aria-label={openable ? `${l} — ${v}, open the list` : `${l} — ${v}`}
                      aria-expanded={openable ? isOpen : undefined}
                      onKeyDown={openable ? pressKey(() => setOpen(isOpen ? null : l)) : undefined}
                      onClick={openable ? () => setOpen(isOpen ? null : l) : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 0", cursor: openable ? "pointer" : "default" }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: c, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                      <span style={{ ...figure, fontSize: 14 }}>{v}</span>
                      {openable ? <span style={{ color: MUTED, fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .16s", display: "inline-block" }}>›</span> : null}
                    </div>
                    {isOpen && rowsFor ? (
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
            <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.5, marginTop: 10 }}>
              Counted off your own sessions — a class you taught or assisted once its session had ended, and a class you were <b style={{ color: SUB }}>checked in</b> to. A booking nobody marked is not a session danced, so it is not counted here.
              {stats.firstSession ? ` Your record runs from ${monthWords(stats.firstSession)} to ${monthWords(stats.lastSession)}.` : " Nothing has happened yet — your first session will start it."}
            </div>
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
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={shelf}>Sessions</span>
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
              shown.map((r, i) => {
                const c = dosStyleColor(r.style);
                const body = (
                  <>
                    <span style={{ ...figure, fontSize: 11, color: MUTED, width: 22, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                      <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 2 }}>
                        {[r.style, r.tenantName, r.room, r.city].filter(Boolean).join(" · ")}
                      </span>
                      <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2, fontFamily: DOS_MONO }}>
                        {dayWords(r.startsAt)} · {timeWords(r.startsAt)} · {r.minutes} min
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
              })
            )}
          </>
        ) : null}

        {tab === "charts" ? (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {CHART_SEGMENTS.map((s) => {
                const on = segment === s.k;
                return (
                  <Link key={s.k} href={`/stats?tab=charts&seg=${s.k}${city ? `&city=${encodeURIComponent(city)}` : ""}`} aria-pressed={on} style={{ flex: 1, textAlign: "center", padding: "9px 2px", borderRadius: 12, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? INK : CARD, color: on ? LILAC : SUB, border: `1.5px solid ${on ? INK : LINE}` }}>
                    {s.label}
                  </Link>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
              <Link href={`/stats?tab=charts&seg=${segment}`} aria-pressed={!city} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", background: !city ? INK : LINE, color: !city ? LILAC : SUB }}>
                📍 Everywhere
              </Link>
              {cities.map((c) => (
                <Link key={c} href={`/stats?tab=charts&seg=${segment}&city=${encodeURIComponent(c)}`} aria-pressed={city === c} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap", background: city === c ? INK : LINE, color: city === c ? LILAC : SUB }}>
                  {c}
                </Link>
              ))}
            </div>

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

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={shelf}>{CHART_SEGMENTS.find((s) => s.k === segment)?.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED }} data-testid="chart-population">
                {chart.length ? `${chart.length} of ${chart[0].population}` : "0"}
              </span>
            </div>
            {chart.length === 0 ? (
              <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 18, padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: DOS_DISPLAY }}>No board here yet</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>Nobody in {city ?? "any city"} has finished a session on this board — a board of nobody is not a ranking.</div>
              </div>
            ) : (
              chart.map((r) => {
                const href = r.kind === "crew" ? `/crew/${r.id}` : r.kind === "studio" ? `/studio/${r.id}` : null;
                const line =
                  r.kind === "crew"
                    ? `${r.conducted} event${r.conducted === 1 ? "" : "s"} entered · ${r.extra} member${r.extra === 1 ? "" : "s"}`
                    : isStudio
                      ? `${r.conducted} session${r.conducted === 1 ? "" : "s"} held · ${hoursWords(r.hours)} · ${r.extra} on the floor`
                      : segment === "artist"
                        ? `${r.conducted} taught · ${r.assisted} assisted · ${hoursWords(r.hours)}`
                        : `${r.attended} danced · ${hoursWords(r.hours)}`;
                const body = (
                  <>
                    <span style={{ ...figure, fontSize: 17, width: 30, textAlign: "center", flexShrink: 0, color: r.place <= 3 ? GOLD : MUTED }}>{r.place}</span>
                    <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${dosStyleColor(r.style ?? "Hip-Hop")},#7C3AED)`, color: "#fff", fontSize: 13, fontWeight: 900, fontFamily: DOS_DISPLAY }}>
                      {r.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 1 }}>{[r.city, r.style].filter(Boolean).join(" · ")}</span>
                      <span style={{ display: "block", fontSize: 9.5, color: MUTED, marginTop: 2 }}>{line}</span>
                    </span>
                    <span style={{ ...figure, fontSize: 13, flexShrink: 0 }}>{r.points}</span>
                  </>
                );
                const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" };
                return href ? (
                  <Link key={`${r.kind}-${r.id}`} href={href} aria-label={`${r.name} — place ${r.place} of ${r.population}`} style={style}>
                    {body}
                  </Link>
                ) : (
                  <div key={`${r.kind}-${r.id}`} aria-label={`${r.name} — place ${r.place} of ${r.population}`} style={style}>
                    {body}
                  </div>
                );
              })
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
