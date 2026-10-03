import type { SupabaseClient } from "@supabase/supabase-js";

/** WHAT A BUSINESS OWNS (21 Sep 2026) — the prototype's S_assets (16791), which
 *  is three fields and a total and nothing else.
 *
 *  ⚠ `valueInr === 0` is not "missing", it is "we already had this one" — the
 *  prototype's own `₹ (0 = old)` — and the screen prints it as "₹0 (legacy)".
 *  There is no separate flag, because two ways to say one thing can disagree. */
export type Asset = {
  id: string;
  name: string;
  category: string;
  valueInr: number;
  /** its picture, in media/assets/{business}/… (3 Oct 2026); null = none */
  photoPath: string | null;
};

/** the prototype's fourteen words (16800), in its order. The database keeps the
 *  same list as a CHECK, so a category this file does not know about cannot be
 *  stored — and one it forgets cannot be offered. */
export const ASSET_CATEGORIES = [
  "Equipment",
  "Sound & AV",
  "Lighting",
  "Infrastructure",
  "Flooring",
  "Mirrors",
  "Costume",
  "Props",
  "Furniture",
  "IT & devices",
  "Instruments",
  "Safety",
  "Merchandise",
  "Vehicle",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

const ROW = "id, name, category, value_inr";

type Row = { id: string; name: string; category: string; value_inr: number; photo_path?: string | null };

const toAsset = (r: Row): Asset => ({ id: r.id, name: r.name, category: r.category, valueInr: r.value_inr, photoPath: r.photo_path ?? null });

/** a business's inventory, newest first — the owner's alone, by policy */
export async function findBusinessAssets(supabase: SupabaseClient, businessId: string): Promise<Asset[]> {
  const read = (cols: string) =>
    supabase
      .from("assets")
      .select(cols)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
  /* ⚠ `photo_path` arrives with 20261003120000; until it is applied the read
     answers "column does not exist", so it falls back to the read without it
     rather than taking the desk down (the 27 Sep `poster_path` lesson) */
  let { data, error } = await read(`${ROW}, photo_path`);
  if (error && /photo_path/.test(error.message)) {
    ({ data, error } = await read(ROW));
  }
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toAsset);
}

export async function saveAsset(
  supabase: SupabaseClient,
  input: { businessId: string; name: string; category: string; valueInr: number; assetId?: string | null }
): Promise<string> {
  const { data, error } = await supabase.rpc("save_asset", {
    p_business_id: input.businessId,
    p_name: input.name,
    p_category: input.category,
    p_value_inr: input.valueInr,
    p_asset_id: input.assetId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function removeAsset(supabase: SupabaseClient, assetId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_asset", { p_asset_id: assetId });
  if (error) throw error;
}
