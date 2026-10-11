/** A CREW'S PRACTICE (27 Sep 2026, the user: *"crew should also get an option on
 *  home tab called Practice — which allows crew leader to create practice which
 *  sends invite to members and leader can mange attendace like how its done class
 *  for the same. practice also get added to calendar. crews should also have a
 *  calendar tab."*).
 *
 *  ⚠ A PRACTICE IS NOT A CLASS, which is why it has its own tables and its own
 *  type rather than riding `classes` — a class is SOLD (a price, a room the
 *  database defends, an artist paid per session, seats, a refund window, a
 *  Cashfree order) and a practice is a crew's own people in a room they arranged
 *  themselves. `20260927140000_a_crew_practises.sql` has the whole reasoning.
 *
 *  ⚠ A PRACTICE IS A NOTICE, NOT A QUESTION (11 Oct 2026, the user: *"no request
 *  required for practice only notification should do. team leader can just check
 *  their attendance directly in register."*). Creating one TELLS every confirmed
 *  member; nobody answers, and the leader's register is the whole of attendance
 *  (`20261018090000_a_practice_is_a_notice.sql`). */

export type PracticeStatus = "scheduled" | "cancelled";

/** What the person reading it is to this practice: the leader who arranged it,
 *  or a member of the crew it is for. */
export type PracticeStanding = "leader" | "member";

export interface CrewPractice {
  id: string;
  crewId: string;
  crewName: string;
  crewStyle: string;
  startsAt: string;
  endsAt: string;
  /** where, in the crew's own words — a practice is held wherever the crew found
   *  a floor, so this is free text and never a `rooms` reference */
  place: string;
  note: string | null;
  status: PracticeStatus;
  /** whether the reader leads the crew this belongs to — the register and the
   *  arrange/cancel controls are theirs */
  iLead: boolean;
  myStatus: PracticeStanding;
  /** how many the leader has checked in, and how many the practice is for (the
   *  leader and every confirmed member) */
  going: number;
  asked: number;
  /** the crew's picture (`crews.photo`), read beside the RPC — null draws initials */
  crewPhotoPath: string | null;
}

/** One row of the register: who is on it and whether they came. */
export interface PracticePerson {
  userId: string;
  fullName: string;
  avatarPath: string | null;
  status: PracticeStanding;
  isLeader: boolean;
  present: boolean;
}

/** The words each standing reads as on a row — one map, so the desk and the
 *  calendar cannot come to call the same fact two things. */
export const PRACTICE_WORD: Record<PracticeStanding, string> = {
  leader: "You arranged it",
  member: "Your crew",
};

/** and their colours, on the same principle */
export const PRACTICE_TINT: Record<PracticeStanding, string> = {
  leader: "#15803D",
  member: "#4338CA",
};

/** "Tue 30 Sep, 7:00pm" in IST — the one grammar for a practice's when, used by
 *  the desk and the calendar row alike. ⚠ IST explicitly: every other time in
 *  this app is stamped the same way, and a rehearsal that reads an hour out is
 *  worse than one that reads nothing. */
export const practiceWhen = (iso: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

/** just the clock part, for a row that already says which day it is */
export const practiceClock = (iso: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
