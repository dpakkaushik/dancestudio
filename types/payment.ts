export type OrderStatus = "created" | "paid" | "refund_pending" | "refunded";
export type RefundStatus = "requested" | "pending" | "processed" | "failed";

/** The orders row as the pay flow needs it (repository maps snake_case). */
export interface PaymentOrder {
  id: string;
  tenantId: string;
  classId: string;
  sessionId: string;
  amountInr: number;
  razorpayOrderId: string | null;
  status: OrderStatus;
}

/** Everything the client needs to open Razorpay Checkout — returned by the
 *  create-order action, so no key ever ships in the bundle. */
export interface CheckoutPayload {
  orderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string;
  businessName: string;
  description: string;
  prefillName: string | null;
  prefillEmail: string | null;
}

/** The paid side of a booking — feeds the invoice sheet. */
export interface PaidReceipt {
  amountInr: number;
  method: string | null;
  razorpayPaymentId: string;
  paidAt: string;
  orderStatus: OrderStatus;
}

/** cancel_booking's money outcome, when the seat was paid for. */
export interface RefundOutcome {
  id: string;
  status: RefundStatus;
  amountInr: number;
  razorpayPaymentId: string;
}
