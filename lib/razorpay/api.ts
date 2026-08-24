/** Razorpay REST API, server-side only. Keys live in the environment
 *  (.env.local / Vercel): RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET. Until they are
 *  set, paid booking surfaces a clear "payments not set up yet" error and free
 *  classes keep working. Plain fetch — the bookings flow needs three endpoints,
 *  not an SDK. */

const RZP_BASE = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: string; // created | authorized | captured | refunded | failed
  amount: number; // paise
  currency: string;
  method: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number; // paise
  status: string; // pending | processed | failed
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new Error("RAZORPAY_KEY_ID is not configured");
  }
  return keyId;
}

export function getRazorpayKeySecret(): string {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured");
  }
  return keySecret;
}

function authHeader(): string {
  const token = Buffer.from(`${getRazorpayKeyId()}:${getRazorpayKeySecret()}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RZP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: { description?: string } };
      if (body.error?.description) {
        detail = `${res.status}: ${body.error.description}`;
      }
    } catch {
      // non-JSON error body — the status code is the story
    }
    throw new Error(`Razorpay ${path} failed (${detail})`);
  }
  return (await res.json()) as T;
}

/** Create the Razorpay order a checkout session pays against. */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes,
    }),
  });
}

/** Fetch a payment straight from Razorpay — the authoritative amount/method/status. */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayFetch<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

/** Full refund (no amount = everything back), normal speed. */
export async function refundRazorpayPayment(paymentId: string): Promise<RazorpayRefund> {
  return razorpayFetch<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
