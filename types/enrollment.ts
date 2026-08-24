import type { ClassLevel, ClassStatus } from "@/types/class";

export type EnrollmentStatus = "enrolled" | "waitlisted" | "cancelled";

/** A learner's booking with everything the "My classes" tile needs. */
export interface MyEnrollment {
  id: string;
  status: EnrollmentStatus;
  sessionId: string;
  classId: string;
  title: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  priceInr: number;
  capacity: number;
  classStatus: ClassStatus;
  startsAt: string;
  endsAt: string;
  tenantName: string;
  tenantCity: string | null;
}

/** One roster row — the studio's view of a booking. */
export interface RosterEntry {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  learnerName: string;
  learnerCity: string | null;
}
