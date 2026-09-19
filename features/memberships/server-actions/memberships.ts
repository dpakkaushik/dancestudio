"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookWithMembership, buyMembership, deleteMembership, saveMembership } from "@/repositories/memberships";

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
  unit: z.enum(["classes", "hours"]),
  units: z.number().positive("Say how many").max(999),
  priceInr: z.number().int().min(0).max(1000000),
  totalCount: z.number().int().min(1, "Say how many of these may be sold").max(10000),
  status: z.enum(["live", "draft"]),
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
