"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cashfreeMode, isCashfreeConfigured, rupeesToPaise } from "@/lib/cashfree/api";
import {
  cancelCashfreeSubscription,
  createCashfreeSubscription,
  ensureCashfreePlan,
  fetchCashfreeSubscription,
  providerSubscriptionIdFor,
} from "@/lib/cashfree/subscriptions";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import {
  applySubscriptionEvent,
  attachProviderSubscription,
  cancelMySubscription,
  findMySubscriptions,
  subscribe,
} from "@/repositories/subscriptions";

/** THE SUBSCRIPTION FLOW (10 Sep 2026) ⚠ Rule 9: money.
 *
 *  start   — our row first (`subscribe`, at the catalog's price), then the
 *            Cashfree subscription against it, then the session id the browser
 *            opens. The AUTHORISATION carries the first period's fee, so the
 *            plan is live the moment the mandate is; the mandate's own charges
 *            begin at the start of the next period.
 *  confirm — after the window closes the SERVER asks Cashfree what happened on
 *            our subscription and applies it through the one idempotent
 *            function the webhook also calls. The browser's word is never used.
 *  cancel  — stop renewing. Access runs to the end of the period paid for; the
 *            mandate is cancelled at Cashfree so nothing is charged again. */

const NOT_CONFIGURED = "Payments aren't switched on for this deployment yet.";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/business");
  revalidatePath("/subscription");
  revalidatePath("/profile");
  revalidatePath("/discover");
};

/** Cashfree wants a phone on every customer; an email account has none until
 *  profiles carry a mobile, so the sandbox gets a placeholder it accepts. The
 *  receipt is keyed on OUR user id, never on this. */
const customerPhoneOf = (authPhone: string | null | undefined): string => {
  const digits = (authPhone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "9999999999";
};

const addMonths = (iso: string, months: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const todayIst = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Where Cashfree sends the customer back after the mandate window. The same
 *  rule the emailed auth links follow: NEXT_PUBLIC_SITE_URL pins the canonical
 *  origin, the request's origin header is the local-dev fallback. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured || (await headers()).get("origin") || "http://localhost:3000";
}

const startSchema = z.object({
  planKey: z.string().regex(/^[a-z_]{3,40}$/),
  tenantId: z.string().uuid().nullable().optional(),
});

export interface StartSubscriptionResult {
  checkout: { subscriptionId: string; subsSessionId: string; mode: "sandbox" | "production"; priceInr: number; label: string } | null;
  error: string | null;
}

export async function startSubscriptionAction(input: unknown): Promise<StartSubscriptionResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { checkout: null, error: "Invalid subscription request" };
  }
  const { supabase, user } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { checkout: null, error: NOT_CONFIGURED };
  }
  try {
    const row = await subscribe(supabase, parsed.data.planKey, parsed.data.tenantId ?? null);
    /* The plan is read with the CALLER's own client: `plan_catalog` is
       signed-in readable by policy, while `admin_plan_catalog()` is gated on
       `is_platform_admin()` and answers a service-role connection with nothing
       at all — which is what made this button say "That plan is not on offer"
       to every customer who pressed it (found 10 Sep 2026 by driving the real
       flow). It is still the DATABASE's price and never the browser's, which is
       the rule that matters; `subscribe` above has already snapshotted it onto
       the row. */
    const catalog = await findPlanCatalog(supabase);
    const plan = catalog.find((p) => p.key === row.planKey);
    if (!plan) {
      return { checkout: null, error: "That plan is not on offer" };
    }
    /* the service role is for one thing here: writing the Cashfree plan id back */
    const admin = createSupabaseAdminClient();
    const providerPlanId = await ensureCashfreePlan(admin, plan);
    const profile = await findProfileById(supabase, user.id);
    const providerSubscriptionId = providerSubscriptionIdFor(row.id, row.attempt);
    const returnUrl = `${await siteOrigin()}${row.kind === "studio" ? "/business" : "/subscription"}`;
    const cfSub = await createCashfreeSubscription({
      providerSubscriptionId,
      providerPlanId,
      priceInr: row.priceInr,
      customer: { id: user.id, phone: customerPhoneOf(user.phone), name: profile?.fullName ?? null, email: user.email ?? null },
      returnUrl,
      firstChargeOn: addMonths(todayIst(), row.period === "yearly" ? 12 : 1),
      note: `DanceOS ${plan.label}`,
      tags: { subscription_id: row.id, kind: row.kind, ...(row.tenantId ? { tenant_id: row.tenantId } : {}) },
    });
    if (!cfSub.subscription_session_id) {
      return { checkout: null, error: "Cashfree did not return a checkout session" };
    }
    await attachProviderSubscription(supabase, row.id, providerSubscriptionId, cfSub.cf_subscription_id, providerPlanId, cfSub.subscription_status);
    return {
      checkout: { subscriptionId: row.id, subsSessionId: cfSub.subscription_session_id, mode: cashfreeMode(), priceInr: row.priceInr, label: plan.label },
      error: null,
    };
  } catch (error: unknown) {
    return { checkout: null, error: error instanceof Error ? error.message : "Could not start the subscription" };
  }
}

