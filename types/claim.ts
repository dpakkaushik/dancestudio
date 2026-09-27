import type { DanceClass } from "@/types/class";

/** Who is on a class. An assistant is not a bare name in a list: they are a
 *  person with a job (prototype dosTeamOne, DanceOSApp.jsx:89-90), and a class
 *  never names anybody publicly until they confirm. */
export type ClaimKind = "artist" | "assistant";
export type ClaimStatus = "asked" | "confirmed" | "rejected";

/** The confirmed teacher on a class, as a card draws them: a face and a name
 *  (18 Sep 2026). Kept minimal on purpose — a card needs who it is and what they
 *  look like, never their pay, their jobs or their city. */
export interface ClassArtist {
  name: string;
  avatarPath: string | null;
  userId: string;
}

export interface ClassClaim {
  id: string;
  classId: string;
  userId: string;
  kind: ClaimKind;
  status: ClaimStatus;
  canAttendance: boolean;
  canRefunds: boolean;
  /** What the studio pays them for one session of this class, in whole rupees.
   *  The owner's number — set on the ask, so the person confirming sees what
   *  they are agreeing to. 0 is a real answer (an owner teaching their own
   *  class is owed nothing). */
  payPerSessionInr: number;
  /** when the ask was made — the Inbox orders the desk by it */
  createdAt: string;
  /** The claimed person, for the page that prints them. */
  personName: string;
  personCity: string | null;
  /** their picture in the media bucket, or null for initials (the photos slice) */
  avatarPath: string | null;
}

/** An ask waiting for the signed-in person's answer, with enough of the class
 *  to decide (prototype: "They want you on the schedule as the artist"). */
export interface MyClaimAsk extends ClassClaim {
  classTitle: string;
  classStyle: string;
  classShareSlug: string;
  tenantName: string;
  startsAt: string | null;
  /** ENOUGH OF THE CLASS TO DRAW ITS CARD (19 Sep 2026, the user: "assisting
   *  should also show class cards in same way") */
  classLevel: string;
  classRoom: string | null;
  classPriceInr: number;
  classCapacity: number;
  classStatus: "draft" | "published" | "completed";
  sessionId: string | null;
  endsAt: string | null;
  tenantCity: string | null;
}

/** THE CLASS BEHIND AN ASK, AS A CARD DRAWS IT — written ONCE (27 Sep 2026).
 *
 *  `/my-classes` has had this conversion inline since 19 Sep, and the Inbox now
 *  needs the same one (the user: *"event and class request cards should also
 *  look like class and event cards on discover"*). A second copy is this repo's
 *  own recurring bill — `linkChip` declared twice, the figure row written out
 *  three times, three copies of the identity band — so it lives beside the type
 *  it converts.
 *
 *  ⚠ `tenantId` is "" and the poster null on purpose: an ask carries neither,
 *  and the card draws its own poster from the title. The two membership flags
 *  are the column defaults, because whose pass pays is the CLASS's answer, read
 *  on its own page, and a card must not invent one. */
export const askToTileClass = (c: MyClaimAsk): DanceClass => ({
  id: c.classId,
  tenantId: "",
  title: c.classTitle,
  shareSlug: c.classShareSlug,
  style: c.classStyle,
  level: c.classLevel as DanceClass["level"],
  room: c.classRoom,
  roomId: null,
  poster: null,
  priceInr: c.classPriceInr,
  capacity: c.classCapacity,
  status: c.classStatus,
  session: c.sessionId && c.startsAt && c.endsAt ? { id: c.sessionId, startsAt: c.startsAt, endsAt: c.endsAt } : null,
  venueBusinessId: null,
  venueStatus: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  allowsStudioMemberships: true,
  allowsArtistMemberships: false,
});
