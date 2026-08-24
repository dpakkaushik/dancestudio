/** Who is on a class. An assistant is not a bare name in a list: they are a
 *  person with a job (prototype dosTeamOne, DanceOSApp.jsx:89-90), and a class
 *  never names anybody publicly until they confirm. */
export type ClaimKind = "artist" | "assistant";
export type ClaimStatus = "asked" | "confirmed" | "rejected";

export interface ClassClaim {
  id: string;
  classId: string;
  userId: string;
  kind: ClaimKind;
  status: ClaimStatus;
  canAttendance: boolean;
  canRefunds: boolean;
  /** The claimed person, for the page that prints them. */
  personName: string;
  personCity: string | null;
}

/** An ask waiting for the signed-in person's answer, with enough of the class
 *  to decide (prototype: "They want you on the schedule as the artist"). */
export interface MyClaimAsk extends ClassClaim {
  classTitle: string;
  classStyle: string;
  classShareSlug: string;
  tenantName: string;
  startsAt: string | null;
}
