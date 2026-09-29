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
  businessId: string;
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
  /** AN UPLOADED POSTER, in `media/posters/{business}/…` (27 Sep 2026). When it
   *  is set the card and the sleeve draw the picture; null is the ordinary case
   *  and `poster` above decides which sleeve is drawn instead. */
  posterPath?: string | null;
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
  /** WHOSE PASS PAYS FOR A SEAT HERE (19 Sep 2026): the class form's two
   *  switches, printed in the Policy block and honoured by the database when a
   *  membership is spent — the business's own passes, and the teacher's. */
  allowsStudioMemberships: boolean;
  allowsArtistMemberships: boolean;
}

/** WHERE A CLASS STANDS IN ITS OWN LIFE (30 Sep 2026).
 *
 *  ⚠⚠ `status` ALONE CANNOT ANSWER THIS, AND NOTHING EVER MOVES IT PAST
 *  `published`. `update_class_status` is called with `"published"` and with
 *  nothing else in the whole tree; no trigger and no cron writes `'completed'`
 *  (the only two cron jobs on this database are the subscription clock and the
 *  birthday clock). So for four months every class that has run has stayed
 *  `published` for ever, which cost three things at once: the register's
 *  Completed tab could never fill, `done` on the class page was never true — so
 *  the completed view, FINAL METRICS and the final register were UNREACHABLE
 *  code — and last month's classes were still being offered on Discover with a
 *  Book button `book_class_session` refuses.
 *
 *  ⚠ The answer is arithmetic, not a column: the session says when it ran, and
 *  the clock says what that means now. Derived in one place so the shelves, the
 *  register's tabs, the class page and the booking bar cannot disagree — and so
 *  that a later `run_class_clock()` cron, if one is ever wanted, only makes the
 *  stored column agree with what the app already says rather than changing it.
 *
 *  ⚠ The clock is HANDED IN, never read here: `Date.now()` may not be called in
 *  a component body under this repo's `react-hooks/purity` rule, so every caller
 *  stamps it on the server and passes it down. */
export type ClassPhase = "draft" | "upcoming" | "live" | "over";

export const classPhaseAt = (
  c: Pick<DanceClass, "status" | "session">,
  nowMs: number
): ClassPhase => {
  if (c.status === "draft") return "draft";
  /* a class somebody marked completed is over whatever the clock says */
  if (c.status === "completed") return "over";
  if (!c.session) return "upcoming";
  if (nowMs > new Date(c.session.endsAt).getTime()) return "over";
  if (nowMs >= new Date(c.session.startsAt).getTime()) return "live";
  return "upcoming";
};

/** A published class as the learner listing sees it — with the business behind it. */
export interface PublicClassListing extends DanceClass {
  businessName: string;
  /** which public page the studio row opens: /studio or /artist */
  businessType: "studio" | "artist_page";
  businessArea: string | null;
  businessCity: string | null;
  /** THE VENUE (19 Sep 2026, the user: "right Studio inside the class section"):
   *  an artist's class held in a studio's room names THAT studio under AT THE
   *  STUDIO, not the artist page that owns the class. Null when the class is at
   *  the owner's own place or the venue is not readable (an unlisted studio, to
   *  a stranger). */
  venueName: string | null;
  venueArea: string | null;
  venueCity: string | null;
}
