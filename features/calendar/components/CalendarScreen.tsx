"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, SKY, SUB } from "@/lib/design/tokens";
import {
  addDays,
  dayKeyFor,
  dayNumberOf,
  dowOf,
  mondayIndexOf,
  monthOfDay,
  monthShortOf,
} from "@/lib/format/month";
import { timeOf } from "@/lib/format/session";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { CalendarEntry, CalendarMonth, CalendarPracticeEntry, CalendarSide } from "@/types/calendar";
import { PRACTICE_TINT, PRACTICE_WORD, practiceWhen } from "@/types/crewPractice";
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
 *  Left out on purpose, and tracked in the parity backlog: the hold-to-reorder
 *  gesture on the side pills (a saved preference that also drives Home, which
 *  is not built). ⚠ The prototype's Classes/Events switch was BUILT on 18 Sep
 *  2026 and is a Classes/Practice switch since 29 Sep, events being gone — the
 *  control is the prototype's and the second half is not.
 *  ⚠ The History chip landed 30 Aug 2026, came off this hero on 19 Sep at the
 *  user's word, and the LIBRARY it opened went on 29 Sep with the second stats
 *  screen. Nothing here draws it; the note below says where it stood. */

/* the tile that opens this page is painted in the calendar's own colour, and
   the page wears the same paint (DOS_TOOLS 2932). Deepened from #5AC8FA with
   the palette on 18 Sep 2026 — it must stay equal to DOS_TOOLS.calendar.c */
const TOOL_COLOUR = "#06B6D4";
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

/* TRAIN · TEACH · ASSIST — what the person is doing on the floor (DOS_SIDES 6666) */
const SIDES: Record<CalendarSide, { name: string; tint: string }> = {
  attending: { name: "Train", tint: "#3B82F6" },
  assisting: { name: "Assist", tint: "#0D9488" },
  hosting: { name: "Teach", tint: SKY },
};
const SIDE_KEYS: CalendarSide[] = ["attending", "assisting", "hosting"];
/* ⚠ `EVENTS_TINT` went with events (29 Sep 2026) — the amber half of the switch.
   The practices half wears the Practice tool's own green, so the switch says
   which half you are in before you read the words */
const PRACTICE_C = "#15803D";

/** ⚠⚠ TODAY IS INK, AND IT IS SAID ONCE (28 Sep 2026, the user: *"should not
 *  repeat today teice it appears in blue which it should not on all profile
 *  schedules and calendar"*). Both halves of that were true, on the calendar AND
 *  on a public schedule, which is the same component in `public` mode.
 *
 *  ⚠ TWICE: the controls row carried a `TODAY` badge whenever the day you were
 *  on WAS today — sitting immediately beside the `Today` button, so one line
 *  held the word twice, saying two different things (*you are on it* and *go to
 *  it*) in the same nine pixels. Below it the schedule's own divider said it a
 *  third time. The badge is gone: the title already prints the date and the
 *  button already carries the word, so what the badge added was the repetition.
 *  What SURVIVES is the divider, because it is the only one of the three that
 *  marks a POSITION — where today falls in a list that runs from the past — and
 *  the button, because it is a control rather than a label.
 *
 *  ⚠ BLUE: every one of those markers was `SKY`, which has been `#5AC8FA` — a
 *  cyan — since the palette swap, and the calendar's own tool colour `#06B6D4`
 *  is no escape from that. So the marker is the page's own ink now, and the two
 *  states in the day picker read as a pair instead of two blues: **the day you
 *  PICKED is a filled ink circle, today-you-have-not-picked is an ink ring.**
 *  Nothing else moves — `SIDES.hosting` keeps its tint, because Teach is not
 *  today. */
const TODAY_INK = INK;

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
  businessId: "",
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
  /* a calendar entry carries no venue or pin — the card does not draw them */
  venueBusinessId: null,
  venueStatus: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  /* a card stands in for the class; whose pass pays is the class’s own answer,
     read on its page — these carry the column defaults so the shape matches */
  allowsStudioMemberships: true,
  allowsArtistMemberships: false,
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

/** ONE ROW ON THE CALENDAR — a class session or a crew practice. Every view
 *  groups, filters and counts through these five fields and nothing else, so a
 *  second kind of row did not have to touch the schedule, the day rail, the week
 *  or the month grid. `side` is null on anything but a class: Train · Teach ·
 *  Assist are class ideas.
 *  ⚠ A DAY OF AN EVENT was the second variant and went on 29 Sep 2026. */
