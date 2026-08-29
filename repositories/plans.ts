import type { SupabaseClient } from "@supabase/supabase-js";

/** DanceOS Pro · Artist (prototype S_subscr 16935-16990): the plan is a RECORD
 *  with a period. `my_artist_plan` is SECURITY INVOKER over the person's own
 *  rows; the two writes are definer RPCs scoped to auth.uid(). The pilot grants
 *  the period at ₹0 and says so — the charge becomes a Cashfree order when the
 *  account is live. */

export type ArtistPlanKind = "monthly" | "yearly";

export interface ArtistPlan {
  plan: ArtistPlanKind;
  startedOn: string;
  until: string;
  amountInr: number;
  active: boolean;
}

/** the list prices the prototype prints (16960, 16975) */
export const PLAN_PRICE: Record<ArtistPlanKind, { inr: number; words: string }> = {
  monthly: { inr: 799, words: "₹799/mo" },
  yearly: { inr: 7999, words: "₹7,999/yr" },
};

export async function findMyArtistPlan(supabase: SupabaseClient): Promise<ArtistPlan | null> {
  const { data, error } = await supabase.rpc("my_artist_plan");
  if (error) {
    throw new Error(`plans.mine failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan: ArtistPlanKind; started_on: string; until: string; amount_inr: number; active: boolean } | undefined;
  return row ? { plan: row.plan, startedOn: row.started_on, until: row.until, amountInr: Number(row.amount_inr), active: Boolean(row.active) } : null;
}

/** start or extend — +1 month / +1 year from today or the current end, whichever is later */
export async function activateArtistPlan(supabase: SupabaseClient, plan: ArtistPlanKind): Promise<{ plan: ArtistPlanKind; until: string }> {
  const { data, error } = await supabase.rpc("activate_artist_plan", { p_plan: plan });
  if (error) {
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan: ArtistPlanKind; until: string };
  return { plan: row.plan, until: row.until };
}

/** "End subscription now — tools lock, your profile stays" */
export async function endArtistPlan(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("end_artist_plan");
  if (error) {
    throw new Error(error.message);
  }
}
