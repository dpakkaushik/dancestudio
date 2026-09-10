"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCashfreeConfigured } from "@/lib/cashfree/api";
import { cancelCashfreeSubscription } from "@/lib/cashfree/subscriptions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setPlanPrice } from "@/repositories/plans";
import { endSubscription, findSubscriptionById, grantSubscription } from "@/repositories/subscriptions";

/** THE ADMIN'S THREE PLAN DECISIONS (10 Sep 2026). ⚠ Rule 9: money-adjacent.
 *
 *  Each RPC checks `is_platform_admin()` itself, tells the person affected in
 *  words they read back, and writes to the audit log.
 *
 *  A PRICE CHANGE is what the user asked for by name — "admin has the access to
 *  change the amount of subscription in admin console". It applies to the next
 *  subscriber; whoever already subscribed keeps the price they started at (a
 *  Cashfree plan's amount is fixed, so the new price becomes a new provider
 *  plan the next time somebody subscribes).
 *
 *  A GRANT is a comp: N months for free, `granted` on the row, audited, and it
 *  renews nothing — the owner is reminded three days before it ends.
 *
 *  ENDING one is a sanction, the only case where access does not run to the
 *  period's end; the provider mandate is cancelled so nothing is charged again. */

const priceSchema = z.object({
  key: z.string().regex(/^[a-z_]{3,40}$/),
  priceInr: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
});

const grantSchema = z.object({
  kind: z.enum(["artist", "studio"]),
  subjectId: z.string().uuid(),
  months: z.number().int().min(1).max(36),
  note: z.string().trim().max(300).nullable().optional(),
});

const endSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

const refresh = () => {
  revalidatePath("/admin");
  revalidatePath("/admin/plans");
  revalidatePath("/admin/businesses");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit");
  revalidatePath("/discover");
  revalidatePath("/business");
  revalidatePath("/subscription");
};

export async function setPlanPriceAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "A price is a whole number of rupees between 0 and 10,00,000" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await setPlanPrice(supabase, parsed.data.key, parsed.data.priceInr, parsed.data.active);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change that price" };
  }
  refresh();
  return { error: null };
}

export async function grantSubscriptionAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Pick a length between one month and three years" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await grantSubscription(supabase, parsed.data.kind, parsed.data.subjectId, parsed.data.months, parsed.data.note ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not set that up" };
  }
  refresh();
  return { error: null };
}

export async function endSubscriptionAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Say why in a sentence — they read it" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await endSubscription(supabase, parsed.data.subscriptionId, parsed.data.reason);
    /* the provider's mandate goes too, or the bank would keep charging a plan
       DanceOS has ended; a failure here leaves the next status webhook to reconcile */
    if (isCashfreeConfigured()) {
      try {
        const admin = createSupabaseAdminClient();
        const row = await findSubscriptionById(admin, parsed.data.subscriptionId);
        if (row?.providerSubscriptionId && !row.granted) {
          await cancelCashfreeSubscription(row.providerSubscriptionId);
        }
      } catch {
        /* recorded on our side; reconciled by the provider's webhook */
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not end that" };
  }
  refresh();
  return { error: null };
}
