import type { SupabaseClient } from "@supabase/supabase-js";

/** THE ORGANIZATION'S PAPERWORK (11 Sep 2026 — the user: "instead of social
 *  media use GST number… if a user doesn't have a GST he can still create a
 *  studio but can't create an event").
 *
 *  ⚠ ON THE BUSINESS ROW SINCE 26 Sep 2026. The organization LOGIN is retired —
 *  an organization is a `businesses` row of type `org` a person opens — so its
 *  GST number moved off `profiles` and onto that row (`20260926120000`), and
 *  every read and write here is keyed on the BUSINESS id, never on the caller.
 *
 *  The GSTIN is not reviewed by a person: `verify_business_gstin` checks it and
 *  stamps it in one call, which today is a FORMAT check and tomorrow is the
 *  government API behind the same signature. So there is no queue, no waiting
 *  state and no admin desk here — a number is either verified or it is not,
 *  and the refusal says which character was wrong. */

export interface GstStanding {
  gstin: string | null;
  verifiedAt: string | null;
}

/** The number and its standing, for the organization's own screen. The owner
 *  reads it through the same row every member reads (`businesses`); the
 *  columns are on the row, not behind a definer. */
export async function findBusinessGst(supabase: SupabaseClient, businessId: string): Promise<GstStanding> {
  const { data, error } = await supabase
    .from("businesses")
    .select("gstin, gstin_verified_at")
    .eq("id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    /* a screen that says "not verified" beats a 500 over a column — the same
       degradation rule the city registry learned on 11 Sep */
    return { gstin: null, verifiedAt: null };
  }
  const row = data as { gstin: string | null; gstin_verified_at: string | null } | null;
  return { gstin: row?.gstin ?? null, verifiedAt: row?.gstin_verified_at ?? null };
}

/** Verify it. Returns the moment it passed; throws the reason it did not, in
 *  the database's own words, which are written to be read by the person who
 *  typed the number. Owner-only inside the RPC. */
export async function verifyBusinessGstin(supabase: SupabaseClient, businessId: string, gstin: string): Promise<string> {
  const { data, error } = await supabase.rpc("verify_business_gstin", { p_business_id: businessId, p_gstin: gstin });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

export async function clearBusinessGstin(supabase: SupabaseClient, businessId: string): Promise<void> {
  const { error } = await supabase.rpc("clear_business_gstin", { p_business_id: businessId });
  if (error) {
    throw new Error(error.message);
  }
}

/** The one sentence between THIS ORGANIZATION BUSINESS and an event, or null.
 *  The events desk and the Create-event door both print it rather than
 *  inventing their own copy — the database words every gate in this app.
 *  ⚠ Keyed on the business since 26 Sep 2026: `why_no_event` took no argument
 *  while an organization was a login; it takes the org business id now. */
export async function findWhyNoEvent(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_event", { p_business_id: businessId });
  if (error) {
    /* an app that refuses events because it cannot ask about them would be
       worse than one that lets the insert trigger say no */
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}
