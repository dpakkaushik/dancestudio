import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** HOW MANY PEOPLE FOLLOW A DANCE STYLE (10 Oct 2026, the user: "follower count
 *  on styles tile on discover").
 *
 *  A style has no follow button; what "following" a style means here is the
 *  same thing the Styles tab's "Followed by you" shelf already means for the
 *  person looking — a style on their profile (`profiles.styles`) or on the list
 *  they want to learn (`profiles.learn_styles`). A person who has a style on
 *  both is counted ONCE.
 *
 *  ⚠ Rule 9: read with the SERVICE ROLE, on the server, and only an aggregate
 *  leaves this function. `learn_styles` has no client SELECT grant at all (it is
 *  private to its owner, 11 Oct 2026) and `profiles` is signed-in-only, so no
 *  client could count this; a count per style names nobody. Nothing but the
 *  numbers is returned, and Discover is the only caller.
 *
 *  ⚠ Kept for a minute per server instance — a figure on a public shelf does
 *  not need to be fresher than that, and Discover is the app's busiest page.
 *  Anything that goes wrong answers an EMPTY map, and a tile with no count
 *  simply draws no pill: a decoration must never break Discover. */
const TTL_MS = 60_000;
let memo: { at: number; counts: Map<string, number> } | null = null;

export async function findStyleFollowerCounts(): Promise<Map<string, number>> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.counts;
  try {
    const supabase = createSupabaseAdminClient();
    const counts = new Map<string, number>();
    const PAGE = 1000;
    for (let from = 0; from < 20_000; from += PAGE) {
      /* audit-ok: an aggregate over every live profile, by design — only counts leave */
      const { data, error } = await supabase
        .from("profiles")
        .select("styles, learn_styles")
        .is("deleted_at", null)
        .range(from, from + PAGE - 1);
      if (error) return memo?.counts ?? new Map();
      for (const row of (data ?? []) as Array<{ styles: string[] | null; learn_styles: string[] | null }>) {
        const mine = new Set<string>([...(row.styles ?? []), ...(row.learn_styles ?? [])]);
        for (const s of mine) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      if (!data || data.length < PAGE) break;
    }
    memo = { at: Date.now(), counts };
    return counts;
  } catch {
    return memo?.counts ?? new Map();
  }
}
