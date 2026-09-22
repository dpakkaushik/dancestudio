import type { SupabaseClient } from "@supabase/supabase-js";

/** THIS ACCOUNT'S OWN ARRANGEMENT OF THE GRIDS IT LOOKS AT (22 Sep 2026).
 *
 *  `profiles.layout` — one jsonb object keyed by grid, written by
 *  `set_my_layout` and shaped by the `profiles_layout_shape` CHECK
 *  (`20260922090000_a_grid_is_arranged`).
 *
 *  ⚠ **IT IS DELIBERATELY NOT IN `PROFILE_COLUMNS`.** That list is what every
 *  profile read selects, including `findPublicPerson`, which is how one person
 *  reads another — and an arrangement is a preference about somebody's own
 *  screen, not a fact about them. Nobody else has any business reading it, so it
 *  is read here, narrowly, by the pages that draw a grid. */

/** The whole object, as stored. Unknown shapes are dropped rather than trusted:
 *  the CHECK makes a bad value hard to store and does not make it impossible to
 *  READ one written before the CHECK existed. */
function toLayout(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const keys = value.filter((v): v is string => typeof v === "string" && v.length > 0);
      if (keys.length > 0) out[key] = keys;
    }
  }
  return out;
}

/** The order this person has put ONE grid in, or null for "they have not".
 *
 *  ⚠ **A FAILURE HERE IS NEVER THE REASON A HOME DOES NOT RENDER.** The worst
 *  this read can honestly do is lose somebody's arrangement for one paint, and
 *  the grid behind it still draws every tile in the code's own order — so an
 *  error answers null rather than throwing, exactly as Home already swallows a
 *  refused `ensureArtistPage`. A preference must not be able to take down the
 *  screen it decorates. */
export async function findMyToolOrder(
  supabase: SupabaseClient,
  userId: string,
  key: string | null
): Promise<string[] | null> {
  if (!key) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("layout")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  const order = toLayout((data as { layout: unknown }).layout)[key];
  return order && order.length > 0 ? order : null;
}

/** Store one grid's order, or forget it.
 *
 *  ⚠ An EMPTY order is how the door is told to forget the key — the migration's
 *  own `layout - p_key` branch — so "Reset" and "I have never arranged this" end
 *  up as the same stored state rather than as an empty array pretending to be an
 *  arrangement. */
export async function setMyToolOrder(supabase: SupabaseClient, key: string, order: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_my_layout", { p_key: key, p_order: order });
  if (error) {
    throw new Error(`layout.setMyToolOrder failed: ${error.message}`);
  }
}
