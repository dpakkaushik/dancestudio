export type OrderStatus = "created" | "paid" | "refund_pending" | "refunded";
export type RefundStatus = "requested" | "pending" | "processed" | "failed";
/** Which rail wrote the row. Razorpay rows exist only from the first cut of
 *  Step 9 (test ids); everything since the 28 Aug 2026 swap is Cashfree. */
export type PaymentProvider = "razorpay" | "cashfree";

/** The orders row as the pay flow needs it (repository maps snake_case). An
 *  order names a class session OR a membership, so each pair is null on the
 *  other kind.
 *
 *  ⚠ `eventId` / `eventBookingId` were a THIRD subject (17 Sep 2026) and went
 *  with events on 29 Sep. **The columns and the CHECK behind them stay**, and so
 *  do the 4 paid event orders on production — an order is a money record, and
 *  money records are not rewritten because a feature was removed. What changed
 *  is that nothing in the app reads or writes them any more. */
export interface PaymentOrder {
  id: string;
  businessId: string;
  classId: string | null;
  sessionId: string | null;
  /** the other subject an order may name (19 Sep 2026): a membership, and the
   *  pass the money turns from `pending_payment` into one somebody holds */
  membershipId: string | null;
  membershipPassId: string | null;
  amountInr: number;
  provider: PaymentProvider;
  providerOrderId: string | null;
  status: OrderStatus;
}

/** Everything the client needs to open Cashfree Checkout — returned by the
 *  create-order action, so no key ever ships in the bundle. The amount is
 *  display-only here: the rail was told the amount by the server. */
export interface CheckoutPayload {
  orderId: string;
  providerOrderId: string;
  paymentSessionId: string;
  mode: "sandbox" | "production";
  amountInr: number;
  businessName: string;
  description: string;
}

/** The paid side of a booking — feeds the invoice sheet. */
export interface PaidReceipt {
  amountInr: number;
  method: string | null;
  providerPaymentId: string;
  paidAt: string;
  orderStatus: OrderStatus;
}

/** What one class took and what is going back out — the figures behind the
 *  prototype's WHAT THIS SESSION MADE card (S_class 12008-12042).
 *
 *  `collectedInr` is GROSS: a payment that was later refunded still came in, and
 *  the refund is its own line under it, exactly as the prototype prints them. */
export interface ClassMoney {
  collectedInr: number;
  /** Refunds actually settled — the prototype's "Paid" rows. */
  refundedInr: number;
  /** Asked for and not settled — its "Requested" + "Processing" rows.
   *  Declined and failed refunds are in neither total, as there too. */
  owedInr: number;
  /** ⚠⚠ SEATS PAID FOR WITH A MEMBERSHIP PASS (29 Sep 2026, backlog #0a2).
   *
   *  Without this the tab did not add up and said nothing about why: a pass
   *  costs the holder nothing AT THE DOOR — the money came in when the pass was
   *  bought, on a different day and against a different class — so such a seat
   *  counts under "Seats taken" and contributes NOTHING to "Came in". A studio
   *  selling passes read ten seats at ₹300 and "Came in ₹1,500" with no line
   *  between the two, which reads as four unpaid seats rather than four spent
   *  passes. The figures were always right; the screen simply would not explain
   *  itself, which on a money screen is its own defect. */
  passSeats: number;
}

/** cancel_class_booking_with_reason's money outcome, when the seat was paid for. */
export interface RefundOutcome {
  id: string;
  status: RefundStatus;
  amountInr: number;
  provider: PaymentProvider;
  /** the rail's ids — a refund is filed against the ORDER on Cashfree */
  providerOrderId: string | null;
  providerPaymentId: string;
}