type Row =
  | { k: "class"; id: string; dayKey: string; hour: number; startsAt: string; style: string; room: string | null; side: CalendarSide; e: CalendarEntry }
  /* ⚠ A PRACTICE IS ITS OWN KIND (27 Sep 2026) — see `CalendarPracticeEntry` for
     why it is neither of the other two. It carries the same five fields every
     view groups, filters and counts through, so adding it did not have to touch
     the schedule, the day rail, the week or the month grid either. */
  | { k: "practice"; id: string; dayKey: string; hour: number; startsAt: string; style: string; room: null; side: null; e: CalendarPracticeEntry };

const classRow = (e: CalendarEntry): Row => ({
  k: "class",
  id: e.sessionId,
  dayKey: e.dayKey,
  hour: e.hour,
  startsAt: e.startsAt,
  style: e.style,
  room: e.room,
  side: e.side,
  e,
});
const practiceRow = (e: CalendarPracticeEntry): Row => ({
  k: "practice",
  id: e.practiceId,
  dayKey: e.dayKey,
  hour: e.hour,
  startsAt: e.startsAt,
  style: e.style,
  room: null,
  side: null,
  e,
});

/** ⚠⚠ A SESSION ON THE CALENDAR IS A PILL (28 Sep 2026, the user: *"calendar
 *  should only have pills with infor instead of cards"*).
 *
 *  ⚠ AND ONLY ON THE CALENDAR — the same person, narrowing it twice in the same
 *  breath: *"pills should only be in calendar not on schedule on profiles
 *  visible through discover"*, then *"or any public profile page"*. So the
 *  boundary is `mode === "public"`, which IS that line: `PublicSchedulePage` is
 *  the only caller that passes it, it is what every public profile's Schedule
 *  button opens, and it is the one surface a stranger reaches from Discover.
 *  There a class keeps the app's one `ClassTile`, because a stranger deciding
 *  whether to come needs the price, the seats left and the teacher's face —
 *  which is the whole of what a card carries and a pill does not.
 *
 *  ⚠ WHAT A PILL CARRIES, and why it is enough on YOUR OWN calendar: you are
 *  not deciding whether to come, you are reading WHEN — so the row is the time,
 *  the name, a dot in the thing's own colour and one chip saying what it is to
 *  you. Four sessions now fit where one card did.
 *
 *  ⚠ ONE CLOCK for all three kinds (`timeOf`), where the practice card had its
 *  own (`practiceClock`) — two grammars for one fact on one screen is what this
 *  file has had to undo before. */
const PILL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minWidth: 0,
  background: CARD,
  border: `1.5px solid ${LINE}`,
  borderRadius: 999,
  padding: "8px 13px",
  marginBottom: 7,
  textDecoration: "none",
  color: INK,
};
const PILL_TIME: React.CSSProperties = { flexShrink: 0, fontSize: 11, fontWeight: 900, color: SUB };
const PILL_NAME: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pillDot = (tint: string): React.CSSProperties => ({ flexShrink: 0, width: 8, height: 8, borderRadius: 4, background: tint });
const pillChip = (tint: string): React.CSSProperties => ({
  flexShrink: 0,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  padding: "3px 8px",
  borderRadius: 999,
  background: `${tint}1f`,
  color: tint,
});

export interface CalendarScreenProps {
  /** personal: a person's own classes and practices; studio: the venue's
   *  classes, drafts included; public: the prototype's `pubSchedule` — published
   *  classes still to come, one view.
   *  ⚠ `crew` JOINED THE LIST (27 Sep 2026, the user: "crews should also have a
   *  calendar tab") — a crew teaches no class, so its calendar IS its practices.
   *  ⚠ `org` WAS THE FIFTH and went on 29 Sep 2026: an organization's calendar
   *  WAS its events, so with events gone there was nothing on it at all. */
  mode: "personal" | "studio" | "crew" | "public";
  months: CalendarMonth[];
  /** "2026-08-28" in IST — the clock is the server's, handed in */
  todayKey: string;
  entries: CalendarEntry[];
  /** the crew practices on this calendar: every crew this person leads or is
   *  confirmed on, or — on a crew's own tab — that one crew's */
  practices?: CalendarPracticeEntry[];
  /** where an empty day sends you: Discover for a person, the class form for a studio */
  emptyHref: string;
  /** public only: whose schedule this is — the page stands on its own URL */
  title?: string;
}

