import type { SupabaseClient } from "@supabase/supabase-js";

/** THE PRICE LIST (10 Sep 2026): what a plan costs is a ROW, not a constant.
 *
 *  `plan_catalog` holds the two prices the user set — ₹700 a month for the
 *  Artist plan, ₹1,200 a month per studio — and an admin changes them on
 *  /admin/plans. Every screen that prints a price reads it from here, and a new
 *  subscription is priced from the same row and keeps that price for its life:
 *  a change applies to the next subscriber, never to somebody already paying.
 *
 *  `providerPlanId` is the Cashfree plan carrying the CURRENT price. A Cashfree
 *  plan's amount is fixed, so a price change makes a new one the next time
 *  somebody subscribes, and existing mandates stay on theirs. */

export type PlanKind = "artist" | "studio";
export type PlanPeriod = "monthly" | "yearly";
export type ArtistPlanKind = PlanPeriod;

export interface PlanCatalogRow {
  key: string;
  kind: PlanKind;
  period: PlanPeriod;
  label: string;
  priceInr: number;
  active: boolean;
  sort: number;
  providerPlanId: string | null;
  providerPlanPriceInr: number | null;
}

/** "₹1,200/mo" — the one way a price is printed */
export const priceWords = (inr: number, period: PlanPeriod): string =>
  `₹${inr.toLocaleString("en-IN")}/${period === "monthly" ? "mo" : "yr"}`;

interface CatalogRow {
  key: string;
  kind: PlanKind;
  period: PlanPeriod;
  label: string;
  price_inr: number;
  active: boolean;
  sort: number;
  provider_plan_id?: string | null;
  provider_plan_price_inr?: number | null;
}

const COLUMNS = "key, kind, period, label, price_inr, active, sort, provider_plan_id, provider_plan_price_inr";

const toCatalog = (r: CatalogRow): PlanCatalogRow => ({
  key: r.key,
  kind: r.kind,
  period: r.period,
  label: r.label,
  priceInr: Number(r.price_inr),
  active: Boolean(r.active),
  sort: Number(r.sort),
  providerPlanId: r.provider_plan_id ?? null,
  providerPlanPriceInr: r.provider_plan_price_inr == null ? null : Number(r.provider_plan_price_inr),
});

/** The plans on offer, for a signed-in reader. RLS shows the live rows. */
export async function findPlanCatalog(supabase: SupabaseClient): Promise<PlanCatalogRow[]> {
  const { data, error } = await supabase
    .from("plan_catalog")
    .select(COLUMNS)
    .is("deleted_at", null)
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error) {
    throw new Error(`plans.catalog failed: ${error.message}`);
  }
  return ((data ?? []) as CatalogRow[]).map(toCatalog);
}

/** The one active plan of a kind and period, or null when none is on offer. */
export const pickPlan = (catalog: PlanCatalogRow[], kind: PlanKind, period: PlanPeriod = "monthly"): PlanCatalogRow | null =>
  catalog.find((p) => p.kind === kind && p.period === period && p.active) ?? null;

export interface ArtistPlan {
  plan: ArtistPlanKind;
  startedOn: string;
  until: string;
  amountInr: number;
  active: boolean;
}

/** The person's artist plan as every badge reads it — `my_artist_plan` now
 *  reads the subscriptions table, so this is the same fact as
 *  `findMyArtistSubscription` in fewer fields. */
export async function findMyArtistPlan(supabase: SupabaseClient): Promise<ArtistPlan | null> {
  const { data, error } = await supabase.rpc("my_artist_plan");
  if (error) {
    throw new Error(`plans.mine failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan: ArtistPlanKind; started_on: string; until: string; amount_inr: number; active: boolean } | undefined;
  return row ? { plan: row.plan, startedOn: row.started_on, until: row.until, amountInr: Number(row.amount_inr), active: Boolean(row.active) } : null;
}

/** The FREE path only: the RPC grants a period when the catalog price is zero
 *  and refuses, naming the price, when it is not. A priced plan is a mandate
 *  through `startSubscriptionAction`. */
export async function activateArtistPlan(supabase: SupabaseClient, plan: ArtistPlanKind): Promise<{ plan: ArtistPlanKind; until: string }> {
  const { data, error } = await supabase.rpc("activate_artist_plan", { p_plan: plan });
  if (error) {
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan: ArtistPlanKind; until: string };
  return { plan: row.plan, until: row.until };
}

// ── the admin's side ──────────────────────────────────────────────────────

/** Every plan, inactive ones too, with the provider plan it maps to. Also what
 *  the server reads (through the service role) when it needs a Cashfree plan. */
export async function findAdminPlanCatalog(supabase: SupabaseClient): Promise<PlanCatalogRow[]> {
  const { data, error } = await supabase.rpc("admin_plan_catalog");
  if (error) {
    throw new Error(`admin.plans failed: ${error.message}`);
  }
  return ((data ?? []) as CatalogRow[]).map(toCatalog);
}

export async function setPlanPrice(supabase: SupabaseClient, key: string, priceInr: number, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_set_plan_price", { p_key: key, p_price_inr: priceInr, p_active: active });
  if (error) {
    throw new Error(error.message);
  }
}
