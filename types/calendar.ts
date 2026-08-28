import type { ClassLevel, ClassStatus } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";

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
