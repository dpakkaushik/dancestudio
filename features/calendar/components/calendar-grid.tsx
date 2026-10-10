"use client";

import { useRef, useSyncExternalStore } from "react";
import { inkOn } from "@/components/ui/ToolCard";
import { INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { dayNumberOf, dowOf } from "@/lib/format/month";

/** THE CALENDAR'S TIME GRID AND MONTH GRID (10 Oct 2026, the user: "fix calender
 *  and makit same as google calender. fix pages for day, week, month, redesign it
 *  accordingly. with current calendar functions in mind. make sure calendar in
 *  smooth").
 *
 *  Google Calendar's three shapes, drawn for a phone:
 *  · DAY and WEEK are a TIME GRID — an hour gutter on the left, a line per hour,
 *    and every session a block placed at its start and as tall as it runs, with
 *    sessions that overlap sharing the width side by side; a red line marks now.
 *  · MONTH is a GRID OF DAYS — a number per cell and a coloured chip per session,
 *    "+N" past the third — and the day you tap lists its sessions under it.
 *
 *  ⚠ The clock: every row carries its IST `dayKey`, and a block's place on the
 *  rail is its IST minute of the day, worked out here from the ISO string (no
 *  `Date.now()` during render — this repo's purity rule). The red NOW line reads
 *  the clock through `useSyncExternalStore` with a server snapshot of null, so
 *  the server draws no line and the client adds it after hydration, once a minute.
 *
 *  ⚠ What it does NOT do, on purpose: drag to move a session or press-and-hold to
 *  make one (a calendar here composes nothing since 29 Sep 2026 — a class begins
 *  in its section), and an all-day row (nothing on this calendar runs all day). */

export interface GridItem {
  id: string;
  startsAt: string;
  endsAt: string;
  /** the block itself, told how tall it was drawn so it can say less when short */
  render: (heightPx: number, narrow: boolean) => React.ReactNode;
}

const IST_OFFSET_MIN = 330;

/** the IST minute of the day a moment falls on, 0–1439 */
export const istMinuteOf = (iso: string): number => {
  const m = Math.floor(Date.parse(iso) / 60000) + IST_OFFSET_MIN;
  return ((m % 1440) + 1440) % 1440;
};

const hourLabel = (h: number) => (h === 0 || h === 24 ? "12 am" : h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`);

interface Placed {
  item: GridItem;
  s: number;
  e: number;
  col: number;
  cols: number;
}

/** Google's overlap rule: sessions that overlap in time share the width, each
 *  in the first column free at its start; a run of overlapping sessions is one
 *  cluster and every member of it is drawn at the cluster's width. */
export function layoutDay(items: GridItem[]): Placed[] {
  const sorted = items
    .map((item) => {
      const s = istMinuteOf(item.startsAt);
      const run = Math.max(0, (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000);
      /* a session running past midnight is drawn to the foot of its own day */
      const e = Math.min(1440, s + Math.max(run, 20));
      return { item, s, e, col: 0, cols: 1 };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const p of cluster) p.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };
  for (const p of sorted) {
    if (cluster.length && p.s >= clusterEnd) close();
    let c = colEnds.findIndex((end) => end <= p.s);
    if (c < 0) {
      c = colEnds.length;
      colEnds.push(p.e);
    } else colEnds[c] = p.e;
    p.col = c;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.e);
  }
  close();
  return out;
}

/** the hours a grid draws: 8 am to 10 pm, widened to whatever the shown days use */
export function hourRange(items: GridItem[]): [number, number] {
  let lo = 8;
  let hi = 22;
  for (const it of items) {
    const s = istMinuteOf(it.startsAt);
    const run = Math.max(0, (Date.parse(it.endsAt) - Date.parse(it.startsAt)) / 60000);
    lo = Math.min(lo, Math.floor(s / 60));
    hi = Math.max(hi, Math.min(24, Math.ceil((s + run) / 60)));
  }
  return [lo, hi];
}

/* ── the clock, once a minute, client only ── */
const subscribeMinute = (cb: () => void) => {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
};
const minuteSnapshot = () => Math.floor(Date.now() / 60000);
const noSnapshot = () => null;
export function useNowMinute(): number | null {
  const m = useSyncExternalStore(subscribeMinute, minuteSnapshot, noSnapshot);
  return m === null ? null : (((m + IST_OFFSET_MIN) % 1440) + 1440) % 1440;
}

/** A SWIPE STEPS THE CALENDAR (Google's own gesture): a horizontal drag of 56px
 *  or more that is clearly sideways goes to the next or the previous day, week or
 *  month. Read on touchend, never preventing the scroll, so a vertical scroll is
 *  never fought for. */
export function useSwipe(onStep: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.8) onStep(dx < 0 ? 1 : -1);
    },
  };
}

const NOW_RED = "#EA4335";

export interface TimeGridProps {
  days: string[];
  itemsOf: (dayKey: string) => GridItem[];
  todayKey: string;
  /** px per hour */
  hourH: number;
  /** a day's header pressed — the week opens that day */
  onDay?: (dayKey: string) => void;
  /** the day the week was opened from, marked in its header */
  selected?: string;
}

/** ONE TIME GRID for Day (one column) and Week (seven). */
export function TimeGrid({ days, itemsOf, todayKey, hourH, onDay, selected }: TimeGridProps) {
  const nowMin = useNowMinute();
  const all = days.flatMap(itemsOf);
  const [lo, hi] = hourRange(all);
  const height = (hi - lo) * hourH;
  const narrow = days.length > 1;
  const gutter = narrow ? 34 : 46;
  const top = (min: number) => ((min - lo * 60) / 60) * hourH;

  return (
    <div data-testid="cal-timegrid" data-days={days.length}>
      {/* the day headers — the weekday and the date, today filled (Google's blue
          circle, in the page's ink here: the 28 Sep "not blue" rule) */}
      <div style={{ display: "flex", paddingLeft: gutter, marginBottom: 6 }}>
        {days.map((d) => {
          const today = d === todayKey;
          const on = selected === d && !today;
          const head = (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: today ? INK : MUTED, textTransform: "uppercase" }}>{narrow ? dowOf(d).slice(0, 1) : dowOf(d)}</div>
              <div
                style={{
                  margin: "3px auto 0",
                  width: narrow ? 28 : 40,
                  height: narrow ? 28 : 40,
                  lineHeight: narrow ? "28px" : "40px",
                  borderRadius: 999,
                  fontSize: narrow ? 13 : 20,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color: today ? "var(--solid)" : INK,
                  background: today ? INK : "transparent",
                  boxShadow: on ? `inset 0 0 0 1.5px ${INK}` : "none",
                }}
              >
                {dayNumberOf(d)}
              </div>
            </>
          );
          return onDay ? (
            <button
              key={d}
              type="button"
              aria-label={`Open ${dowOf(d)} ${dayNumberOf(d)}`}
              onClick={() => onDay(d)}
              style={{ flex: 1, minWidth: 0, textAlign: "center", background: "none", border: "none", padding: "2px 0", cursor: "pointer", color: INK, font: "inherit" }}
            >
              {head}
            </button>
          ) : (
            <div key={d} style={{ flex: narrow ? 1 : undefined, textAlign: narrow ? "center" : "left", paddingLeft: narrow ? 0 : 4 }}>
              {head}
            </div>
          );
        })}
      </div>

      <div style={{ position: "relative", height, marginTop: 6 }}>
        {/* the hour lines, the label riding each line as Google draws it */}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => (
          <div key={h} aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: (h - lo) * hourH, height: 0 }}>
            {h < hi ? (
              <span style={{ position: "absolute", left: 0, width: gutter - 6, top: -6, textAlign: "right", fontSize: narrow ? 9 : 10, color: MUTED, fontWeight: 700, whiteSpace: "nowrap" }}>
                {hourLabel(h)}
              </span>
            ) : null}
            <span style={{ position: "absolute", left: gutter, right: 0, top: 0, borderTop: `1px solid ${LINE}` }} />
          </div>
        ))}

        {/* the day columns */}
        <div style={{ position: "absolute", left: gutter, right: 0, top: 0, bottom: 0, display: "flex" }}>
          {days.map((d, di) => {
            const placed = layoutDay(itemsOf(d));
            const today = d === todayKey;
            return (
              <div
                key={d}
                data-testid="cal-day-col"
                data-day={d}
                style={{
                  position: "relative",
                  flex: 1,
                  minWidth: 0,
                  borderLeft: di === 0 && !narrow ? "none" : `1px solid ${LINE}`,
                  background: today && narrow ? "rgba(127,127,127,.06)" : "transparent",
                }}
              >
                {placed.map((p) => {
                  const h = Math.max(((p.e - p.s) / 60) * hourH - 2, 18);
                  const w = 100 / p.cols;
                  /* ⚠ A WEEK COLUMN IS ~48px, so overlapping sessions CASCADE there
                     (Google's own week): each later one steps 8px in and sits on
                     top, rather than splitting the column into slivers no name
                     fits in. A day column is wide enough to share side by side. */
                  const box = narrow
                    ? { left: `${p.col * 8 + 1}px`, width: `calc(100% - ${p.col * 8 + 2}px)` }
                    : { left: `calc(${p.col * w}% + 1px)`, width: `calc(${w}% - 4px)` };
                  return (
                    <div
                      key={p.item.id}
                      style={{
                        position: "absolute",
                        top: top(p.s) + 1,
                        height: h,
                        ...box,
                        zIndex: 1 + p.col,
                        boxShadow: narrow && p.col > 0 ? "0 0 0 1.5px var(--card)" : "none",
                        borderRadius: 6,
                      }}
                    >
                      {p.item.render(h, narrow)}
                    </div>
                  );
                })}
                {/* NOW — the red line with its dot, on today's column only */}
                {today && nowMin !== null && nowMin >= lo * 60 && nowMin <= hi * 60 ? (
                  <div data-testid="cal-now" aria-hidden="true" style={{ position: "absolute", left: -1, right: 0, top: top(nowMin), height: 0, zIndex: 2 }}>
                    <span style={{ position: "absolute", left: -5, top: -5, width: 10, height: 10, borderRadius: 5, background: NOW_RED }} />
                    <span style={{ position: "absolute", left: 0, right: 0, top: -1, borderTop: `2px solid ${NOW_RED}` }} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export interface MonthChip {
  id: string;
  label: string;
  tint: string;
  faded: boolean;
}

export interface MonthGridProps {
  /** the month's 1st and how many days, and its Monday-first offset */
  monthKey: string;
  days: number;
  offset: number;
  dayKeyFor: (day: number) => string;
  chipsOf: (dayKey: string) => MonthChip[];
  inWindow: (dayKey: string) => boolean;
  todayKey: string;
  selected: string;
  onPick: (dayKey: string) => void;
  /** the day before the 1st, and so on — the neighbouring month's days, faded */
  shift: (dayKey: string, n: number) => string;
}

/** THE MONTH — Google's grid of days, a chip per session, "+N" past three. */
export function MonthGrid({ days, offset, dayKeyFor, chipsOf, inWindow, todayKey, selected, onPick, shift }: MonthGridProps) {
  const first = dayKeyFor(1);
  const cells = Math.ceil((offset + days) / 7) * 7;
  const keys = Array.from({ length: cells }, (_, i) => shift(first, i - offset));
  return (
    <div data-testid="cal-monthgrid">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", marginBottom: 4 }}>
        {WEEK_LETTERS.map((l, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: MUTED }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}` }}>
        {keys.map((k, i) => {
          const inMonth = i >= offset && i < offset + days;
          const usable = inWindow(k);
          const chips = usable ? chipsOf(k) : [];
          const today = k === todayKey;
          const on = k === selected;
          const shown = chips.slice(0, 3);
          const more = chips.length - shown.length;
          return (
            <button
              key={k}
              type="button"
              disabled={!usable}
              aria-pressed={on}
              aria-label={`${dowOf(k)} ${dayNumberOf(k)}, ${chips.length} session${chips.length === 1 ? "" : "s"}`}
              onClick={() => onPick(k)}
              style={{
                minWidth: 0,
                minHeight: 78,
                padding: "3px 2px 4px",
                background: on ? "rgba(127,127,127,.12)" : "transparent",
                border: "none",
                borderRight: `1px solid ${LINE}`,
                borderBottom: `1px solid ${LINE}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 2,
                cursor: usable ? "pointer" : "default",
                opacity: inMonth ? 1 : 0.42,
                font: "inherit",
                color: INK,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  alignSelf: "center",
                  width: 22,
                  height: 22,
                  lineHeight: "22px",
                  textAlign: "center",
                  borderRadius: 11,
                  fontSize: 11.5,
                  fontWeight: today || on ? 900 : 700,
                  fontVariantNumeric: "tabular-nums",
                  color: today ? "var(--solid)" : INK,
                  background: today ? INK : "transparent",
                  marginBottom: 1,
                }}
              >
                {dayNumberOf(k)}
              </span>
              {shown.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "block",
                    fontSize: 8.5,
                    fontWeight: 800,
                    lineHeight: "13px",
                    height: 13,
                    padding: "0 3px",
                    borderRadius: 4,
                    background: c.faded ? `${c.tint}40` : c.tint,
                    /* the ink is picked off the colour, so a light style's chip is not white on yellow */
                    color: c.faded ? INK : inkOn(c.tint),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label}
                </span>
              ))}
              {more > 0 ? <span style={{ fontSize: 8.5, fontWeight: 800, color: SUB, paddingLeft: 3 }}>+{more}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
