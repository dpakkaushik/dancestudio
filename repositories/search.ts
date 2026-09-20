import type { SupabaseClient } from "@supabase/supabase-js";

/** Step 23: the one search box. The function is SECURITY INVOKER, so what comes
 *  back is exactly what the caller may read — a stranger's results and an
 *  owner's differ by the owner's own unlisted business, and nothing else. */

export type SearchKind = "studio" | "artist" | "crew" | "event" | "person";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  name: string;
  /** "Studio · Pune", "Battle · Talkatora Stadium" — the second line of the row */
  sub: string;
  href: string;
  /** THE FACE ON THE ROW (20 Sep 2026, the user: "search on discover should also
   *  show photo and name similarly" — similarly to the follow list, which has
   *  worn one since 19 Sep). A path in the public media bucket, or null for the
   *  initials on the entity's gradient. An EVENT never has one: what an event
   *  shows is its poster, which is drawn rather than stored. */
  photoPath: string | null;
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
  const rows = (data ?? []) as HitRow[];
  return rows.map((r) => ({ kind: r.kind, id: r.id, name: r.name, sub: r.sub, href: r.href, photoPath: null }));
}

/** ⚠ THE PICTURES, IN AT MOST THREE MORE READS — AND NEVER AS PART OF THE SEARCH
 *  (20 Sep 2026).
 *
 *  `search_dance_os` is SECURITY INVOKER on purpose: the caller's own RLS decides
 *  what is found, which is the whole reason a stranger and an owner get different
 *  answers from one function. Widening its RETURNS TABLE to carry a photo would
 *  mean dropping and re-creating it — and a definer join would quietly hand back
 *  a picture for a row the caller could not otherwise read. So the paths are
 *  fetched AFTERWARDS, as the caller, from the three tables that hold them; a row
 *  whose picture this reader may not see simply comes back without one and the
 *  initials are drawn, which is the same fallback every people row in the app
 *  already uses.
 *
 *  ⚠ An ARTIST hit is a PERSON (R24, 18 Sep 2026), so it reads from `profiles`
 *  beside the plain users — not from `businesses`. Getting that backwards would
 *  have drawn every artist as initials for ever and looked like missing data. */
export async function withSearchPhotos(supabase: SupabaseClient, hits: SearchHit[]): Promise<SearchHit[]> {
  const bizIds = hits.filter((h) => h.kind === "studio").map((h) => h.id);
  const personIds = hits.filter((h) => h.kind === "artist" || h.kind === "person").map((h) => h.id);
  const crewIds = hits.filter((h) => h.kind === "crew").map((h) => h.id);
  if (!bizIds.length && !personIds.length && !crewIds.length) return hits;

  const [biz, people, crews] = await Promise.all([
    bizIds.length ? supabase.from("businesses").select("id, profile_photo_path").in("id", bizIds) : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("profiles").select("id, profile_photo_path").in("id", personIds) : Promise.resolve({ data: [], error: null }),
    crewIds.length ? supabase.from("crews").select("id, photo").in("id", crewIds) : Promise.resolve({ data: [], error: null }),
  ]);

  const by = new Map<string, string | null>();
  /* every one of the three is allowed to come back empty or refused — a search
     dropdown must never fail over a picture */
  for (const r of ((biz.data ?? []) as Array<{ id: string; profile_photo_path: string | null }>)) by.set(r.id, r.profile_photo_path);
  for (const r of ((people.data ?? []) as Array<{ id: string; profile_photo_path: string | null }>)) by.set(r.id, r.profile_photo_path);
  for (const r of ((crews.data ?? []) as Array<{ id: string; photo: string | null }>)) by.set(r.id, r.photo);

  return hits.map((h) => ({ ...h, photoPath: by.get(h.id) ?? null }));
}
