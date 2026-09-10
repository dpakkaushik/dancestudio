import type { SupabaseClient } from "@supabase/supabase-js";
import { cashfreeMode } from "@/lib/cashfree/api";
import type { PlanCatalogRow } from "@/repositories/plans";

/** Cashfree SUBSCRIPTIONS — recurring mandates, server-side only (10 Sep 2026).
 *
 *  Shapes below were read off the sandbox itself, not from memory: a plan is
 *  created with a fixed recurring amount; a subscription on a plan comes back
 *  with a `subscription_session_id` the browser hands to
 *  `cashfree.subscriptionsCheckout()`; the customer authorises a UPI AutoPay or
 *  card mandate there. The AUTHORISATION carries the first period's fee
 *  (authorization_amount = the plan price, not refunded) so access is immediate;
 *  the mandate's first scheduled charge is the START OF THE NEXT PERIOD, and
 *  Cashfree raises every renewal itself with the pre-debit notice the RBI
 *  requires. Cancelling the mandate stops future charges and nothing else.
 *
 *  A Cashfree plan's amount cannot change, so a price change is a NEW plan:
 *  `ensureCashfreePlan` makes one whenever the catalog price differs from the
 *  price the stored plan carries. Existing mandates stay on their old plan,
 *  which is exactly the grandfathering a price change should have. */

const API_VERSION = "2025-01-01";
const base = () => (cashfreeMode() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");

function headers(): Record<string, string> {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret) throw new Error("Cashfree is not configured");
  return { "x-client-id": id, "x-client-secret": secret, "x-api-version": API_VERSION, "Content-Type": "application/json" };
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { ...init, headers: { ...headers(), ...init?.headers }, cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      if (body.message) detail = `${res.status}: ${body.message}`;
    } catch {
      /* the status is the story */
    }
    throw new Error(`Cashfree ${path} failed (${detail})`);
  }
  return (await res.json()) as T;
}

/** Cashfree's id grammar: alphanumerics, _ and -. Ours are recognisably ours. */
export const providerPlanIdFor = (key: string, priceInr: number): string => `dos_plan_${key}_${priceInr}_${Date.now().toString(36)}`;
export const providerSubscriptionIdFor = (subscriptionId: string, attempt: number): string =>
  `dos_sub_${subscriptionId.replace(/-/g, "")}_${attempt}`;

export interface CashfreePlan {
  plan_id: string;
  plan_status: string;
  plan_recurring_amount: number;
  plan_interval_type: string;
  plan_intervals: number;
}

export interface CashfreeSubscription {
  cf_subscription_id: string;
  subscription_id: string;
  subscription_status: string;
  subscription_session_id?: string;
  next_schedule_date?: string | null;
  subscription_first_charge_time?: string | null;
  authorization_details?: {
    authorization_amount?: number;
    authorization_status?: string | null;
    authorization_reference?: string | null;
    payment_id?: string | null;
    payment_group?: string | null;
    payment_method?: string | null;
  } | null;
  plan_details?: { plan_id?: string; plan_recurring_amount?: number } | null;
}

/** The Cashfree plan carrying the catalog's CURRENT price — made when there is
 *  none, or when the price moved. Stored back on the catalog row through the
 *  service role, since only the server ever talks to Cashfree. */
export async function ensureCashfreePlan(
  admin: SupabaseClient,
  plan: PlanCatalogRow
): Promise<string> {
  if (plan.providerPlanId && plan.providerPlanPriceInr === plan.priceInr) {
    return plan.providerPlanId;
  }
  const planId = providerPlanIdFor(plan.key, plan.priceInr);
  await cf<CashfreePlan>("/plans", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      plan_name: plan.label.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60),
      plan_type: "PERIODIC",
      plan_currency: "INR",
      plan_recurring_amount: plan.priceInr,
      plan_max_amount: plan.priceInr,
      plan_interval_type: plan.period === "yearly" ? "YEAR" : "MONTH",
      plan_intervals: 1,
      plan_note: `DanceOS ${plan.kind} plan`,
    }),
  });
  const { error } = await admin.rpc("set_provider_plan", { p_key: plan.key, p_provider_plan_id: planId, p_price_inr: plan.priceInr });
  if (error) throw new Error(`set_provider_plan failed: ${error.message}`);
  return planId;
}

/** Create the mandate. The authorisation IS the first period's payment. */
export async function createCashfreeSubscription(params: {
  providerSubscriptionId: string;
  providerPlanId: string;
  priceInr: number;
  customer: { id: string; phone: string; name?: string | null; email?: string | null };
  returnUrl: string;
  /** the date the mandate's own charges begin — the start of the SECOND period */
  firstChargeOn: string;
  note: string;
  tags: Record<string, string>;
}): Promise<CashfreeSubscription> {
  return cf<CashfreeSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      subscription_id: params.providerSubscriptionId,
      customer_details: {
        customer_name: (params.customer.name ?? "DanceOS member").replace(/[^A-Za-z0-9 ]/g, " ").trim().slice(0, 60) || "DanceOS member",
        customer_phone: params.customer.phone,
        ...(params.customer.email ? { customer_email: params.customer.email } : {}),
      },
      plan_details: { plan_id: params.providerPlanId },
      authorization_details: {
        authorization_amount: params.priceInr,
        authorization_amount_refund: false,
        payment_methods: ["upi", "card"],
      },
      subscription_meta: { return_url: params.returnUrl, notification_channel: ["EMAIL"] },
      subscription_first_charge_time: `${params.firstChargeOn}T06:00:00+05:30`,
      subscription_expiry_time: "2050-12-31T23:59:59+05:30",
      subscription_note: params.note.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100),
      subscription_tags: params.tags,
    }),
  });
}

export async function fetchCashfreeSubscription(providerSubscriptionId: string): Promise<CashfreeSubscription> {
  return cf<CashfreeSubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`);
}

/** Stop future charges. What was paid for stands — access runs to period end on our side. */
export async function cancelCashfreeSubscription(providerSubscriptionId: string): Promise<CashfreeSubscription> {
  return cf<CashfreeSubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/manage`, {
    method: "POST",
    body: JSON.stringify({ subscription_id: providerSubscriptionId, action: "CANCEL" }),
  });
}
