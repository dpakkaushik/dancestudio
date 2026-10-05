import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** WHAT PEOPLE LOOKED FOR AND WHAT THEY WERE SHOWN (30 Sep 2026) — the writers
 *  for the two tables `20260929140000` created and nothing had ever written to.
 *
 *  ⚠⚠ THERE IS NO CLIENT DOOR TO EITHER TABLE, AND THAT IS THE DESIGN. The
 *  obvious shape — an RPC granted to anon so the browser can record its own
 *  impressions — is a spam vector wearing a feature's clothes, because Discover
 *  is public and neither table can carry a rate limit that means anything. Both
 *  tables have RLS on and NOT ONE POLICY, and nothing is granted to anon or
 *  authenticated; the precedent is `webhook_events` and `rate_limits`. Discover
 *  and the search box already render on OUR server, so the rows are written
 *  there, with the service role, and the browser is never involved.
 *
 *  ⚠ NEITHER OF THESE MAY EVER BREAK THE THING IT OBSERVES. A measurement is
 *  not worth a failed page, so every path here swallows everything — the same
 *  rule `notify()` follows in the database (Step 24). Call them inside `after()`
 *  so the write happens once the response has already gone out.
 */

export type SearchScope = "all" | "studios" | "artists" | "crews" | "classes";
export type ImpressionSurface = "discover" | "search" | "followed" | "nearby";
/* `person` since 6 Oct 2026 (`20261006093000`): an artist has been a PERSON since
   R24, so Discover's Artists tab records its shelf under that word rather than
   pretending a profile is a business */
export type ImpressionKind = "business" | "class" | "crew" | "person";

/** the CHECK's own bound — a shelf longer than this is a bug upstream */
const MAX_SUBJECTS = 200;

export async function recordSearch(input: {
  viewerId: string | null;
  term: string;
  city: string | null;
  scope: SearchScope;
  resultCount: number;
}): Promise<void> {
  const term = input.term.trim().slice(0, 120);
  /* the CHECK refuses an empty term; so does the search box, but this is the
     last thing between a stray call and a constraint error in a log nobody reads */
  if (term.length === 0) return;
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("search_events").insert({
      viewer_id: input.viewerId,
      term,
      city: input.city,
      scope: input.scope,
      result_count: Math.max(0, Math.trunc(input.resultCount)),
    });
  } catch {
    /* a measurement is never the reason a search fails */
  }
}

/** ⚠ ONE ROW PER SHELF, NEVER PER CARD. Fifty cards is fifty rows under the
 *  obvious design, and the question a studio actually asks — *was I shown, and
 *  where in the list* — is answered as well by an ordered array. */
export async function recordImpression(input: {
  viewerId: string | null;
  surface: ImpressionSurface;
  city: string | null;
  subjectKind: ImpressionKind;
  subjectIds: string[];
}): Promise<void> {
  /* ⚠⚠ AN EMPTY SHELF IS NOT AN IMPRESSION, and the CHECK says so — but only
     because the dry run caught that `array_length('{}', 1)` is NULL and a CHECK
     PASSES on NULL. The guard is here too, because the honest reason is that a
     row saying "nothing was shown" measures nothing. */
  const ids = [...new Set(input.subjectIds)].slice(0, MAX_SUBJECTS);
  if (ids.length === 0) return;
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("impressions").insert({
      viewer_id: input.viewerId,
      surface: input.surface,
      city: input.city,
      subject_kind: input.subjectKind,
      subject_ids: ids,
    });
  } catch {
    /* a measurement is never the reason Discover fails */
  }
}
