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
  /** how many of it (4 Oct 2026) — a COUNT, not a multiplier: `valueInr` is what
   *  the whole lot cost, so no money figure moved when this arrived */
  quantity: number;
};

/** NINE WORDS (4 Oct 2026, the user: "shorter and better list for type of asset-
 *  speaker, props should be there and Other assets also in option"). It was the
 *  prototype's fourteen (16800); `20261004100000` mapped every existing row onto
 *  these and the database keeps the same list as a CHECK, so a category this file
 *  does not know about cannot be stored — and one it forgets cannot be offered.
 *  Other is LAST, as a last resort is. */
export const ASSET_CATEGORIES = [
  "Speaker",
  "Mirror",
  "Flooring",
  "Lighting",
  "Props",
  "Costume",
  "Furniture",
  "Electronics",
  "Other",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** how a category reads on a card and in the picker — "Other assets", the user's
 *  own words, while the stored value stays the short "Other" */
export const assetCategoryWords = (c: string) => (c === "Other" ? "Other assets" : c);

const ROW = "id, name, category, value_inr";

type Row = { id: string; name: string; category: string; value_inr: number; photo_path?: string | null; quantity?: number | null };

const toAsset = (r: Row): Asset => ({ id: r.id, name: r.name, category: r.category, valueInr: r.value_inr, photoPath: r.photo_path ?? null, quantity: r.quantity ?? 1 });

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
  /* ⚠ and `quantity` with 20261004100000 — the same fallback, so the desk reads
     every row as 1 rather than going down if the app ever lands first */
  let { data, error } = await read(`${ROW}, photo_path, quantity`);
  if (error && /quantity/.test(error.message)) {
    ({ data, error } = await read(`${ROW}, photo_path`));
  }
  if (error && /photo_path/.test(error.message)) {
    ({ data, error } = await read(ROW));
  }
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toAsset);
}

export async function saveAsset(
  supabase: SupabaseClient,
  input: { businessId: string; name: string; category: string; valueInr: number; quantity: number; assetId?: string | null }
): Promise<string> {
  /* ⚠ `p_quantity` exists from 20261004100000 — PostgREST resolves an RPC by its
     argument NAMES, so this call and that migration ship together */
  const { data, error } = await supabase.rpc("save_asset", {
    p_business_id: input.businessId,
    p_name: input.name,
    p_category: input.category,
    p_value_inr: input.valueInr,
    p_asset_id: input.assetId ?? null,
    p_quantity: input.quantity,
  });
  if (error) throw error;
  return data as string;
}

export async function removeAsset(supabase: SupabaseClient, assetId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_asset", { p_asset_id: assetId });
  if (error) throw error;
}
