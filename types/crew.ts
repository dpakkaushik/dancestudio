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
export const CREW_GRAD: [string, string] = ["#7C3AED", "#EC4899"];

export interface Crew {
  id: string;
  name: string;
  city: string;
  style: string;
  leaderId: string;
  photo: string | null;
  /** when the crew was created — the prototype's "since" */
  createdAt: string;
}

export interface CrewMember {
  id: string;
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

/** One line of the battle record: an event the crew entered (16437-16460) */
export interface CrewEntry {
  bookingId: string;
  eventId: string;
  eventTitle: string;
  eventCat: "showcase" | "battle" | "tournament";
  eventShareSlug: string;
  startDate: string;
  endDate: string;
  city: string;
  eventStatus: "draft" | "published" | "completed";
  enteredAt: string;
}

/** A duet partner's ask (the Requests desk): somebody entered an event with you */
export interface PartnerAsk {
  bookingId: string;
  status: "asked" | "confirmed" | "rejected";
  entrantName: string;
  entrantId: string | null;
  partnerName: string;
  eventTitle: string;
  eventShareSlug: string;
  startDate: string;
  createdAt: string;
}
