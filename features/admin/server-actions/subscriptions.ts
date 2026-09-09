"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOrgSubscription, grantOrgSubscription } from "@/repositories/orgStanding";

/** R14 (9 Sep 2026) — an admin's two subscription decisions.
 *  ⚠ Rule 9: money-adjacent. Nothing here charges anybody.
 *
 *  A studio cannot be created without a live subscription, and the only thing
 *  that currently writes one is an admin granting it. That is not a placeholder
 *  standing in for a payment — it is a real decision, audited, notified, and
 *  reversible, and it says `amount_inr = 0` on the row because nothing was
 *  taken. When the price exists, the Cashfree order writes the same row and
 *  these two actions stay exactly as they are.
 *
 *  Ending one leaves every existing studio alone. Only creating a NEW studio is
 *  closed off — taking a business off Discover is a separate decision on a
 *  separate screen, so a lapsed subscription can never quietly unpublish
 *  somebody's classes. */

const grantSchema = z.object({
  orgId: z.string().uuid(),
  months: z.number().int().min(1).max(36),
  note: z.string().trim().max(300).nullable().optional(),
});

const endSchema = z.object({
  orgId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

const refresh = () => {
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit");
};

export async function grantOrgSubscriptionAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a length between one month and three years" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await grantOrgSubscription(supabase, parsed.data.orgId, parsed.data.months, parsed.data.note ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not set that up" };
  }
  refresh();
  return { error: null };
}

export async function endOrgSubscriptionAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Say why in a sentence — they read it" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await endOrgSubscription(supabase, parsed.data.orgId, parsed.data.reason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not end that" };
  }
  refresh();
  return { error: null };
}
