/** Cashfree Payment Gateway REST API, server-side only. Keys live in the
 *  environment (.env.local / Vercel): CASHFREE_APP_ID + CASHFREE_SECRET_KEY, and
 *  CASHFREE_ENV picks the sandbox or production host. Until they are set, paid
 *  booking surfaces a clear "payments not set up yet" error and free classes
 *  keep working. Plain fetch — the bookings flow needs three endpoints (create
 *  order, fetch an order's payments, refund), not an SDK.
 *
 *  Amounts: Cashfree speaks rupees with decimals; our ledger speaks whole
 *  rupees and the apply_* RPCs take paise. The conversions live here, once. */

const API_VERSION = "2025-01-01";

export type CashfreeMode = "sandbox" | "production";

export function cashfreeMode(): CashfreeMode {
  return process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
}

const pgBase = () => (cashfreeMode() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");

export function isCashfreeConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

export function getCashfreeSecretKey(): string {
  const key = process.env.CASHFREE_SECRET_KEY;
  if (!key) {
    throw new Error("CASHFREE_SECRET_KEY is not configured");
  }
  return key;
}

function getCashfreeAppId(): string {
  const id = process.env.CASHFREE_APP_ID;
  if (!id) {
    throw new Error("CASHFREE_APP_ID is not configured");
  }
  return id;
}

/** Cashfree's order_id grammar is alphanumeric with _ and - (3–50 chars); we
 *  send our own uuid without its hyphens under a `dos_` prefix, so a provider
 *  order id is recognisably ours and maps back to one row. */
export const providerOrderIdFor = (orderId: string): string => `dos_${orderId.replace(/-/g, "")}`;
/** The same grammar for a refund we initiate. */
export const providerRefundIdFor = (refundId: string): string => `rf_${refundId.replace(/-/g, "")}`;

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export interface CashfreeOrder {
  cf_order_id: string;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string; // ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED
  payment_session_id: string;
}

export interface CashfreePayment {
  cf_payment_id: number | string;
  order_id?: string;
  payment_status: string; // SUCCESS | NOT_ATTEMPTED | FAILED | USER_DROPPED | VOID | CANCELLED | PENDING
  payment_amount: number;
  payment_currency?: string;
  /** upi | credit_card | debit_card | net_banking | wallet | pay_later | emi … */
  payment_group: string | null;
  payment_method?: Record<string, unknown> | null;
}

export interface CashfreeRefund {
  cf_refund_id: number | string;
  refund_id: string;
  order_id?: string;
  refund_status: string; // SUCCESS | PENDING | CANCELLED | ONHOLD
  refund_amount: number;
}

async function cashfreeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${pgBase()}${path}`, {
    ...init,
    headers: {
      "x-client-id": getCashfreeAppId(),
      "x-client-secret": getCashfreeSecretKey(),
      "x-api-version": API_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      if (body.message) {
        detail = `${res.status}: ${body.message}`;
      }
    } catch {
      // non-JSON error body — the status code is the story
    }
    throw new Error(`Cashfree ${path} failed (${detail})`);
  }
  return (await res.json()) as T;
}

/** Create the Cashfree order a checkout session pays against. The amount is
 *  always the database's, never the client's (Step 9's rule kept). */
export async function createCashfreeOrder(params: {
  orderId: string;
  amountInr: number;
  customer: { id: string; phone: string; name?: string | null; email?: string | null };
  note: string;
  tags: Record<string, string>;
  returnUrl?: string;
  notifyUrl?: string;
}): Promise<CashfreeOrder> {
  return cashfreeFetch<CashfreeOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: providerOrderIdFor(params.orderId),
      order_amount: params.amountInr,
      order_currency: "INR",
      customer_details: {
        customer_id: params.customer.id.replace(/-/g, ""),
        customer_phone: params.customer.phone,
        ...(params.customer.name ? { customer_name: params.customer.name } : {}),
        ...(params.customer.email ? { customer_email: params.customer.email } : {}),
      },
      order_note: params.note.slice(0, 200),
      order_tags: params.tags,
      ...(params.returnUrl || params.notifyUrl
        ? { order_meta: { ...(params.returnUrl ? { return_url: params.returnUrl } : {}), ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}) } }
        : {}),
    }),
  });
}

/** Every payment attempt on an order, straight from Cashfree — the
 *  authoritative amount / status / method after the checkout closes. */
export async function fetchCashfreeOrderPayments(providerOrderId: string): Promise<CashfreePayment[]> {
  return cashfreeFetch<CashfreePayment[]>(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
}

/** Refund against an order: a full refund of what we recorded, standard speed.
 *  `refundId` is our refunds row id — Cashfree echoes it back and the
 *  REFUND_STATUS_WEBHOOK carries cf_refund_id, which the ledger binds. */
export async function refundCashfreePayment(params: { providerOrderId: string; refundId: string; amountInr: number; note?: string }): Promise<CashfreeRefund> {
  return cashfreeFetch<CashfreeRefund>(`/orders/${encodeURIComponent(params.providerOrderId)}/refunds`, {
    method: "POST",
    body: JSON.stringify({
      refund_id: providerRefundIdFor(params.refundId),
      refund_amount: params.amountInr,
      refund_note: (params.note ?? "DanceOS refund").slice(0, 100),
      refund_speed: "STANDARD",
    }),
  });
}
