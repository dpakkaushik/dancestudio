import type { SupabaseClient } from "@supabase/supabase-js";

/** SUBSCRIPTIONS (10 Sep 2026) — one row per subscription, the truth about it.
 *
 *  status: pending_auth (mandate not yet authorised) → active → past_due (a
 *  renewal failed; three days of grace while the provider retries) → expired.
 *  `cancelAtPeriodEnd` is "stop renewing, keep what I paid for"; `granted` is
 *  an admin's comp that renews nothing. `hasAccess` is the one question every
 *  screen actually asks, computed the way the database computes it.
 *
 *  An artist plan is a user's own; a studio's belongs to its organization and
 *  names the studio — two studios, two rows. */

export type SubscriptionKind = "artist" | "studio";
export type SubscriptionStatus = "pending_auth" | "active" | "past_due" | "canceled" | "expired";

export interface Subscription {
  id: string;
  kind: SubscriptionKind;
  userId: string;
  tenantId: string | null;
  planKey: string;
  priceInr: number;
  period: "monthly" | "yearly";
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  granted: boolean;
  providerSubscriptionId: string | null;
  cfSubscriptionId: string | null;
  providerStatus: string | null;
  nextChargeOn: string | null;
  failureReason: string | null;
  attempt: number;
  /** paid through the current period (three days of grace while past due) */
  hasAccess: boolean;
  /** will charge again on its own: active, not granted, not cancelling */
  renews: boolean;
}

interface Row {
  id: string;
  kind: SubscriptionKind;
  user_id: string;
  tenant_id: string | null;
  plan_key: string;
  price_inr: number;
  period: "monthly" | "yearly";
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  granted: boolean;
  provider_subscription_id: string | null;
  cf_subscription_id: string | null;
  provider_status: string | null;
  next_charge_on: string | null;
  failure_reason: string | null;
  attempt: number;
}

const COLUMNS =
  "id, kind, user_id, tenant_id, plan_key, price_inr, period, status, current_period_start, current_period_end, cancel_at_period_end, granted, provider_subscription_id, cf_subscription_id, provider_status, next_charge_on, failure_reason, attempt";

const todayIst = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const shiftDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const toSubscription = (r: Row): Subscription => {
  const today = todayIst();
  const grace = r.status === "past_due" ? 3 : 0;
  const hasAccess =
    ["active", "past_due", "canceled"].includes(r.status) &&
    r.current_period_end !== null &&
    shiftDays(r.current_period_end, grace) >= today;
  return {
    id: r.id,
    kind: r.kind,
    userId: r.user_id,
    tenantId: r.tenant_id,
    planKey: r.plan_key,
    priceInr: Number(r.price_inr),
    period: r.period,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    granted: Boolean(r.granted),
    providerSubscriptionId: r.provider_subscription_id,
    cfSubscriptionId: r.cf_subscription_id,
    providerStatus: r.provider_status,
    nextChargeOn: r.next_charge_on,
    failureReason: r.failure_reason,
    attempt: Number(r.attempt),
    hasAccess,
    renews: r.status === "active" && !r.granted && !r.cancel_at_period_end,
  };
};

/** Every subscription of the signed-in account, newest first. Says `user_id`
 *  out loud: RLS is a ceiling, not a scope. */
