"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, PINK, SUB } from "@/lib/design/tokens";
import {
  addDays,
  dayKeyFor,
  dayNumberOf,
  dowOf,
  mondayIndexOf,
  monthOfDay,
  monthShortOf,
} from "@/lib/format/month";
import type { CalendarEntry, CalendarMonth, CalendarSide } from "@/types/calendar";
import type { DanceClass } from "@/types/class";

/** The calendar, lifted from prototype S_profiletab in its `calendarOnly` dress
 *  (`CalTab=()=><S_profiletab calendarOnly/>` 19146, `StudioCalPage` 19143):
 *  the sticky block of controls — the hero in the calendar's own paint, the room
 *  picker on a studio's, the four-view switcher, Train · Teach · Assist, and the
 *  one date panel every view shares (9057-9300) — with the sessions scrolling
 *  under it as Schedule, Day, Week or Month (9302-9357). Every card is the app's
 *  one class tile (`CalTile=BookingCard`, 8505).
 *
 *  In `public` mode it is the prototype's `pubSchedule` (Step 15): a business's
 *  published classes still to come — no hero, no switcher, no sides, no day
 *  gutter, one view.
 *
 *  Left out on purpose, and tracked in the parity backlog: the Classes/Events
 *  switch above the sides (events are Step 21), the hold-to-reorder gesture on
 *  the side pills (a saved preference that also drives Home, which is not
 *  built). The History chip LANDED 30 Aug 2026: the record page it waited for
 *  has existed since Step 25, so the chip is the prototype's own (9071-9075) and
 *  it opens /stats?tab=history — the library of what you have already danced. */

/* the tile that opens this page is painted in the calendar's own colour, and
   the page wears the same paint (DOS_TOOLS 2932) */
const TOOL_COLOUR = "#5AC8FA";
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

/* TRAIN · TEACH · ASSIST — what the person is doing on the floor (DOS_SIDES 6666) */
const SIDES: Record<CalendarSide, { name: string; tint: string }> = {
  attending: { name: "Train", tint: "#3B82F6" },
  assisting: { name: "Assist", tint: "#0D9488" },
  hosting: { name: "Teach", tint: PINK },
};
const SIDE_KEYS: CalendarSide[] = ["attending", "assisting", "hosting"];

type View = "sched" | "day" | "week" | "month";
const VIEWS: Array<[View, string]> = [
  ["sched", "Schedule"],
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
];
const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** Scroll a row to just under whatever is pinned over it (prototype 1517):
 *  measure every element marked data-dos-sticky that is on screen and land the
 *  row below the lowest edge — the browser has no idea what covers what. */
function dosScrollTo(el: HTMLElement, smooth: boolean) {
  let floor = 0;
  document.querySelectorAll("[data-dos-sticky]").forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.height > 0 && r.top <= window.innerHeight * 0.5 && r.bottom > floor) floor = r.bottom;
  });
  const y = el.getBoundingClientRect().top + window.scrollY - floor - 10;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
}

const toTileClass = (e: CalendarEntry): DanceClass => ({
  id: e.classId,
  tenantId: "",
  title: e.title,
  shareSlug: e.shareSlug,
  style: e.style,
  level: e.level,
  room: e.room,
  roomId: null,
  poster: null,
  priceInr: e.priceInr,
  capacity: e.capacity,
  status: e.classStatus,
  session: { id: e.sessionId, startsAt: e.startsAt, endsAt: e.endsAt },
});

