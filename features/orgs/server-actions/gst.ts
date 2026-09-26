"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkGstin } from "@/lib/gst/gstin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearBusinessGstin, verifyBusinessGstin } from "@/repositories/gst";

/** VERIFY AN ORGANIZATION'S GST NUMBER (11 Sep 2026; keyed on the BUSINESS since
 *  26 Sep 2026, when the organization login was retired).
 *
 *  Two checks, deliberately, and they are not redundant:
 *
 *  HERE, so the refusal is instant and specific — "this one is 12 characters",
 *  "state code 45 does not exist" — without spending a round trip on a number
 *  that could never be right.
 *
 *  AND IN THE DATABASE, because a rule the database does not know is a rule a
 *  direct PATCH walks past. `verify_business_gstin` is the only door that can
 *  move `businesses.gstin_verified_at`, and it re-checks that the caller OWNS
 *  the organization — the business id in this input is a request, never an
 *  authority.
 *
 *  The API the user asked for ("GST verification will be by API — right now
 *  bypass") goes inside the RPC, not here: the server action is the same
 *  either way. */

const verifySchema = z.object({ businessId: z.string().uuid(), gstin: z.string().min(1).max(40) });
const clearSchema = z.object({ businessId: z.string().uuid() });

const refresh = (businessId: string) => {
  revalidatePath("/organizations");
  revalidatePath(`/business/${businessId}`);
  revalidatePath(`/business/${businessId}/gst`);
  revalidatePath(`/business/${businessId}/events`);
  revalidatePath(`/org/${businessId}`);
};

export async function verifyBusinessGstinAction(input: unknown): Promise<{ error: string | null; verifiedAt: string | null }> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter the GST number.", verifiedAt: null };
  }
  /* the cheap answer first — the same module the screen uses for its hint */
  const verdict = checkGstin(parsed.data.gstin);
  if (!verdict.ok) {
    return { error: verdict.reason, verifiedAt: null };
  }

  const supabase = await createSupabaseServerClient();
  try {
    const verifiedAt = await verifyBusinessGstin(supabase, parsed.data.businessId, verdict.gstin);
    refresh(parsed.data.businessId);
    return { error: null, verifiedAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That number could not be verified", verifiedAt: null };
  }
}

export async function clearBusinessGstinAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Which organization?" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await clearBusinessGstin(supabase, parsed.data.businessId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove that number" };
  }
  refresh(parsed.data.businessId);
  return { error: null };
}
