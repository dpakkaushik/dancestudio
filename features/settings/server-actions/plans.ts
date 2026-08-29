"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activateArtistPlan, endArtistPlan } from "@/repositories/plans";
import { updateTenantProfile } from "@/repositories/tenants";

/** DanceOS Pro · Artist (S_subscr 16935): the plan's two doors, and the
 *  business profile's one (About / Since / phone / links / enquiry types / the
 *  accepted-from-students switches — S_payments 16612, the enquiry-types sheet
 *  9000). The RPCs re-check every rule; the actions check the shape. */

const planSchema = z.object({ plan: z.enum(["monthly", "yearly"]) });

export async function activateArtistPlanAction(input: { plan: "monthly" | "yearly" }): Promise<{ error: string | null; until: string | null }> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "A plan is monthly or yearly", until: null };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    const out = await activateArtistPlan(supabase, parsed.data.plan);
    revalidatePath("/subscription");
    revalidatePath("/profile");
    revalidatePath("/");
    return { error: null, until: out.until };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not start the plan", until: null };
  }
}

export async function endArtistPlanAction(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    await endArtistPlan(supabase);
    revalidatePath("/subscription");
    revalidatePath("/profile");
    revalidatePath("/");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not end the plan" };
  }
}

const tenantProfileSchema = z.object({
  tenantId: z.string().uuid(),
  about: z.string().trim().max(220).nullable(),
  foundedYear: z.number().int().min(1950).max(2100).nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{7,17}$/, "a phone number is 8 to 18 digits")
    .nullable(),
  socials: z.array(z.object({ platform: z.string().trim().min(1).max(40), url: z.string().trim().url().max(300) })).max(12),
  enquiryTypes: z.array(z.string().trim().min(1).max(40)).nullable(),
  accepts: z.object({ upi: z.boolean(), cards: z.boolean(), cash: z.boolean(), bank: z.boolean() }),
});
export type TenantProfileActionInput = z.infer<typeof tenantProfileSchema>;

export async function updateTenantProfileAction(input: TenantProfileActionInput): Promise<{ error: string | null }> {
  const parsed = tenantProfileSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "business"}: ${first.message}` : "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    const { tenantId, ...rest } = parsed.data;
    await updateTenantProfile(supabase, tenantId, { ...rest, about: rest.about || null, phone: rest.phone || null });
    revalidatePath(`/studio/${tenantId}`);
    revalidatePath(`/artist/${tenantId}`);
    revalidatePath(`/business/${tenantId}/payments`);
    revalidatePath("/profile");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that" };
  }
}
