export type ClassStatus = "draft" | "published" | "completed";

/** Prototype S_classform LEVELS codes (DanceOSApp.jsx:15125). */
export type ClassLevel = "all" | "beginner" | "intermediate" | "professional";

export interface ClassSession {
  id: string;
  startsAt: string; // ISO timestamp
  endsAt: string;
}

export interface DanceClass {
  id: string;
  tenantId: string;
  title: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  priceInr: number;
  capacity: number;
  status: ClassStatus;
  /** The next (or only) dated occurrence — null only for legacy rows. */
  session: ClassSession | null;
}

/** A published class as the learner listing sees it — with the business behind it. */
export interface PublicClassListing extends DanceClass {
  tenantName: string;
  tenantArea: string | null;
  tenantCity: string | null;
}
