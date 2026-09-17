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

/** WHERE AN ARTIST'S CLASS HAPPENS (18 Sep 2026). A studio's class is in one of
 *  its own rooms. An artist's class is either in a STUDIO's room — a venue the
 *  artist asks for, and the class cannot be published until that studio says
 *  yes — or at a place of their own, a map link with their own capacity, which
 *  publishes directly. `venueStatus` is the studio's answer; null means the
 *  class has no venue request (a studio's own class, or an artist's map link). */
export type VenueStatus = "requested" | "accepted" | "declined";

export interface DanceClass {
  id: string;
  tenantId: string;
  /** What the class IS, not a name: "{style} · {level}" (the prototype's own
   *  dosClassLabel, 176-183). A class has had no typed name since 17 Sep 2026 —
   *  the form has no field for one, and every repository DERIVES this from
   *  `style` and `level` rather than reading the stored column, so an old typed
   *  title can never reach a screen. The database's `classes.title` column
   *  still exists (the slug trigger, the notification triggers and the admin
   *  desks print it) and is written with this same label on every save. */
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
  /** an artist's class held in a STUDIO's room: that studio, and its answer (18 Sep 2026) */
  venueBusinessId: string | null;
  venueStatus: VenueStatus | null;
  /** an artist's class at a place of their own — the pin and the map link */
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
}

/** A published class as the learner listing sees it — with the business behind it. */
export interface PublicClassListing extends DanceClass {
  tenantName: string;
  /** which public page the studio row opens: /studio or /artist */
  tenantType: "studio" | "artist_page";
  tenantArea: string | null;
  tenantCity: string | null;
}
