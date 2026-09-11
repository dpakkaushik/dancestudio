import type { SupabaseClient } from "@supabase/supabase-js";

/** THE ORGANIZATION'S PAPERWORK (11 Sep 2026 — the user: "instead of social
 *  media use GST number… if a user doesn't have a GST he can still create a
 *  studio but can't create an event").
 *
 *  The GSTIN is not reviewed by a person: `verify_gstin` checks it and stamps
 *  it in one call, which today is a FORMAT check and tomorrow is the
 *  government API behind the same signature. So there is no queue, no waiting
 *  state and no admin desk here — a number is either verified or it is not,
 *  and the refusal says which character was wrong. */

export interface GstStanding {
  gstin: string | null;
  verifiedAt: string | null;
}

/** The number and its standing, for the organization's own screen. */
export async function findMyGst(supabase: SupabaseClient, userId: string): Promise<GstStanding> {
  const { data, error } = await supabase
    .from("profiles")
    .select("gstin, gstin_verified_at")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    /* the column arrives with migration 20260914090000; before it lands the
       screen shows "not verified" rather than a 500 — the same degradation
       rule the city registry learned this morning */
    return { gstin: null, verifiedAt: null };
  }
  const row = data as { gstin: string | null; gstin_verified_at: string | null } | null;
  return { gstin: row?.gstin ?? null, verifiedAt: row?.gstin_verified_at ?? null };
}

/** Verify it. Returns the moment it passed; throws the reason it did not, in
 *  the database's own words, which are written to be read by the person who
 *  typed the number. */
export async function verifyGstin(supabase: SupabaseClient, gstin: string): Promise<string> {
  const { data, error } = await supabase.rpc("verify_gstin", { p_gstin: gstin });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

export async function clearGstin(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("clear_gstin");
  if (error) {
    throw new Error(error.message);
  }
}

/** The one sentence between this organization and an event, or null. The
 *  events desk and the Create-event door both print it rather than inventing
 *  their own copy — the database words every gate in this app. */
export async function findWhyNoEvent(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_event");
  if (error) {
    /* before the migration lands there is no gate, and an app that refuses
       events because it cannot ask about them would be worse than one that
       allows them for an afternoon */
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}