export function CalendarScreen({ mode, months, todayKey, entries, practices = [], emptyHref, title: pageTitle }: CalendarScreenProps) {
  const isPublic = mode === "public";
  const isCrew = mode === "crew";
  const idx = (monthKey: string) => months.findIndex((m) => m.key === monthKey);
  const inWindow = (dayKey: string) => idx(monthOfDay(dayKey)) >= 0;

  const [view, setView] = useState<View>("sched");
  const [side, setSide] = useState<"all" | CalendarSide>("all");
  /* THE HALF THIS TAB IS SHOWING. The prototype's Classes/Events switch became
     real on 18 Sep 2026 and gained a third value on 27 Sep; ⚠ the EVENTS half
     went on 29 Sep, so what is left is Classes and Practice. A crew's calendar
     IS its practices, so a crew is never offered the switch at all. */
  const [kind, setKind] = useState<"classes" | "practices">(isCrew ? "practices" : "classes");
  const showPractices = isCrew || kind === "practices";
  /* a person is offered the switch whenever every half can exist; a studio and
     a public schedule have classes only */
  const canSwitch = mode === "personal";
  const [sel, setSel] = useState(todayKey);
  const [mi, setMi] = useState(Math.max(0, idx(monthOfDay(todayKey))));
  const [panelOpen, setPanelOpen] = useState(false);
  useCloseOnBack(() => setPanelOpen(false), panelOpen);
  /* ONE ROOM AT A TIME (8655): a studio with more than one room opens on its
     first room, and "All rooms" is a deliberate act rather than the landing state */
  const rooms = [...new Set(entries.map((e) => e.room).filter((r): r is string => !!r))].sort();
  const [room, setRoom] = useState<string | null>(
    (mode === "studio" || isPublic) && rooms.length > 1 ? rooms[0] : null
  );
  const [ddOpen, setDdOpen] = useState(false);
  /* ⚠ `fabOpen` went with the compose FAB (29 Sep 2026): it opened the sheet
     that offered Add class / Add event, and a calendar composes nothing now */
  const todayRef = useRef<HTMLDivElement>(null);
  const jumped = useRef("");

  const isToday = (dayKey: string) => dayKey === todayKey;
  /* the half this tab is showing: one axis at a time, never both mixed, because
     a day with a class and a battle on it answers two different questions */
  const half: Row[] = showPractices ? practices.map(practiceRow) : entries.map(classRow);
  const roomScoped = half.filter((r) => room === null || r.room === room);
  /* ⚠ THE SIDES ARE A CLASS IDEA and neither an event nor a practice has one —
     nobody assists a battle, and nobody trains at their own crew's rehearsal */
  const passes = (r: Row) => r.k !== "class" || side === "all" || r.side === side;
  const byDay = new Map<string, Row[]>();
  for (const r of roomScoped) {
    if (!passes(r)) continue;
    const list = byDay.get(r.dayKey);
    if (list) list.push(r);
    else byDay.set(r.dayKey, [r]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const agendaOf = (dayKey: string) => byDay.get(dayKey) ?? [];
  const agenda = agendaOf(sel);

  const G = months[view === "month" ? mi : Math.max(0, idx(monthOfDay(sel)))];
  const weekStart = addDays(sel, -mondayIndexOf(sel));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  /* the sides' counts follow the view: today's, this week's, this month's, or
     everything — and they count CLASSES, whichever tab is open, because that is
     what the three sides are about */
  const inScope = (dayKey: string) =>
    view === "day"
      ? dayKey === sel
      : view === "week"
        ? dayKey >= week[0] && dayKey <= week[6]
        : view === "month"
          ? monthOfDay(dayKey) === months[mi].key
          : true;
  const classScoped = entries.filter((e) => (room === null || e.room === room) && inScope(e.dayKey));
  const sideCounts = Object.fromEntries(
    SIDE_KEYS.map((k) => [k, classScoped.filter((e) => e.side === k).length])
  ) as Record<CalendarSide, number>;
  const practicesInScope = practices.filter((e) => inScope(e.dayKey)).length;
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
  const jumpKey = `${view}|${kind}|${side}|${room ?? ""}`;
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
            /* the day you PICKED is filled ink; today-not-picked is an ink ring */
            color: on ? "var(--solid)" : today ? TODAY_INK : ev.length ? INK : MUTED,
            background: on ? TODAY_INK : "transparent",
            boxShadow: today && !on ? `inset 0 0 0 1.5px ${TODAY_INK}` : "none",
            transition: "background .12s",
          }}
        >
          {d}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 2.5, height: 5, marginTop: 2 }}>
          {ev.slice(0, 4).map((e) => (
            <span
              key={e.id}
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

  /** ONE PILL — the time, the name, a dot in the thing's own colour, and one
   *  chip saying what it is to you. See `PILL` above for why, and for the one
   *  surface this is NOT used on. */
  const pill = (r: Row) => {
    /* ⚠ an EVENT's pill was the first branch and went on 29 Sep 2026 */
    if (r.k === "practice") {
      const e = r.e;
      /* a called-off practice keeps its row and says so — the 27 Sep rule that
         cancelling is a STATUS and never a delete, said on the calendar too */
      const tint = e.cancelled ? MUTED : PRACTICE_TINT[e.standing];
      return (
        <Link
          key={r.id}
          data-testid="cal-pill"
          href={e.href}
          aria-label={`${e.crewName} practice, ${practiceWhen(e.startsAt)}${e.cancelled ? " — called off" : ""}`}
          style={{ ...PILL, opacity: e.cancelled ? 0.65 : 1 }}
        >
          <span aria-hidden="true" style={pillDot(e.cancelled ? LINE : PRACTICE_C)} />
          <span style={PILL_TIME}>{timeOf(e.startsAt)}</span>
          <span style={PILL_NAME}>
            {e.crewName} · {e.place}
          </span>
          <span style={pillChip(tint)}>{e.cancelled ? "Called off" : PRACTICE_WORD[e.standing]}</span>
        </Link>
      );
    }
    const e = r.e;
    /* ⚠ `Open {title}` — the SAME accessible name `ClassTile` gives the same
       class on the public schedule and on Discover. One control name for one
       act, so a screen reader and a locator both find the class by the name the
       app uses everywhere else rather than by the shape it is drawn in. */
    return (
      <Link key={r.id} data-testid="cal-pill" href={`/c/${e.shareSlug}`} aria-label={`Open ${e.title}`} style={PILL}>
        <span aria-hidden="true" style={pillDot(dosStyleColor(e.style))} />
        <span style={PILL_TIME}>{timeOf(e.startsAt)}</span>
        <span style={PILL_NAME}>{e.title}</span>
        {/* what this class is to YOU on your own calendar; which ROOM it is in on
            a studio's, which is the one fact that calendar is read for */}
        {mode === "personal" ? (
          <span style={pillChip(SIDES[e.side].tint)}>{SIDES[e.side].name}</span>
        ) : e.room ? (
          <span style={pillChip(TOOL_COLOUR)}>{e.room}</span>
        ) : null}
      </Link>
    );
  };

  /** THE PUBLIC SCHEDULE KEEPS THE CARD (28 Sep 2026 — the user's own
   *  narrowing). `PublicSchedulePage` passes `entries` and nothing else, so a
   *  class is the only kind that reaches here; anything else would be a caller
   *  that does not exist yet, and it gets a pill rather than nothing. */
  const publicCard = (r: Row) => {
    if (r.k !== "class") return pill(r);
    const e = r.e;
    return <ClassTile key={r.id} danceClass={toTileClass(e)} filled={e.filled} artist={e.artist} city={e.tenantCity} href={`/c/${e.shareSlug}`} />;
  };

  const card = (r: Row) => (isPublic ? publicCard(r) : pill(r));

  const nothing = isPublic ? (
    <div style={emptyCard}>
      No upcoming classes on the schedule yet —{" "}
      <Link href={emptyHref} style={{ color: SKY, fontWeight: 800, textDecoration: "none" }}>
        back to the profile →
      </Link>
    </div>
  ) : (
    /* the empty state names the half you are looking at, and its door goes where
       that half comes from */
    <div style={emptyCard}>
      {showPractices ? (isCrew ? "Nothing arranged on " : "No practice on — ") : mode === "personal" ? "Nothing booked — " : "Nothing scheduled — "}
      <Link href={emptyHref} style={{ color: SKY, fontWeight: 800, textDecoration: "none" }}>
        {showPractices ? (isCrew ? "arrange one →" : "open your crew →") : mode === "personal" ? "find a class →" : "add a class →"}
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
          borderBottom: `1.5px solid ${LINE}`,
        }}
      >
        {/* a public schedule draws no hero (9065) — it is somebody's page, not
            your calendar — so it says whose it is in one quiet line instead */}
        {/* ⚠ EACH BRANCH CARRIES THE PAGE'S OWN `<h1>` (28 Sep 2026). The chrome
            stopped printing a drill page's name when the wordmark became
            constant, so this line and the hero below are the only things naming
            these five routes (a person's calendar, a studio's, a crew's, and the
            two public schedules). Nothing is drawn differently — `margin` keeps
            what each already had, and a quiet line stays a quiet line. */}
        {isPublic ? (
          pageTitle ? (
            <h1 style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: MUTED, margin: "6px 0 10px", textTransform: "uppercase" }}>
              {pageTitle} · schedule
            </h1>
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
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>
                Calendar
              </h1>
            </div>
            {/* ⚠ NO HISTORY CHIP (19 Sep 2026, the user's list). It opened
                `/stats?tab=history`, which the Stats chip on every hero already
                opened — the calendar looks forward, and the way back was a
                second door to one screen. ⚠ The library itself went on 29 Sep
                2026 with the second stats screen, so that door now leads
                nowhere in particular; the route is untouched (Rule 14). */}
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
                    border: `1.5px solid ${LINE}`,
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
        {/* ── CLASSES · EVENTS (the prototype's own switch above the sides, 6836).
            One axis at a time: the sides below belong to classes, and an event
            is not something you train in, teach or assist on. ── */}
        {/* ⚠ AND PRACTICE IS THE THIRD (27 Sep 2026) — a rehearsal is neither a
            class nor an event, so it is neither a fourth side nor a kind of
            event; the switch is the prototype's own answer to exactly this and
            it takes a third value the way it took a second. */}
        {canSwitch ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {([["classes", "Classes", entries.length], ["practices", "Practice", practicesInScope]] as const).map(([k, label, n]) => {
              const on = kind === k;
              const tint = k === "practices" ? PRACTICE_C : TOOL_COLOUR;
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={`${label}: ${n}`}
                  onKeyDown={pressKey(() => setKind(k))}
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "9px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    userSelect: "none",
                    background: on ? `${tint}1f` : CARD,
                    border: `1.5px solid ${on ? tint : LINE}`,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: -0.15, color: on ? tint : SUB }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: on ? tint : MUTED, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ⚠ this was `mode === "personal" && !showEvents` (29 Sep 2026). The
            sides were hidden on the EVENTS half alone — they were still drawn on
            the practices half, counting CLASSES whichever tab is open, which is
            what the counts' own comment above says they are for. With the events
            half gone the second half of the test can only ever be true, so it is
            dropped rather than re-pointed at practices, which would have been a
            silent behaviour change. */}
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
                      border: `1.5px solid ${on ? meta.tint : LINE}`,
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
              border: `1.5px solid ${LINE}`,
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
            {/* ⚠ NO `TODAY` BADGE HERE (28 Sep 2026) — it stood beside the
                button below, which already carries the word. See TODAY_INK. */}
            <span
              role="button"
              tabIndex={0}
              aria-label="Jump to today"
              onKeyDown={pressKey(() => jumpTo(todayKey))}
              onClick={() => jumpTo(todayKey)}
              style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: `1.5px solid ${LINE}`, color: SUB }}
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
                  border: `1.5px solid ${LINE}`,
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
            {/* the month's own marker — it never shares a screen with the
                schedule's divider, so this one is not a repeat, only blue */}
            {isToday(sel) ? <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: TODAY_INK }}>TODAY</span> : null}
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
                        <div style={{ flex: 1, padding: "0 0 3px", minWidth: 0, borderTop: `1.5px solid ${LINE}` }}>{ev.map(card)}</div>
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
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: TODAY_INK, textTransform: "uppercase" }}>Today</span>
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
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: isToday(dayKey) ? TODAY_INK : MUTED }}>{dowOf(dayKey)}</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        width: 30,
                        height: 30,
                        lineHeight: "30px",
                        margin: "2px auto 0",
                        borderRadius: 15,
                        color: isToday(dayKey) ? "var(--solid)" : INK,
                        background: isToday(dayKey) ? TODAY_INK : "transparent",
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

      {/* ⚠⚠ THE COMPOSE BUTTON IS GONE ALTOGETHER (29 Sep 2026), and it went in
          two halves a week apart. "Add class" left a STUDIO's calendar on
          22 Sep (the user: "class should only be created from home tab", then
          "no, from inside their respective sections, in home tab only") — a
          class begins in the CLASSES section, and this was the one door that
          made one from somewhere else. "Add event" stayed for an ORGANIZATION,
          because an event's own section WAS this calendar for one (R21), and it
          goes now with events. Nothing has passed `composeHref` since, so the
          FAB, its scrim, its open state and the prop are all deleted rather than
          left as a branch no screen renders — which is where this repo keeps
          finding its defects. */}
    </div>
  );
}
