import type { ClassArtist } from "@/types/classPerson";
import type { PracticeStanding } from "@/types/crewPractice";
import type { ClassLevel, ClassStatus } from "@/types/class";
import type { ClassBookingStatus } from "@/types/classBooking";

/** Step 14 — the calendar. Nothing new is stored: a calendar entry is a class
 *  session seen from one side. The prototype's three sides are what the person
 *  is doing on the floor — "a dancer does not attend a class, they TRAIN; a
 *  teacher does not host one, they TEACH" (DOS_SIDES, DanceOSApp.jsx:6666) —
 *  and here they come from real rows: a booking is Train, a confirmed artist
 *  classPerson is Teach, a confirmed assistant classPerson is Assist. */
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
  businessName: string;
  businessCity: string | null;
  side: CalendarSide;
  /** the viewer's own booking, when the side is Train */
  classBooking: { id: string; status: ClassBookingStatus } | null;
  /** seats taken, for the tile's "N spots left" */
  filled: number;
  /** the confirmed teacher, whose face the card's centre column wears (18 Sep
   *  2026); null on a class nobody has accepted yet, and the card falls back to
   *  the style square */
  artist: ClassArtist | null;
}

/** ⚠⚠ `CalendarEventEntry` WAS HERE AND WENT WITH EVENTS (29 Sep 2026, the
 *  user: *"Remove Organization and Events completely from the system"*). It was
 *  added on 18 Sep because the calendar had drawn classes only while Home's deck
 *  carried tickets — so the one screen whose whole job is "when is my dancing"
 *  did not know about half of it. With events gone, the half is gone, and with
 *  it the prototype's Classes/Events switch above the sides. What survives is
 *  the reason the type existed separately at all, which the practice entry below
 *  inherited: Train · Teach · Assist are CLASS ideas, and anything that is not a
 *  class needs its own shape rather than a fourth `CalendarSide`. */

/** ⚠ A CREW PRACTICE ON THE CALENDAR (27 Sep 2026, the user: *"practice also get
 *  added to calendar. crews should also have a calendar tab."*).
 *
 *  A SECOND kind beside the class, and its own shape rather than a fourth
 *  `CalendarSide`: Train · Teach · Assist are class ideas, and nobody trains at
 *  a rehearsal — what a practice asks is whether you are COMING.
 *
 *  ⚠ ONE DAY, ALWAYS — the database's own CHECK is `ends_at > starts_at` and the
 *  form asks for one date and two times, so a practice cannot span midnight by
 *  construction, and nothing here has to expand a row across days. */
export interface CalendarPracticeEntry {
  practiceId: string;
  crewId: string;
  crewName: string;
  style: string;
  startsAt: string;
  endsAt: string;
  /** "2026-09-30" in IST — the day this row belongs to */
  dayKey: string;
  /** the IST hour it starts — the day view's rail */
  hour: number;
  place: string;
  note: string | null;
  cancelled: boolean;
  /** what the reader is to it — Coming · Not answered · Not coming · You arranged it */
  standing: PracticeStanding;
  going: number;
  asked: number;
  href: string;
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
