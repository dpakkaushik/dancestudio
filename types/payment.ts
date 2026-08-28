export type OrderStatus = "created" | "paid" | "refund_pending" | "refunded";
export type RefundStatus = "requested" | "pending" | "processed" | "failed";
/** Which rail wrote the row. Razorpay rows exist only from the first cut of
 *  Step 9 (test ids); everything since the 28 Aug 2026 swap is Cashfree. */
export type PaymentProvider = "razorpay" | "cashfree";

/** The orders row as the pay flow needs it (repository maps snake_case). */
export interface PaymentOrder {
  id: string;
  tenantId: string;
  classId: string;
  sessionId: string;
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
}

/** cancel_booking's money outcome, when the seat was paid for. */
export interface RefundOutcome {
  id: string;
  status: RefundStatus;
  amountInr: number;
  provider: PaymentProvider;
  /** the rail's ids — a refund is filed against the ORDER on Cashfree */
  providerOrderId: string | null;
  providerPaymentId: string;
}
