/** Step 22 — crews. Lifted from the prototype's crew record (CREWS 661-708):
 *  a name, a city, a style, a leader and a roster; the battle record is the
 *  events the crew entered (event_bookings carrying crew_id). Two relationships
 *  (S_bizhub 2596): the crews you LEAD have a desk, the crews you are IN have a
 *  page. */

export type CrewRole = "leader" | "member" | "trainee";
export type CrewMemberStatus = "asked" | "confirmed" | "rejected";

/** RC (16326): the role colours on the desk */
export const CREW_ROLE_TINT: Record<CrewRole, string> = { leader: "#F59E0B", member: "#3B82F6", trainee: "#8B5CF6" };
export const CREW_ROLE_WORD: Record<CrewRole, string> = { leader: "Leader", member: "Member", trainee: "Trainee" };
/** the crews accent (DOS_TINT.crew 2707) and the desk's paint (16333) */
export const CREW_TINT = "#DC2626";
/** ⚠ RED, BECAUSE A CREW IS RED (20 Sep 2026, the user: "Profile Type Colors …
 *  Crew: Red"). This was violet→pink — the ARTIST's tint — so a crew's hero and
 *  a crew's own accent (`CREW_TINT`, red, right there above it) disagreed on
 *  every screen a crew has. It is `PROFILE_RING.crew`'s pair, written here so
 *  `types/crew.ts` keeps no import of a component file. */
export const CREW_GRAD: [string, string] = ["#FCA5A5", "#B91C1C"];

export interface Crew {
  id: string;
  name: string;
  city: string;
  /** the FIRST of `styles` — kept equal by a trigger, for the card, the board and the search */
  style: string;
  /** what it dances, in the leader's order (26 Sep 2026, `crews.styles`) */
  styles: string[];
  /** its links, the same list a person's and a business's carry (26 Sep 2026, `crews.socials`) */
  socials: Array<{ platform: string; url: string }>;
  leaderId: string;
  photo: string | null;
  /** the Mail button's address on the crew's page (19 Sep 2026) — the leader's to publish */
  contactEmail: string | null;
  /** CALL IS A TOGGLE (push 2): the number lives on `crew_contacts`, whose policy
   *  IS the switch — a reader who may not see it gets null here and false below */
  phone: string | null;
  phonePublic: boolean;
  /** when the crew was created — the prototype's "since" */
  createdAt: string;
  /** the crew's own account number, printed beside its type (20 Sep 2026) */
  memberNo?: number | null;
}

export interface CrewMember {
  id: string;
  /** ⚠ an ask WITHDRAWN before it was answered (2 Oct 2026) — soft-deleted, read
   *  back only by the Inbox so its Completed can say so */
  withdrawn?: boolean;
  /** the member's own photo, so a roster shows faces (parity slice 2) */
  avatarPath?: string | null;
  crewId: string;
  userId: string;
  role: CrewRole;
  status: CrewMemberStatus;
  sort: number;
  createdAt: string;
  name: string;
  city: string | null;
}

/** A crew with its confirmed roster size — the hub rows and the Discover cards */
export interface CrewSummary extends Crew {
  members: number;
}

/** An ask waiting for the signed-in person (the Requests desk's RECEIVED side) */
export interface MyCrewAsk extends CrewMember {
  crewName: string;
  crewCity: string;
  leaderName: string;
}

/** ⚠⚠ `CrewEntry` AND `PartnerAsk` WENT WITH EVENTS (29 Sep 2026, the user:
 *  *"Remove Organization and Events completely from the system"*).
 *
 *  `CrewEntry` was one line of the BATTLE RECORD (16437-16460) — the events a
 *  crew had entered, read off `event_bookings.crew_id`, drawn on the crew's own
 *  desk and on its public page. `PartnerAsk` was the duet half: somebody entered
 *  an event with you and you were asked to confirm, which the Inbox drew as the
 *  app's own event card.
 *
 *  ⚠ Both were the only things `event_bookings` carried that were about a CREW
 *  rather than about an event, so both had to go with it — what a crew is loses
 *  nothing else: it still has a roster answered by consent, a leader, practices,
 *  a public page and a board row. What it loses is a RECORD of what it competed
 *  in, and there is nothing left in the app that could hold one. */
