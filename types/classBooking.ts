import type { ClassLevel, ClassOwner, ClassStatus } from "@/types/class";

/** ⚠ NO WAITLIST (4 Oct 2026, the user: "remove waitlist mechanism"). A seat
 *  is booked or it is not; a full class refuses the press. The database stored
 *  `waitlisted` until `20261004160000` cancelled the last two such rows and
 *  narrowed the CHECK, so a read never meets the word again. `enrolled` stays
 *  the STORED value for a booked seat — the screen says "Booked". */
export type ClassBookingStatus = "enrolled" | "cancelled";

/** A learner's booking with everything the "My classes" tile needs. */
export interface MyClassBooking {
  id: string;
  status: ClassBookingStatus;
  sessionId: string;
  classId: string;
  title: string;
  /** Booking-link slug of the class — the tile links to /c/{shareSlug}. */
  shareSlug: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  priceInr: number;
  capacity: number;
  classStatus: ClassStatus;
  /** the uploaded poster the card draws (3 Oct 2026) */
  posterPath: string | null;
  startsAt: string;
  endsAt: string;
  businessName: string;
  businessCity: string | null;
  /** who made the class — drawn on the card */
  owner: ClassOwner | null;
}

/** One roster row — the studio's view of a booking. */
export interface RosterEntry {
  id: string;
  status: ClassBookingStatus;
  enrolledAt: string;
  learnerName: string;
  learnerCity: string | null;
}
