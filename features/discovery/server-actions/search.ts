"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchEverything, withSearchPhotos, type SearchHit } from "@/repositories/search";

/** The search box's read. Works signed out — the function is invoker-scoped, so
 *  a stranger simply finds less. */

export interface SearchResult {
  hits: SearchHit[];
  error: string | null;
}

const schema = z.object({ term: z.string().trim().min(2).max(60) });

export async function searchEverythingAction(input: { term: string }): Promise<SearchResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { hits: [], error: null };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const hits = await searchEverything(supabase, parsed.data.term);
    /* the faces (20 Sep 2026, the user: "search on discover should also show
       photo and name similarly"). ⚠ Swallowed on purpose: a dropdown that shows
       initials is a dropdown; one that shows an error because a picture could
       not be read is a broken search. */
    const withFaces = await withSearchPhotos(supabase, hits).catch(() => hits);
    return { hits: withFaces, error: null };
  } catch (error: unknown) {
    return { hits: [], error: error instanceof Error ? error.message : "Search failed" };
  }
}
