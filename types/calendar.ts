import type { ClassLevel, ClassStatus } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";
import type { DanceEvent } from "@/types/event";

/** Step 14 — the calendar. Nothing new is stored: a calendar entry is a class
 *  session seen from one side. The prototype's three sides are what the person
 *  is doing on the floor — "a dancer does not attend a class, they TRAIN; a
 *  teacher does not host one, they TEACH" (DOS_SIDES, DanceOSApp.jsx:6666) —
 *  and here they come from real rows: a booking is Train, a confirmed artist
 *  claim is Teach, a confirmed assistant claim is Assist. */
export type CalendarSide = "attending" | "assisting" | "hosting";

export interface CalendarEntry {
  sessionId: string;
  classId: string;
  shareSlug: string;
  title: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  priceInr: number;
  capacity: number;
  classStatus: ClassStatus;
  startsAt: string;
  endsAt: string;
  /** "2026-08-28" in IST — the day the session belongs to */
  dayKey: string;
  /** the IST hour it starts — the day view's rail */
  hour: number;
  tenantName: string;
  tenantCity: string | null;
  side: CalendarSide;
  /** the viewer's own booking, when the side is Train */
  enrollment: { id: string; status: EnrollmentStatus } | null;
  /** seats taken, for the tile's "N spots left" */
  filled: number;
}

/** ⚠ AN EVENT ON THE CALENDAR (18 Sep 2026). The calendar has drawn CLASSES
 *  ONLY since Step 14, while Home's deck has carried event tickets, entries and
 *  the events you run since Step 21 — so the one screen whose entire job is
 *  "when is my dancing" was the one screen that did not know about half of it.
 *  A person booked a ticket and it appeared on Home for one day and nowhere
 *  else; an organization, which hosts every event in the app, had a calendar
 *  that could only ever be empty.
 *
 *  Two things make this its own type rather than a fourth `CalendarSide`:
 *  an event has NO session row and can run for DAYS, so it is expanded to one
 *  entry PER DAY it covers (the calendar groups by day, and a festival is on
 *  every day of itself); and Train · Teach · Assist are class ideas — nobody
 *  assists a battle. The prototype's own answer is a Classes/Events switch
 *  above the sides, which is what the screen draws. */
export interface CalendarEventEntry {
  /** unique per DRAWN ROW — one event across three days is three rows */
  key: string;
  eventId: string;
  title: string;
  style: string;
  startsAt: string;
  endsAt: string;
  /** "2026-09-20" in IST — the day this row belongs to */
  dayKey: string;
  /** the IST hour it starts — the day view's rail */
  hour: number;
  /** what this event is to you: Running · Competing · Spectator · Draft */
  roleLabel: string;
  href: string;
  event: DanceEvent;
}

/** One month of the calendar's window, with what a Monday-first grid needs. */
export interface CalendarMonth {
  key: string;
  /** "August" */
  monthName: string;
  /** "August 2026" */
  label: string;
  days: number;
  /** Monday-first weekday index of the 1st (0 = Mon … 6 = Sun) */
  offset: number;
}