const idSchema = z.object({ subscriptionId: z.string().uuid() });

export interface ConfirmSubscriptionResult {
  outcome: "subscribed" | "pending" | "failed" | null;
  until: string | null;
  error: string | null;
}

/** After the mandate window closes: what does Cashfree say about OUR subscription? */
export async function confirmSubscriptionAction(input: unknown): Promise<ConfirmSubscriptionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { outcome: null, until: null, error: "Invalid request" };
  }
  const { supabase } = await requireUser();
  if (!isCashfreeConfigured()) {
    return { outcome: null, until: null, error: NOT_CONFIGURED };
  }
  try {
    const mine = await findMySubscriptions(supabase);
    const row = mine.find((s) => s.id === parsed.data.subscriptionId);
    if (!row?.providerSubscriptionId) {
      return { outcome: null, until: null, error: "That subscription could not be found" };
    }
    if (row.hasAccess) {
      return { outcome: "subscribed", until: row.currentPeriodEnd, error: null };
    }
    const cfSub = await fetchCashfreeSubscription(row.providerSubscriptionId);
    const auth = cfSub.authorization_details ?? null;
    const authorised = auth?.authorization_status === "ACTIVE" || cfSub.subscription_status === "ACTIVE";
    if (!authorised) {
      if (auth?.authorization_status === "FAILED") {
        return { outcome: "failed", until: null, error: "The authorisation did not go through — nothing was charged. Try again." };
      }
      return { outcome: "pending", until: null, error: null };
    }
    const admin = createSupabaseAdminClient();
    const applied = await applySubscriptionEvent(admin, {
      type: "SUBSCRIPTION_AUTH_STATUS",
      providerSubscriptionId: row.providerSubscriptionId,
      cfSubscriptionId: cfSub.cf_subscription_id ?? row.cfSubscriptionId,
      providerStatus: cfSub.subscription_status ?? null,
      authStatus: "ACTIVE",
      paymentId: auth?.payment_id ?? null,
      cfPaymentId: null,
      paymentType: "AUTH",
      paymentStatus: "SUCCESS",
      amountPaise: rupeesToPaise(auth?.authorization_amount ?? row.priceInr),
      method: auth?.payment_group ?? auth?.payment_method ?? null,
      failureReason: null,
      nextScheduleDate: cfSub.next_schedule_date ? cfSub.next_schedule_date.slice(0, 10) : null,
    });
    refresh();
    if (applied.outcome === "subscribed" || applied.outcome === "duplicate") {
      return { outcome: "subscribed", until: applied.until ?? null, error: null };
    }
    return { outcome: "pending", until: null, error: null };
  } catch (error: unknown) {
    return { outcome: null, until: null, error: error instanceof Error ? error.message : "Could not confirm the subscription" };
  }
}

export async function cancelSubscriptionAction(input: unknown): Promise<{ error: string | null; until: string | null }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request", until: null };
  }
  const { supabase } = await requireUser();
  try {
    const row = await cancelMySubscription(supabase, parsed.data.subscriptionId);
    if (row.providerSubscriptionId && !row.granted && isCashfreeConfigured()) {
      try {
        await cancelCashfreeSubscription(row.providerSubscriptionId);
      } catch {
        /* our row already says it will not renew; the nightly clock ends it on
           the date, and the provider's next status webhook reconciles */
      }
    }
    refresh();
    return { error: null, until: row.currentPeriodEnd };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not cancel", until: null };
  }
}
