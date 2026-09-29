"use server";

import { after } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordSearch } from "@/repositories/analytics";
import { searchEverything, withSearchPhotos, type SearchHit } from "@/repositories/search";

/** The search box's read. Works signed out — the function is invoker-scoped, so
 *  a stranger simply finds less. */

export interface SearchResult {
  hits: SearchHit[];
  error: string | null;
}

const schema = z.object({
  term: z.string().trim().min(2).max(60),
  /** ⚠ WHERE THE SEARCH WAS MADE FROM, FOR THE LOG AND FOR NOTHING ELSE
   *  (30 Sep 2026). The search itself is national and this never narrows it —
   *  it is the column that turns the log from "somebody looked for salsa" into
   *  "somebody in Pune did", which is the only version a studio can act on. It
   *  comes from the client, which is fine precisely because it authorises
   *  nothing: the worst a forged value does is mislabel one row. */
  city: z.string().trim().max(60).optional(),
});

export async function searchEverythingAction(input: { term: string; city?: string | null }): Promise<SearchResult> {
  const parsed = schema.safeParse({ term: input.term, city: input.city ?? undefined });
  if (!parsed.success) {
    return { hits: [], error: null };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const hits = await searchEverything(supabase, parsed.data.term);
    /* ⚠⚠ THE ZERO-RESULT ROW IS THE VALUABLE ONE (30 Sep 2026). A term people
       search and DanceOS cannot answer is either a studio that ought to exist
       or a word the search box does not understand, and until today nothing
       anywhere recorded either. Written AFTER the response has gone out, with
       the service role, and it can never fail the search. */
    after(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await recordSearch({
        viewerId: user?.id ?? null,
        term: parsed.data.term,
        city: parsed.data.city ?? null,
        scope: "all",
        resultCount: hits.length,
      });
    });
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
