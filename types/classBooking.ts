import type { ClassLevel, ClassStatus } from "@/types/class";

export type ClassBookingStatus = "enrolled" | "waitlisted" | "cancelled";

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
  startsAt: string;
  endsAt: string;
  businessName: string;
  businessCity: string | null;
}

/** One roster row — the studio's view of a booking. */
export interface RosterEntry {
  id: string;
  status: ClassBookingStatus;
  enrolledAt: string;
  learnerName: string;
  learnerCity: string | null;
}
