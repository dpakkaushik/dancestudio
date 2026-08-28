import type { SupabaseClient } from "@supabase/supabase-js";

/** Step 23: the one search box. The function is SECURITY INVOKER, so what comes
 *  back is exactly what the caller may read — a stranger's results and an
 *  owner's differ by the owner's own unlisted business, and nothing else. */

export type SearchKind = "studio" | "artist" | "crew" | "event";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  name: string;
  /** "Studio · Pune", "Battle · Talkatora Stadium" — the second line of the row */
  sub: string;
  href: string;
}

interface HitRow {
  kind: SearchKind;
  id: string;
  name: string;
  sub: string;
  href: string;
}

/** Hits grouped the way the dropdown prints them: Studios · Artists · Crews ·
 *  Events, each at most `perKind`. An empty or one-letter term returns nothing. */
export async function searchEverything(supabase: SupabaseClient, term: string, perKind = 3): Promise<SearchHit[]> {
  const q = term.trim();
  if (q.length < 2) {
    return [];
  }
  const { data, error } = await supabase.rpc("search_dance_os", { p_q: q, p_limit: perKind });
  if (error) {
    throw new Error(`search failed: ${error.message}`);
  }
  return ((data ?? []) as HitRow[]).map((r) => ({ kind: r.kind, id: r.id, name: r.name, sub: r.sub, href: r.href }));
}
