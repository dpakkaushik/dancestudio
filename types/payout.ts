/** Step 13 money. A payout is a RECORD of a settlement the studio already made,
 *  not a payment instrument — "a studio pays its faculty; DanceOS is not the
 *  thing that runs the payroll" (prototype, where S_payroll was deleted). What
 *  this data feeds is the earnings screen's own two halves: the studio's session
 *  pay ledger, and the artist's "WHO HAS PAID YOU" (S_earn dosEarnPayouts). */

export type PayoutStatus = "done" | "in_transit" | "on_hold" | "failed";
export type PayoutMethod = "bank_transfer" | "upi" | "cash" | "other";

/** The prototype paints a payout row by three states only (GREEN/GOLD/RED,
 *  S_earn 18196): done, transit, everything else. */
export const payoutTone = (status: PayoutStatus): "done" | "transit" | "held" =>
  status === "done" ? "done" : status === "in_transit" ? "transit" : "held";

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cash: "Cash",
  other: "Other",
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  done: "done",
  in_transit: "in transit",
  on_hold: "on hold",
  failed: "failed",
};

/** One ended session somebody is owed for, priced at the rate on record. */
export interface PayableSession {
  sessionId: string;
  classId: string;
  classTitle: string;
  classStyle: string;
  startsAt: string;
  rateInr: number;
}

/** What one person is owed by one studio, and what they have been paid. */
export interface PersonPayLedger {
  userId: string;
  personName: string;
  /** Their most recent job on this studio's classes. */
  kind: "artist" | "assistant";
  /** Ended, unsettled sessions — what a payout would cover. */
  unpaid: PayableSession[];
  owedInr: number;
  paidInr: number;
  paidSessions: number;
  /** True once they are off the team: still owed, but no longer accruing. */
  offTeam: boolean;
}

export interface PayoutRecord {
  id: string;
  userId: string;
  personName: string;
  amountInr: number;
  status: PayoutStatus;
  method: PayoutMethod;
  providerRef: string | null;
  paidOn: string;
  note: string | null;
  sessionCount: number;
}

/** The studio owner's side of the earnings screen. */
export interface TenantPayLedger {
  people: PersonPayLedger[];
  owedTotal: number;
  paidTotal: number;
  inTransitTotal: number;
  payouts: PayoutRecord[];
}

/** One studio's line on a teacher's own earnings screen — the prototype's
 *  "EEE Dance Studio · 14 sessions · ₹900 · ₹12,600 paid ✓". */
export interface StudioEarning {
  tenantId: string;
  tenantName: string;
  sessions: number;
  ratePerSessionInr: number | null;
  earnedInr: number;
  paidInr: number;
  dueInr: number;
}

/** The teacher's side of the same screen. */
export interface MyEarnings {
  studios: StudioEarning[];
  earnedTotal: number;
  paidTotal: number;
  dueTotal: number;
  payouts: Array<PayoutRecord & { tenantName: string }>;
}
