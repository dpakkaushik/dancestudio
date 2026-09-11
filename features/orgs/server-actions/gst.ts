"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkGstin } from "@/lib/gst/gstin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearGstin, verifyGstin } from "@/repositories/gst";

/** VERIFY MY GST NUMBER (11 Sep 2026).
 *
 *  Two checks, deliberately, and they are not redundant:
 *
 *  HERE, so the refusal is instant and specific — "this one is 12 characters",
 *  "state code 45 does not exist" — without spending a round trip on a number
 *  that could never be right.
 *
 *  AND IN THE DATABASE, because a rule the database does not know is a rule a
 *  direct PATCH walks past. `verify_gstin` is the only door that can move
 *  `gstin_verified_at`; a trigger refuses every other hand.
 *
 *  The API the user asked for ("GST verification will be by API — right now
 *  bypass") goes inside `verify_gstin`, not here: the server action is the
 *  same either way. */

const verifySchema = z.object({ gstin: z.string().min(1).max(40) });

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/business");
};

export async function verifyGstinAction(input: unknown): Promise<{ error: string | null; verifiedAt: string | null }> {
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
    const verifiedAt = await verifyGstin(supabase, verdict.gstin);
    refresh();
    return { error: null, verifiedAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That number could not be verified", verifiedAt: null };
  }
}

export async function clearGstinAction(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  try {
    await clearGstin(supabase);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove that number" };
  }
  refresh();
  return { error: null };
}
