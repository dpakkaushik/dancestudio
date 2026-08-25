"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setClaimPay } from "@/repositories/claims";
import { recordPayout, setPayoutStatus, voidPayout } from "@/repositories/payouts";

/** ⚠ Money. Step 13's writes. Two rules the RPCs enforce rather than trust:
 *   · only the studio's OWNER records, changes or voids a payout (the
 *     prototype's SS10.9 — payout approval is owner-only and not grantable), and
 *     only the owner sets what a session pays
 *   · the AMOUNT is never accepted from the client. The action sends session
 *     ids; record_payout counts the total from the rates on record (Step 9's
 *     rule, kept). */

export interface PayoutActionResult {
  error: string | null;
}

const recordSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionIds: z.array(z.string().uuid()).min(1).max(200),
  method: z.enum(["bank_transfer", "upi", "cash", "other"]),
  status: z.enum(["done", "in_transit", "on_hold", "failed"]),
  // a UTR or a rail's reference; the studio's own note, not a promise we make
  providerRef: z.string().trim().max(120).optional().nullable(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "not a date")
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

const statusSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(["done", "in_transit", "on_hold", "failed"]),
  providerRef: z.string().trim().max(120).optional().nullable(),
});

const payoutIdSchema = z.object({ payoutId: z.string().uuid() });

const paySchema = z.object({
  claimId: z.string().uuid(),
  payPerSessionInr: z.number().int().min(0).max(200000),
});

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return supabase;
}

/** Both sides of the ledger change at once: the studio's desk and the earnings
 *  screen of whoever was paid. */
function revalidateMoneySurfaces(tenantId?: string) {
  if (tenantId) {
    revalidatePath(`/business/${tenantId}/earnings`);
  }
  revalidatePath("/business/[tenantId]/earnings", "page");
  revalidatePath("/earnings");
  revalidatePath("/");
}

export async function recordPayoutAction(input: {
  tenantId: string;
  userId: string;
  sessionIds: string[];
  method: "bank_transfer" | "upi" | "cash" | "other";
  status: "done" | "in_transit" | "on_hold" | "failed";
  providerRef?: string | null;
  paidOn?: string | null;
  note?: string | null;
}): Promise<PayoutActionResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid payout" };
  }
  const supabase = await requireUser();
  try {
    await recordPayout(supabase, parsed.data);
    revalidateMoneySurfaces(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not record that payment" };
  }
}

export async function setPayoutStatusAction(input: {
  payoutId: string;
  status: "done" | "in_transit" | "on_hold" | "failed";
  providerRef?: string | null;
}): Promise<PayoutActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid status" };
  }
  const supabase = await requireUser();
  try {
    await setPayoutStatus(supabase, parsed.data.payoutId, parsed.data.status, parsed.data.providerRef);
    revalidateMoneySurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not update that payment" };
  }
}

/** Voiding releases the payout's sessions so they can be settled again — for a
 *  payment recorded by mistake. Both sides are soft-deleted, so the mistake
 *  stays readable. */
export async function voidPayoutAction(input: { payoutId: string }): Promise<PayoutActionResult> {
  const parsed = payoutIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await voidPayout(supabase, parsed.data.payoutId);
    revalidateMoneySurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not void that payment" };
  }
}

export async function setClaimPayAction(input: {
  claimId: string;
  payPerSessionInr: number;
}): Promise<PayoutActionResult> {
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That is not a rate" };
  }
  const supabase = await requireUser();
  try {
    await setClaimPay(supabase, parsed.data.claimId, parsed.data.payPerSessionInr);
    revalidateMoneySurfaces();
    revalidatePath("/c/[slug]", "page");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not set the rate" };
  }
}