export async function findMySubscriptions(supabase: SupabaseClient): Promise<Subscription[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("subscriptions")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`subscriptions.mine failed: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(toSubscription);
}

/** The person's live artist subscription, or the most recent ended one. */
export async function findMyArtistSubscription(supabase: SupabaseClient): Promise<Subscription | null> {
  const all = await findMySubscriptions(supabase);
  const artist = all.filter((s) => s.kind === "artist");
  return artist.find((s) => s.status !== "expired") ?? artist[0] ?? null;
}

export interface StudioSubscriptionState {
  subscription: Subscription | null;
  /** null when the studio is public or may be; otherwise the database's sentence */
  whyNotPublic: string | null;
}

/** Each of the caller's studios: its live subscription and the one sentence
 *  between it and Discover. The sentence is the database's to write. */
export async function findMyStudioSubscriptions(supabase: SupabaseClient, tenantIds: string[]): Promise<Record<string, StudioSubscriptionState>> {
  const out: Record<string, StudioSubscriptionState> = {};
  if (tenantIds.length === 0) return out;
  const all = await findMySubscriptions(supabase);
  for (const id of tenantIds) {
    const mine = all.filter((s) => s.kind === "studio" && s.tenantId === id);
    out[id] = { subscription: mine.find((s) => s.status !== "expired") ?? mine[0] ?? null, whyNotPublic: null };
  }
  await Promise.all(
    tenantIds.map(async (id) => {
      const { data } = await supabase.rpc("why_not_public", { p_tenant_id: id });
      out[id].whyNotPublic = typeof data === "string" && data.length > 0 ? data : null;
    })
  );
  return out;
}

export async function subscribe(supabase: SupabaseClient, planKey: string, tenantId: string | null): Promise<Subscription> {
  const { data, error } = await supabase.rpc("subscribe", { p_plan_key: planKey, p_tenant_id: tenantId });
  if (error) {
    throw new Error(error.message);
  }
  return toSubscription(data as Row);
}

export async function attachProviderSubscription(
  supabase: SupabaseClient,
  id: string,
  providerSubscriptionId: string,
  cfSubscriptionId: string,
  providerPlanId: string,
  providerStatus: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_provider_subscription", {
    p_id: id,
    p_provider_subscription_id: providerSubscriptionId,
    p_cf_subscription_id: cfSubscriptionId,
    p_provider_plan_id: providerPlanId,
    p_provider_status: providerStatus,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function cancelMySubscription(supabase: SupabaseClient, id: string): Promise<Subscription> {
  const { data, error } = await supabase.rpc("cancel_my_subscription", { p_id: id });
  if (error) {
    throw new Error(error.message);
  }
  return toSubscription(data as Row);
}

// ── the provider's word, applied — service role only ──────────────────────

export interface SubscriptionEventInput {
  type: string;
  providerSubscriptionId: string | null;
  cfSubscriptionId: string | null;
  providerStatus: string | null;
  authStatus: string | null;
  paymentId: string | null;
  cfPaymentId: string | null;
  paymentType: string | null;
  paymentStatus: string | null;
  amountPaise: number | null;
  method: string | null;
  failureReason: string | null;
  /** YYYY-MM-DD */
  nextScheduleDate: string | null;
}

export interface SubscriptionEventOutcome {
  outcome: "subscribed" | "noted" | "duplicate" | "ignored";
  subscription_id?: string;
  kind?: SubscriptionKind;
  status?: SubscriptionStatus;
  tenant_id?: string | null;
  until?: string | null;
  reason?: string;
}

export async function applySubscriptionEvent(admin: SupabaseClient, e: SubscriptionEventInput): Promise<SubscriptionEventOutcome> {
  const { data, error } = await admin.rpc("apply_subscription_event", {
    p_type: e.type,
    p_provider_subscription_id: e.providerSubscriptionId,
    p_cf_subscription_id: e.cfSubscriptionId,
    p_provider_status: e.providerStatus,
    p_auth_status: e.authStatus,
    p_payment_id: e.paymentId,
    p_cf_payment_id: e.cfPaymentId,
    p_payment_type: e.paymentType,
    p_payment_status: e.paymentStatus,
    p_amount_paise: e.amountPaise,
    p_method: e.method,
    p_failure_reason: e.failureReason,
    p_next_schedule_date: e.nextScheduleDate,
  });
  if (error) {
    throw new Error(`apply_subscription_event failed: ${error.message}`);
  }
  return data as SubscriptionEventOutcome;
}

// ── the admin's side ──────────────────────────────────────────────────────

export interface AdminSubscription {
  id: string;
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  userId: string;
  userName: string;
  tenantId: string | null;
  tenantName: string | null;
  planKey: string;
  priceInr: number;
  period: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  granted: boolean;
  providerStatus: string | null;
  nextChargeOn: string | null;
  failureReason: string | null;
  createdAt: string;
}

export async function findAdminSubscriptions(
  supabase: SupabaseClient,
  input: { status?: SubscriptionStatus | null; limit?: number } = {}
): Promise<AdminSubscription[]> {
  const { data, error } = await supabase.rpc("admin_subscriptions", { p_status: input.status ?? null, p_limit: input.limit ?? 100 });
  if (error) {
    throw new Error(`admin.subscriptions failed: ${error.message}`);
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    kind: r.kind as SubscriptionKind,
    status: r.status as SubscriptionStatus,
    userId: r.user_id as string,
    userName: (r.user_name as string) ?? "",
    tenantId: (r.tenant_id as string) ?? null,
    tenantName: (r.tenant_name as string) ?? null,
    planKey: r.plan_key as string,
    priceInr: Number(r.price_inr ?? 0),
    period: r.period as string,
    currentPeriodEnd: (r.current_period_end as string) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    granted: Boolean(r.granted),
    providerStatus: (r.provider_status as string) ?? null,
    nextChargeOn: (r.next_charge_on as string) ?? null,
    failureReason: (r.failure_reason as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function grantSubscription(supabase: SupabaseClient, kind: SubscriptionKind, subjectId: string, months: number, note: string | null): Promise<void> {
  const { error } = await supabase.rpc("admin_grant_subscription", { p_kind: kind, p_subject_id: subjectId, p_months: months, p_note: note });
  if (error) {
    throw new Error(error.message);
  }
}

export async function endSubscription(supabase: SupabaseClient, id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_end_subscription", { p_id: id, p_reason: reason });
  if (error) {
    throw new Error(error.message);
  }
}

/** One subscription by id, as the admin sees it — for the end-and-cancel path. */
export async function findSubscriptionById(admin: SupabaseClient, id: string): Promise<Subscription | null> {
  const { data, error } = await admin.from("subscriptions").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) {
    throw new Error(`subscriptions.byId failed: ${error.message}`);
  }
  return data ? toSubscription(data as Row) : null;
}
