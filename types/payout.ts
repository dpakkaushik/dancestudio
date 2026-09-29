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
export interface BusinessPayLedger {
  people: PersonPayLedger[];
  owedTotal: number;
  paidTotal: number;
  inTransitTotal: number;
  payouts: PayoutRecord[];
  /** ⚠ false when one of this read's four guards was filled (21 Sep 2026): the
   *  totals above are then SHORT, and the desk says so rather than printing a
   *  figure that looks finished — the rule the income side has followed since
   *  28 Aug and this half did not. */
  complete: boolean;
}

/** ONE PAYMENT ON THE HISTORY PAGE (29 Sep 2026, the user: "Team payment
 *  history to be a button called History which should show all transactions
 *  with that particular person on a different page").
 *
 *  A `PayoutRecord` says a payment happened and how many sessions it covered;
 *  this says WHICH — because on a page whose whole job is one person's history,
 *  "3 sessions" is the number you would then go looking for the detail of. */
export interface PayoutWithSessions extends PayoutRecord {
  sessions: Array<{ sessionId: string; classTitle: string; startsAt: string; rateInr: number }>;
}

/** Everything one business has paid one person, for that person's own page. */
export interface PersonPayHistory {
  userId: string;
  personName: string;
  payouts: PayoutWithSessions[];
  /** settled — what the studio has actually handed over */
  paidInr: number;
  /** recorded but not yet landed (in transit / on hold / failed) */
  pendingInr: number;
  /** sessions covered across every payment */
  sessionsPaid: number;
  /** ⚠ false when the read's guard was filled — the totals are then SHORT, and
   *  the page says so rather than printing a figure that looks finished (the
   *  rule both earnings halves have followed since 21 Sep 2026). */
  complete: boolean;
}

/** One studio's line on a teacher's own earnings screen — the prototype's
 *  "EEE Dance Studio · 14 sessions · ₹900 · ₹12,600 paid ✓". */
export interface StudioEarning {
  businessId: string;
  businessName: string;
  sessions: number;
  ratePerSessionInr: number | null;
  earnedInr: number;
  /** what this studio has settled AGAINST SESSIONS — a payout carrying lines */
  paidInr: number;
  dueInr: number;
  /** ⚠ WHAT IT PAID THAT WAS NOT FOR SESSIONS (20 Sep 2026) — `record_team_payment`
   *  writes a payout with an amount the owner states and NO session lines, which
   *  is the only kind a front-desk seat ever gets (19 Sep, R35). It used to be
   *  summed into `paidInr` with everything else, so a ₹2,500 salary silently
   *  cancelled ₹2,500 of teaching money the studio still owed — and if the person
   *  taught nothing there, the studio had no row at all and the payment vanished
   *  from the Settled tile while still showing in WHO HAS PAID YOU. Its own
   *  figure now, netted against nothing. */
  otherPaidInr: number;
}

/** The teacher's side of the same screen. */
export interface MyEarnings {
  studios: StudioEarning[];
  earnedTotal: number;
  paidTotal: number;
  dueTotal: number;
  payouts: Array<PayoutRecord & { businessName: string }>;
}
