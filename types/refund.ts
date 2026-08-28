/** A refund request as the studio sees it (prototype S_class REQUESTS section,
 *  12236-12262). Step 9 files these; Step 13b lets somebody answer them. */

export type RefundStatus = "requested" | "pending" | "processed" | "failed" | "declined";

/** The prototype's own status tints (COL, S_class) — green settled, gold moving,
 *  red refused or broken. */
export const REFUND_TONE: Record<RefundStatus, "done" | "moving" | "bad" | "open"> = {
  processed: "done",
  pending: "moving",
  requested: "open",
  declined: "bad",
  failed: "bad",
};

export const REFUND_WORD: Record<RefundStatus, string> = {
  requested: "REQUESTED",
  pending: "PROCESSING",
  processed: "PAID",
  declined: "DECLINED",
  failed: "FAILED",
};

export interface RefundRequest {
  id: string;
  userId: string;
  learnerName: string;
  amountInr: number;
  /** The learner's own words for why (Step 9's RefundSheet reasons). */
  reason: string | null;
  status: RefundStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Settled by hand at the desk rather than through the payment rail. */
  settledOffline: boolean;
  /** The rail's refund id is attached, so the rail owns the outcome now. */
  hasRailReference: boolean;
}
