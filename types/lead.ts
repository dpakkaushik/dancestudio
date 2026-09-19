/** The studio's enquiry pipeline. Stages are the prototype's own five
 *  (DanceOSApp.jsx:5664 tints, 5978 chip row). */
export type LeadStatus = "new" | "quoted" | "trial_booked" | "converted" | "lost";
export type LeadSource = "walk_in" | "enquiry" | "referral" | "social";

export interface Lead {
  id: string;
  tenantId: string;
  name: string;
  mobile: string | null;
  interest: string | null;
  source: LeadSource;
  status: LeadStatus;
  trialClassId: string | null;
  /** The class the trial was agreed for, when there is one. */
  trialClassTitle: string | null;
  trialOn: string | null;
  note: string | null;
  createdAt: string;
  /** WHO THIS ROW IS (19 Sep 2026, the user: "Students — adding same way as for
   *  Team … name and profile on clicking"). Set when the student was picked from
   *  the people search; null for a walk-in typed at the desk, who has no page to
   *  open and no record to count. */
  userId: string | null;
  /** their picture, when the row names somebody on DanceOS */
  avatarPath: string | null;
}

/** WHAT A STUDENT HAS ACTUALLY DONE HERE (19 Sep 2026, the user: "track student
 *  performance, photo stats"). Counted, never stored — the same rule Step 25's
 *  boards follow — and only for a student who IS somebody on DanceOS. `attended`
 *  is check-ins, not bookings: a seat nobody marked is not a class danced. */
export interface StudentStats {
  booked: number;
  attended: number;
}

/** The prototype's chip row, in its order and its words (5978). */
export const LEAD_STAGES: ReadonlyArray<readonly [LeadStatus, string]> = [
  ["new", "New"],
  ["quoted", "Quoted"],
  ["trial_booked", "Trial"],
  ["converted", "Won"],
  ["lost", "Lost"],
];

/** The stage tints, verbatim from the prototype's ST_COL (5664). */
export const LEAD_TINT: Record<LeadStatus, string> = {
  new: "#3B82F6",
  quoted: "#F59E0B",
  trial_booked: "#8B5CF6",
  converted: "#22C55E",
  lost: "#EF4444",
};

export const LEAD_SOURCES: ReadonlyArray<readonly [LeadSource, string]> = [
  ["walk_in", "Walk-in"],
  ["enquiry", "Enquiry"],
  ["referral", "Referral"],
  ["social", "Social"],
];