const hourLabel = (h: number) => (h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`);

const emptyCard: React.CSSProperties = {
  background: "transparent",
  borderRadius: 16,
  padding: 14,
  marginBottom: 10,
  textAlign: "center",
  color: SUB,
  fontSize: 12.5,
  border: `1.5px dashed ${LINE}`,
};

export interface CalendarScreenProps {
  /** personal: a person's own; studio: the venue's, drafts included; public: the
   *  prototype's `pubSchedule` — published classes still to come, one view */
  mode: "personal" | "studio" | "public";
  months: CalendarMonth[];
  /** "2026-08-28" in IST — the clock is the server's, handed in */
  todayKey: string;
  entries: CalendarEntry[];
  /** where an empty day sends you: Discover for a person, the class form for a studio */
  emptyHref: string;
  /** studio only: the compose button's destination */
  composeHref?: string;
  /** public only: whose schedule this is — the page stands on its own URL */
  title?: string;
}

export function CalendarScreen({ mode, months, todayKey, entries, emptyHref, composeHref, title: pageTitle }: CalendarScreenProps) {
  const isPublic = mode === "public";
  const idx = (monthKey: string) => months.findIndex((m) => m.key === monthKey);
  const inWindow = (dayKey: string) => idx(monthOfDay(dayKey)) >= 0;

  const [view, setView] = useState<View>("sched");
  const [side, setSide] = useState<"all" | CalendarSide>("all");
  const [sel, setSel] = useState(todayKey);
  const [mi, setMi] = useState(Math.max(0, idx(monthOfDay(todayKey))));
  const [panelOpen, setPanelOpen] = useState(false);
  /* ONE ROOM AT A TIME (8655): a studio with more than one room opens on its
     first room, and "All rooms" is a deliberate act rather than the landing state */
  const rooms = [...new Set(entries.map((e) => e.room).filter((r): r is string => !!r))].sort();
  const [room, setRoom] = useState<string | null>(
    (mode === "studio" || isPublic) && rooms.length > 1 ? rooms[0] : null
  );
  const [ddOpen, setDdOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);
  const jumped = useRef("");

  const isToday = (dayKey: string) => dayKey === todayKey;
  const roomScoped = entries.filter((e) => room === null || e.room === room);
  const passes = (e: CalendarEntry) => side === "all" || e.side === side;
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of roomScoped) {
    if (!passes(e)) continue;
    const list = byDay.get(e.dayKey);
    if (list) list.push(e);
    else byDay.set(e.dayKey, [e]);
  }
  const agendaOf = (dayKey: string) => byDay.get(dayKey) ?? [];
  const agenda = agendaOf(sel);

  const G = months[view === "month" ? mi : Math.max(0, idx(monthOfDay(sel)))];
  const weekStart = addDays(sel, -mondayIndexOf(sel));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  /* the sides' counts follow the view: today's, this week's, this month's, or everything */
  const inScope = (e: CalendarEntry) =>
    view === "day"
      ? e.dayKey === sel
      : view === "week"
        ? e.dayKey >= week[0] && e.dayKey <= week[6]
        : view === "month"
          ? monthOfDay(e.dayKey) === months[mi].key
          : true;
  const scoped = roomScoped.filter(inScope);
  const sideCounts = Object.fromEntries(
    SIDE_KEYS.map((k) => [k, scoped.filter((e) => e.side === k).length])
  ) as Record<CalendarSide, number>;
  const scopeLabel =
    view === "day"
      ? `${dayNumberOf(sel)} ${monthShortOf(monthOfDay(sel))}`
      : view === "week"
        ? "this week"
        : view === "month"
          ? months[mi].monthName
          : "everything";

  /* ── MOVING THE SCHEDULE (9166-9188): in a list, "go to a date" means SCROLL
     to it — the day's row, or the first row after it, since a day with nothing
     on it is not drawn */
  const jumpTo = (dayKey: string) => {
    setSel(dayKey);
    const j = idx(monthOfDay(dayKey));
    if (j >= 0) setMi(j);
    setPanelOpen(false);
    if (view !== "sched") return;
    window.requestAnimationFrame(() => {
      let el = document.getElementById(`doscal-${dayKey}`);
      if (!el) {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[id^="doscal-"]'));
        el = rows.find((n) => n.id.slice("doscal-".length) >= dayKey) ?? rows[rows.length - 1] ?? null;
      }
      if (el) dosScrollTo(el, true);
    });
  };
  const step = (dir: 1 | -1) => {
    if (view === "week" || view === "day") {
      const p = addDays(sel, (view === "week" ? 7 : 1) * dir);
      if (!inWindow(p)) return;
      setSel(p);
      setMi(idx(monthOfDay(p)));
      return;
    }
    const n = mi + dir;
    if (n < 0 || n >= months.length) return;
    setMi(n);
    if (view === "sched") jumpTo(dayKeyFor(months[n].key, 1));
  };
  const canStep = (dir: 1 | -1) =>
    view === "week" || view === "day"
      ? inWindow(addDays(sel, (view === "week" ? 7 : 1) * dir))
      : mi + dir >= 0 && mi + dir < months.length;
  const unit = view === "week" ? "week" : view === "day" ? "day" : "month";
  const title =
    view === "week"
      ? `${dayNumberOf(week[0])} ${monthShortOf(monthOfDay(week[0]))} – ${dayNumberOf(week[6])} ${monthShortOf(monthOfDay(week[6]))}`
      : view === "day"
        ? `${dowOf(sel)} ${dayNumberOf(sel)} ${G.monthName}`
        : G.label;
  const pickView = (v: View) => {
    setView(v);
    /* the panel shuts whenever the view changes — the thing it was picking a date for has changed */
    setPanelOpen(false);
  };

  /* the schedule holds history too, so it is scrolled to today once drawn — and
     re-finds today when the list itself changes (8686-8705) */
  const jumpKey = `${view}|${side}|${room ?? ""}`;
  useEffect(() => {
    if (view !== "sched" || jumped.current === jumpKey) return;
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[id^="doscal-"]'));
    const n = todayRef.current ?? rows[rows.length - 1];
    if (!n) return;
    jumped.current = jumpKey;
    const id = window.requestAnimationFrame(() => dosScrollTo(n, false));
    return () => window.cancelAnimationFrame(id);
  }, [jumpKey, view]);

  /* while the date panel is open the page beneath does not move (8683) */
  useEffect(() => {
    if (!panelOpen) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [panelOpen]);

  const dayCell = (dayKey: string | null, i: number, showLetter: boolean) => {
    if (!dayKey || !inWindow(dayKey)) return <div key={`e${i}`} />;
    const on = sel === dayKey;
    const today = isToday(dayKey);
    const ev = agendaOf(dayKey);
    const d = dayNumberOf(dayKey);
    return (
      <div
        key={dayKey}
        role="button"
        tabIndex={0}
        onKeyDown={pressKey(() => jumpTo(dayKey))}
        onClick={() => jumpTo(dayKey)}
        aria-label={`${d} ${months[idx(monthOfDay(dayKey))].monthName}, ${ev.length} session${ev.length === 1 ? "" : "s"}`}
        style={{ textAlign: "center", padding: "2px 0 4px", cursor: "pointer" }}
      >
        {showLetter ? (
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: i > 4 ? LINE : MUTED }}>
            {WEEK_LETTERS[i]}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 12.5,
            fontWeight: on || today ? 800 : 600,
            width: 28,
            height: 28,
            lineHeight: "28px",
            margin: showLetter ? "3px auto 0" : "0 auto",
            borderRadius: 14,
            color: on ? "#fff" : today ? PINK : ev.length ? INK : MUTED,
            background: on ? PINK : "transparent",
            boxShadow: today && !on ? `inset 0 0 0 1.5px ${PINK}` : "none",
            transition: "background .12s",
          }}
        >
          {d}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 2.5, height: 5, marginTop: 2 }}>
          {ev.slice(0, 4).map((e) => (
            <span
              key={e.sessionId}
              style={{
                width: 4.5,
                height: 4.5,
                borderRadius: 3,
                background: dosStyleColor(e.style),
                opacity: e.dayKey < todayKey ? 0.4 : 1,
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  const sideChip = (s: CalendarSide): React.CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 900,
    padding: "6px 11px",
    borderRadius: 999,
    background: `${SIDES[s].tint}1c`,
    color: SIDES[s].tint,
  });

  const card = (e: CalendarEntry) => (
    <ClassTile
      key={e.sessionId}
      danceClass={toTileClass(e)}
      filled={e.filled}
      tenantName={mode === "personal" ? e.tenantName : undefined}
      city={e.tenantCity}
      href={`/c/${e.shareSlug}`}
      actions={
        mode === "personal" ? (
          <>
            <span style={sideChip(e.side)}>{SIDES[e.side].name}</span>
            {e.side === "attending" && e.enrollment ? (
              <EnrollButton
                sessionId={e.sessionId}
                isFull={e.filled >= e.capacity}
                isSignedIn
                mine={e.enrollment}
                priceInr={e.priceInr}
                shareSlug={e.shareSlug}
              />
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  const nothing = isPublic ? (
    <div style={emptyCard}>
      No upcoming classes on the schedule yet —{" "}
      <Link href={emptyHref} style={{ color: PINK, fontWeight: 800, textDecoration: "none" }}>
        back to the profile →
      </Link>
    </div>
  ) : (
    <div style={emptyCard}>
      {mode === "personal" ? "Nothing booked — " : "Nothing scheduled — "}
      <Link href={emptyHref} style={{ color: PINK, fontWeight: 800, textDecoration: "none" }}>
        {mode === "personal" ? "find a class →" : "add a class →"}
      </Link>
    </div>
  );

  /* the schedule: every day with something on it, past and future, opening on today */
  const schedDays = months
    .flatMap((m) => Array.from({ length: m.days }, (_, i) => dayKeyFor(m.key, i + 1)))
    .map((dayKey) => ({ dayKey, items: agendaOf(dayKey) }))
    .filter((x) => x.items.length > 0);
  const firstToday = schedDays.findIndex((x) => x.dayKey >= todayKey);

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "14px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* ── the controls stay put; only the sessions scroll (9058-9061) ── */}
      <div
        data-dos-sticky="cal"
        style={{
          position: "sticky",
          top: "var(--dos-top)",
          zIndex: 120,
          background: LILAC,
          margin: "0 -16px",
          padding: "8px 16px 6px",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        {/* a public schedule draws no hero (9065) — it is somebody's page, not
            your calendar — so it says whose it is in one quiet line instead */}
        {isPublic ? (
          pageTitle ? (
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: MUTED, margin: "6px 0 10px", textTransform: "uppercase" }}>
              {pageTitle} · schedule
            </div>
          ) : null
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "2px 0 10px",
              borderRadius: 22,
              padding: "15px 17px 14px",
              color: "#fff",
              position: "relative",
              overflow: "hidden",
              background: toolPaint(TOOL_COLOUR),
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -28,
                top: -32,
                width: 130,
                height: 130,
                borderRadius: 65,
                background: "rgba(255,255,255,.13)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>
                Calendar
              </div>
            </div>
            {/* the calendar looks forward; the chip is the way back (9071-9075) */}
            <Link
              href="/stats?tab=history"
              aria-label="History"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.3)", flexShrink: 0, position: "relative", textDecoration: "none" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 8v4l3 2" />
                <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
                <path d="M3.5 5v3.5H7" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>History</span>
            </Link>
          </div>
        )}

        {/* one studio = one location — only rooms need filtering (9076-9098) */}
        {(mode === "studio" || isPublic) && rooms.length > 0 ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={ddOpen}
                aria-label="Filter by room"
                onKeyDown={pressKey(() => setDdOpen((d) => !d))}
                onClick={() => setDdOpen((d) => !d)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  background: CARD,
                  border: `1.5px solid ${ddOpen ? INK : LINE}`,
                  borderRadius: 12,
                  padding: "9px 11px",
                  cursor: "pointer",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="5" width="16" height="15" rx="2.5" />
                  <path d="M9 5v15M4 12h5" />
                </svg>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {room ?? "All rooms"}
                </span>
                <span style={{ fontSize: 10, color: SUB }}>▾</span>
              </div>
              {ddOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 60,
                    background: "var(--solid)",
                    border: `1px solid ${LINE}`,
                    borderRadius: 12,
                    padding: 6,
                    boxShadow: "0 10px 28px rgba(0,0,0,.4)",
                  }}
                >
                  {["All rooms", ...rooms].map((o) => {
                    const cur = (room ?? "All rooms") === o;
                    const pick = () => {
                      setRoom(o === "All rooms" ? null : o);
                      setDdOpen(false);
                    };
                    return (
                      <div
                        key={o}
                        role="button"
                        tabIndex={0}
                        onKeyDown={pressKey(pick)}
                        onClick={pick}
                        style={{
                          padding: "8px 9px",
                          borderRadius: 9,
                          cursor: "pointer",
                          fontSize: 11.5,
                          fontWeight: cur ? 900 : 600,
                          background: cur ? LINE : "transparent",
                        }}
                      >
                        {o}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── the segmented views (9116-9120). A public schedule is ONE view —
            somebody looking at a studio's page came to see when they teach, not
            to operate a calendar (9113) ── */}
        {isPublic ? null : (
        <div style={{ display: "flex", gap: 2, background: LINE, borderRadius: 12, padding: 3, marginBottom: 10 }}>
          {VIEWS.map(([k, l]) => (
            <div
              key={k}
              role="button"
              tabIndex={0}
              aria-pressed={view === k}
              onKeyDown={pressKey(() => pickView(k))}
              onClick={() => pickView(k)}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "7px 4px",
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 11.5,
                fontWeight: 800,
                background: view === k ? "var(--solid)" : "transparent",
                color: view === k ? INK : SUB,
                boxShadow: view === k ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                transition: "all .15s",
              }}
            >
              {l}
            </div>
          ))}
        </div>
        )}

        {/* ── Train · Teach · Assist — the sides of the same calendar, each with
            what it counts in the view you are in. Tapping one narrows every view
            below; tapping it again clears (9121-9155, DosSidePill 6700). A
            studio is a venue, not a person on the floor, so its calendar has no
            sides. ── */}
        {mode === "personal" ? (
          <>
            <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
              {SIDE_KEYS.map((k) => {
                const meta = SIDES[k];
                const n = sideCounts[k];
                const on = side === k;
                const tap = () => setSide(on ? "all" : k);
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    aria-label={`${meta.name}: ${n}`}
                    onKeyDown={pressKey(tap)}
                    onClick={tap}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "9px 11px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? meta.tint : CARD,
                      border: `1px solid ${on ? meta.tint : LINE}`,
                      transition: "background .15s",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1, color: on ? "#fff" : meta.tint, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {n}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1, letterSpacing: -0.15, color: on ? "#fff" : SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {meta.name}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: MUTED, fontWeight: 700, marginBottom: 7 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {side === "all" ? `All three · ${scopeLabel}` : `${SIDES[side].name} only · ${scopeLabel} · tap again for all`}
              </span>
            </div>
          </>
        ) : null}

        {/* ── one date panel, on every view (9157-9300): it names where you are,
            steps forward and back, and folds open onto the month — or, in Week,
            that week — when you tap it. Picking a day closes it again. ── */}
        <div style={{ position: "relative", marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: CARD,
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              padding: "5px 7px 5px 5px",
            }}
          >
            <span
              role="button"
              tabIndex={0}
              aria-expanded={panelOpen}
              aria-label={`${panelOpen ? "Close" : "Open"} the ${unit} picker`}
              onKeyDown={pressKey(() => setPanelOpen((o) => !o))}
              onClick={() => setPanelOpen((o) => !o)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0, cursor: "pointer", padding: "3px 5px", borderRadius: 9 }}
            >
              <span aria-hidden="true" style={{ fontSize: 10, color: MUTED, lineHeight: 1, transform: panelOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }}>
                ▾
              </span>
              <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, letterSpacing: -0.2, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </b>
            </span>
            {view !== "month" && isToday(sel) ? (
              <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.5, color: PINK }}>TODAY</span>
            ) : null}
            <span
              role="button"
              tabIndex={0}
              aria-label="Jump to today"
              onKeyDown={pressKey(() => jumpTo(todayKey))}
              onClick={() => jumpTo(todayKey)}
              style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, color: SUB }}
            >
              Today
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Previous ${unit}`}
              onKeyDown={pressKey(() => step(-1))}
              onClick={() => step(-1)}
              style={{ flexShrink: 0, color: canStep(-1) ? INK : LINE, fontWeight: 900, cursor: "pointer", padding: "0 6px", fontSize: 17 }}
            >
              ‹
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Next ${unit}`}
              onKeyDown={pressKey(() => step(1))}
              onClick={() => step(1)}
              style={{ flexShrink: 0, color: canStep(1) ? INK : LINE, fontWeight: 900, cursor: "pointer", padding: "0 6px", fontSize: 17 }}
            >
              ›
            </span>
          </div>
          {panelOpen ? (
            <>
              <div aria-hidden="true" onClick={() => setPanelOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 130 }} />
              <div
                role="dialog"
                aria-label={`Pick a day in ${title}`}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 140,
                  background: "var(--solid)",
                  border: `1px solid ${LINE}`,
                  borderRadius: 16,
                  padding: "10px 9px 9px",
                  boxShadow: "0 18px 46px rgba(0,0,0,.55)",
                }}
              >
                {view === "week" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                    {week.map((w, i) => dayCell(w, i, true))}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
                      {WEEK_LETTERS.map((d, i) => (
                        <div key={i} style={{ textAlign: "center", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: i > 4 ? LINE : MUTED }}>
                          {d}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 3 }}>
                      {Array.from({ length: G.offset }, (_, i) => <div key={`e${i}`} />)}
                      {Array.from({ length: G.days }, (_, i) => dayCell(dayKeyFor(G.key, i + 1), i, false))}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {/* ── end of the fixed controls; the sessions scroll under them ── */}

      {view === "week" ? (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: MUTED, margin: "10px 0 8px" }}>
            {dowOf(sel)} {dayNumberOf(sel)} {G.monthName.toUpperCase()}
          </div>
          {agenda.length === 0 ? nothing : agenda.map(card)}
        </>
      ) : null}

      {/* ── THE MONTH (9314-9327): the grid lives in the shared panel; what is
          left here is what the month is FOR — the day you picked, named and
          counted, with its sessions under it ── */}
      {view === "month" ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "10px 2px 9px" }}>
            <b style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3 }}>
              {dowOf(sel)} {dayNumberOf(sel)} {months[Math.max(0, idx(monthOfDay(sel)))].monthName}
            </b>
            <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 700 }}>
              {agenda.length ? `${agenda.length} session${agenda.length === 1 ? "" : "s"}` : "nothing on"}
            </span>
            {isToday(sel) ? <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: PINK }}>TODAY</span> : null}
          </div>
          {agenda.length === 0 ? nothing : agenda.map(card)}
        </>
      ) : null}

      {view === "day"
        ? (() => {
            /* the rail covers 8 am–9 pm OR the hours the day actually uses,
               whichever is wider (9335-9340) */
            const used = agenda.map((e) => e.hour);
            const lo = Math.min(8, ...(used.length ? used : [8]));
            const hi = Math.max(21, ...(used.length ? used : [21]));
            return (
              <>
                <div style={{ height: 8 }} />
                <div>
                  {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => {
                    const ev = agenda.filter((e) => e.hour === h);
                    return (
                      <div key={h} style={{ display: "flex", minHeight: ev.length ? 26 : 22 }}>
                        <div style={{ width: 52, textAlign: "right", paddingRight: 8, fontSize: 10, color: MUTED, paddingTop: 4, flexShrink: 0 }}>
                          {hourLabel(h)}
                        </div>
                        <div style={{ flex: 1, padding: "0 0 3px", minWidth: 0, borderTop: `1px solid ${LINE}` }}>{ev.map(card)}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        : null}

      {view === "sched" ? (
        <div style={{ paddingTop: 10 }}>
          {schedDays.length === 0 ? nothing : null}
          {schedDays.map(({ dayKey, items }, gi) => {
            const past = dayKey < todayKey;
            return (
              <div key={dayKey}>
                {gi === firstToday && firstToday > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "4px 0 10px", scrollMarginTop: 70 }}>
                    <span style={{ flex: 1, height: 1, background: LINE }} />
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: PINK, textTransform: "uppercase" }}>Today</span>
                    <span style={{ flex: 1, height: 1, background: LINE }} />
                  </div>
                ) : null}
                {/* the day gutter is the owner calendar's spine (9346). On a
                    public schedule the card already carries the day, the date
                    and the month in its own left column, so the gutter would
                    print the date twice */}
                <div
                  id={`doscal-${dayKey}`}
                  ref={gi === firstToday ? todayRef : null}
                  style={{ display: "flex", gap: isPublic ? 0 : 10, marginBottom: 8, opacity: past ? 0.62 : 1, scrollMarginTop: 180 }}
                >
                  {isPublic ? null : (
                  <div style={{ width: 46, textAlign: "center", paddingTop: 6, flexShrink: 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: isToday(dayKey) ? PINK : MUTED }}>{dowOf(dayKey)}</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        width: 30,
                        height: 30,
                        lineHeight: "30px",
                        margin: "2px auto 0",
                        borderRadius: 15,
                        color: isToday(dayKey) ? "#fff" : INK,
                        background: isToday(dayKey) ? PINK : "transparent",
                      }}
                    >
                      {dayNumberOf(dayKey)}
                    </div>
                    <div style={{ fontSize: 8.5, color: MUTED }}>{monthShortOf(monthOfDay(dayKey)).toUpperCase()}</div>
                  </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>{items.map(card)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* the compose button (10538-10560): an "Add class" for a studio. An
          EVENT is Step 21's, so the second row is absent rather than refused. */}
      {mode === "studio" && composeHref ? (
        <>
          {fabOpen ? (
            <div aria-hidden="true" onClick={() => setFabOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 315, background: "rgba(0,0,0,.25)" }} />
          ) : null}
          {fabOpen ? (
            <div style={{ position: "fixed", bottom: 158, left: "50%", transform: "translateX(64px)", zIndex: 320, display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
              <Link
                href={composeHref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "11px 16px",
                  borderRadius: 14,
                  background: "var(--solid)",
                  border: `1px solid ${LINE}`,
                  boxShadow: "0 8px 24px rgba(0,0,0,.35)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: INK,
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add class
              </Link>
            </div>
          ) : null}
          <div
            role="button"
            tabIndex={0}
            aria-label="Compose"
            aria-expanded={fabOpen}
            onKeyDown={pressKey(() => setFabOpen((v) => !v))}
            onClick={() => setFabOpen((v) => !v)}
            style={{
              position: "fixed",
              bottom: 92,
              left: "50%",
              transform: "translateX(133px)",
              zIndex: 320,
              width: 56,
              height: 56,
              borderRadius: 18,
              cursor: "pointer",
              background: INK,
              color: "var(--solid)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 28px rgba(0,0,0,.4)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--solid)" strokeWidth="2" strokeLinecap="round" style={{ transform: fabOpen ? "rotate(45deg)" : "none", transition: "transform .2s" }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </>
      ) : null}
    </div>
  );
}
