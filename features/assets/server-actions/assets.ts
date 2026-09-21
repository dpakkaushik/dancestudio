"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ASSET_CATEGORIES, removeAsset, saveAsset } from "@/repositories/assets";

/** ASSETS — the writes (21 Sep 2026). Zod checks the SHAPE; every rule that
 *  matters is `save_asset`'s: who owns the business, and what a name and a value
 *  may be. The category list is checked in both places on purpose — here so the
 *  form cannot send a word the database would refuse with a 400, and there
 *  because a CHECK is the only thing a direct PostgREST caller meets. */

export type AssetResult = { error: string | null };

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
  assetId: z.string().uuid().nullable().optional(),
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the asset").max(80),
  category: z.enum(ASSET_CATEGORIES),
  /* ⚠ 0 is a real answer, not a missing one: it means an asset the business
     already had, which the screen prints as "₹0 (legacy)" */
  valueInr: z.number().int().min(0, "A value cannot be negative").max(1000000000),
});

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export async function saveAssetAction(input: z.input<typeof saveSchema>): Promise<AssetResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const supabase = await me();
  try {
    await saveAsset(supabase, parsed.data);
  } catch (e: unknown) {
    return { error: message(e) };
  }
  revalidatePath(`/business/${parsed.data.businessId}/assets`);
  return { error: null };
}

export async function removeAssetAction(input: { assetId: string; businessId: string }): Promise<AssetResult> {
  const parsed = z.object({ assetId: z.string().uuid(), businessId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { error: "That asset is not on record" };
  }
  const supabase = await me();
  try {
    await removeAsset(supabase, parsed.data.assetId);
  } catch (e: unknown) {
    return { error: message(e) };
  }
  revalidatePath(`/business/${parsed.data.businessId}/assets`);
  return { error: null };
}
