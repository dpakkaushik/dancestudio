"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isCashfreeConfigured, refundCashfreePayment } from "@/lib/cashfree/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookWithMembership, buyMembership, deleteMembership, returnMembershipPass, saveMembership } from "@/repositories/memberships";
import { attachProviderRefund } from "@/repositories/payments";

/** MEMBERSHIPS — the writes (19 Sep 2026). Zod checks the shape; every rule
 *  that matters is the RPC's: who may sell, who may buy, whether a class takes
 *  a pass, and whether there is a unit left to spend. The MONEY goes through
 *  the rail we already have — `startMembershipCheckoutAction` is the class
 *  flow's own `openRail`, so a membership sale writes the same payments row a
 *  seat does and appears in the seller's earnings with nothing else changed. */

export type MembershipResult = { error: string | null };

async function me() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return supabase;
}

const saveSchema = z.object({
  membershipId: z.string().uuid().nullable().optional(),
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the membership").max(80),
  /* ⚠ HOURS ONLY (3 Oct 2026, the user: "membership only according to hours not
     classes"). The app no longer makes a class-based membership; passes already
     sold in classes keep their own snapshot and keep working. ⚠ The DATABASE
     still accepts "classes" (`save_membership` and the CHECK) — narrowing it is a
     migration and goes in front of the user first. */
  unit: z.literal("hours", { message: "A membership is sold in hours" }),
  units: z.number().positive("Say how many hours").max(999).refine((n) => Number.isInteger(n * 2), "Hours go in halves"),
  priceInr: z.number().int().min(0).max(1000000),
  totalCount: z.number().int().min(1, "Set the quantity").max(10000),
  status: z.enum(["live", "draft"]),
  /* 30 · 60 · 90 · 120 · 150 days from purchase, or null = unlimited, until the
     hours are used up (4 Oct 2026); the RPC refuses anything else too */
  validityDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120), z.literal(150), z.null()], {
    message: "Pick how long it lasts — 30, 60, 90, 120 or 150 days, or unlimited",
  }),
});

function revalidateMembershipSurfaces(businessId?: string) {
  revalidatePath("/memberships");
  revalidatePath("/business/memberships");
  if (businessId) {
    revalidatePath(`/business/${businessId}/memberships`);
    revalidatePath(`/studio/${businessId}`);
  }
}

export async function saveMembershipAction(input: z.input<typeof saveSchema>): Promise<MembershipResult & { membershipId?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const supabase = await me();
  try {
    const id = await saveMembership(supabase, { ...parsed.data, membershipId: parsed.data.membershipId ?? null });
    revalidateMembershipSurfaces(parsed.data.businessId);
    return { error: null, membershipId: id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the membership" };
  }
}

export async function deleteMembershipAction(input: { membershipId: string; businessId?: string }): Promise<MembershipResult> {
  const parsed = z.object({ membershipId: z.string().uuid(), businessId: z.string().uuid().optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    await deleteMembership(supabase, parsed.data.membershipId);
    revalidateMembershipSurfaces(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove the membership" };
  }
}

/** Take one. A FREE membership is granted here and now; a priced one comes back
 *  waiting for its money, and the caller opens the checkout with the pass id. */
export async function buyMembershipAction(input: { membershipId: string }): Promise<MembershipResult & { passId?: string; needsPayment?: boolean }> {
  const parsed = z.object({ membershipId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    const pass = await buyMembership(supabase, parsed.data.membershipId);
    revalidateMembershipSurfaces();
    return { error: null, passId: pass.passId, needsPayment: pass.status === "pending_payment" };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not take that membership" };
  }
}

/** ⚠ MONEY. HAND AN UNUSED MEMBERSHIP BACK (6 Oct 2026, the user's decision 3:
 *  "allow refund within 7 days of purchase if no hours used"). The database
 *  decides — `return_membership_pass` refuses in words unless it is the
 *  holder's, active, unspent, under a week old and not run out — and files one
 *  automatic refund for a paid pass. This then sends it to Cashfree exactly as
 *  a class cancel does; a failed send leaves the row `pending` and unsent, where
 *  the studio's ledger offers "Send through Cashfree" again. */
export async function returnMembershipPassAction(input: { passId: string }): Promise<MembershipResult & { message?: string }> {
  const parsed = z.object({ passId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    const { refund } = await returnMembershipPass(supabase, parsed.data.passId);
    revalidateMembershipSurfaces();
    if (!refund) return { error: null, message: "Membership handed back" };
    const amount = `₹${refund.amountInr.toLocaleString("en-IN")}`;
    if (isCashfreeConfigured() && refund.provider === "cashfree" && refund.providerOrderId) {
      try {
        const cf = await refundCashfreePayment({ providerOrderId: refund.providerOrderId, refundId: refund.id, amountInr: refund.amountInr, note: "Membership returned unused" });
        await attachProviderRefund(supabase, refund.id, String(cf.cf_refund_id));
        return { error: null, message: `Returned — your ${amount} refund is on its way` };
      } catch {
        return { error: null, message: `Returned — your ${amount} refund is queued` };
      }
    }
    return { error: null, message: `Returned — your ${amount} refund is queued` };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not return that membership" };
  }
}

/** Book a seat with a membership — one act, so the seat and the spend cannot
 *  come apart. The RPC checks the class takes this pass and that a unit is left. */
export async function bookWithMembershipAction(input: { sessionId: string; passId: string; shareSlug?: string }): Promise<MembershipResult> {
  const parsed = z.object({ sessionId: z.string().uuid(), passId: z.string().uuid(), shareSlug: z.string().max(140).optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    await bookWithMembership(supabase, parsed.data.sessionId, parsed.data.passId);
    if (parsed.data.shareSlug) revalidatePath(`/c/${parsed.data.shareSlug}`);
    revalidatePath("/my-classes");
    revalidatePath("/memberships");
    revalidatePath("/");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not book with that membership" };
  }
}
