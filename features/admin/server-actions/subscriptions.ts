"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCashfreeConfigured } from "@/lib/cashfree/api";
import {
  cancelCashfreeSubscription,
  fetchCashfreeSubscriptionPayments,
  refundCashfreeSubscriptionPayment,
} from "@/lib/cashfree/subscriptions";
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
  /* "org" since 27 Sep 2026 — `admin_grant_subscription` learned the third kind
     in `20260927090000`, and the RPC re-checks it (Rule 6: the door validates) */
  kind: z.enum(["artist", "studio", "org"]),
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

/** GIVE A REJECTED STUDIO ITS FIRST PERIOD BACK (6 Oct 2026, decision 2).
 *  ⚠ Rule 9: money. Since R51 a studio pays at creation and is verified after,
 *  so one DanceOS refuses has paid for a month it could never use; "End its
 *  subscription too" stops the next charge and this returns the first.
 *
 *  ⚠ THE ORDER IS THE DESIGN: Cashfree is asked FIRST, and the ledger records
 *  only a refund Cashfree accepted — a row reading "refunded" over money that
 *  never moved is the worst state this screen could leave. The amount is the
 *  AUTHORISATION payment's own, read off Cashfree's list for this mandate; the
 *  refund id is derived from that payment, so a second press is refused by
 *  Cashfree as a duplicate rather than paying twice, and by the database's own
 *  "already refunded". The record is written with the ADMIN's client, because
 *  the door is `is_platform_admin()` inside and answers the service role with
 *  nothing (10 Sep 2026). */
export async function refundFirstPeriodAction(input: unknown): Promise<{ error: string | null; amountInr?: number }> {
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Say why in a sentence — they read it" };
  }
  if (!isCashfreeConfigured()) {
    return { error: "Cashfree is not configured, so nothing could be refunded" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    const row = await findSubscriptionById(createSupabaseAdminClient(), parsed.data.subscriptionId);
    if (!row) return { error: "no such subscription" };
    if (row.granted) return { error: null };
    if (!row.providerSubscriptionId) return { error: "this subscription never reached Cashfree — there is nothing to refund" };
    const payments = await fetchCashfreeSubscriptionPayments(row.providerSubscriptionId);
    const auth = payments.find((p) => p.payment_type === "AUTH" && p.payment_status === "SUCCESS");
    if (!auth) return { error: "Cashfree holds no successful first-period payment on this mandate" };
    const refundId = `dos_subref_${auth.payment_id.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 40);
    const out = await refundCashfreeSubscriptionPayment({
      providerSubscriptionId: row.providerSubscriptionId,
      paymentId: auth.payment_id,
      refundId,
      amountInr: auth.payment_amount,
      note: "DanceOS first month back",
    });
    const { data, error } = await supabase.rpc("admin_record_first_period_refund", {
      p_subscription_id: row.id,
      p_provider_refund_id: out.cf_refund_id ?? out.refund_id ?? refundId,
      p_reason: parsed.data.reason,
    });
    if (error) {
      return { error: `Cashfree accepted the refund (${refundId}) but the ledger did not record it: ${error.message}` };
    }
    refresh();
    revalidatePath("/invoices");
    return { error: null, amountInr: Number((data as { amount_inr?: number } | null)?.amount_inr ?? auth.payment_amount) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not refund that" };
  }
}
