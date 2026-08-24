export type ClassStatus = "draft" | "published" | "completed";

/** Prototype S_classform LEVELS codes (DanceOSApp.jsx:15125). */
export type ClassLevel = "all" | "beginner" | "intermediate" | "professional";

export interface ClassSession {
  id: string;
  startsAt: string; // ISO timestamp
  endsAt: string;
}

/** A drawn poster design (prototype DOS_POSTERS), "none" for deliberately no
 *  poster, or null for "not chosen" — which the UI answers with dosPosterAuto. */
export type PosterChoice = "bold" | "split" | "quiet" | "none";

export interface DanceClass {
  id: string;
  tenantId: string;
  title: string;
  /** Stable public booking-link slug — the class detail page lives at /c/{shareSlug}. */
  shareSlug: string;
  style: string;
  level: ClassLevel;
  /** The room's name, denormalised and kept in step with roomId by a trigger. */
  room: string | null;
  /** The studio room this class runs in — its capacity caps the class. */
  roomId: string | null;
  poster: PosterChoice | null;
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
