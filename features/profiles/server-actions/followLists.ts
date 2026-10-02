"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewFollowers, findMyFollowedCrews, findMyFollowedPeople, findMyFollowing, findBusinessFollowers, findTeamFollows, withTeamFollows } from "@/repositories/follows";

/** a person's teams as Following rows — studios, then crews */
function teamRows(teams: Awaited<ReturnType<typeof findTeamFollows>>): FollowListResult["rows"] {
  return [
    ...teams.businesses.map((t) => ({ id: t.followId, name: t.businessName, sub: t.businessCity ? `Studio · ${t.businessCity}` : "Studio", href: `/studio/${t.businessId}`, photoPath: t.businessPhotoPath })),
    ...teams.crews.map((c) => ({ id: c.followId, name: c.name, sub: c.city ? `Crew · ${c.city}` : "Crew", href: `/crew/${c.crewId}`, photoPath: c.photo })),
  ];
}

/** ⚠⚠ THE FOLLOWER LIST, READ WHEN IT IS ASKED FOR (27 Sep 2026, the user:
 *  *"fix follow following for all profiles. list should open when clicked from
 *  anywhere"*).
 *
 *  Until today the figure was a door on exactly TWO screens — a person's own
 *  Home and their own Profile tab — and a dead number on the other seven. The
 *  reason was never a rule: it was that a studio's home, an organization's and
 *  a crew's do not read the list, and making all three read it on every visit
 *  would be a query per page load for a control most people never press.
 *
 *  So the sheet asks for its own rows when it opens. One read, only on the
 *  press, and the figure is a door everywhere — which is exactly what was asked
 *  for and is cheaper than what it replaces.
 *
 *  ⚠ THE READ IS RLS-BOUNDED AND THE SERVER RE-CHECKS NOTHING ELSE, ON PURPOSE.
 *  `follows` has no public SELECT policy at all (Step 15: "rows are private,
 *  the count is public"): a business's followers are readable by ITS MEMBERS, a
 *  crew's by its LEADER, a person's own by themselves. So a stranger pressing
 *  the figure on a studio's public page gets an EMPTY list rather than somebody
 *  else's data — the ceiling is the database's, as it should be, and this
 *  action adds no second gate that could drift from it. What the app decides is
 *  only whether to DRAW the door. */

export interface FollowListResult {
  error: string | null;
  rows: Array<{ id: string; name: string; sub: string | null; href: string; photoPath: string | null }>;
}

const input = z.object({ kind: z.enum(["business", "crew", "person"]), id: z.string().uuid() });

/* ⚠⚠ A FOLLOW LIST IS AS READABLE AS ITS COUNT (2 Oct 2026, the user: "accurate
   follower following list on all profiles"). Step 15's "the count is public,
   the list is not" meant somebody else's Followers figure printed a number and
   opened onto nobody — a list disagreeing with the count above it. Two
   signed-in-only definer reads (`20261002090000`) hand back exactly the rows the
   three count functions count, so the two cannot disagree.
   ⚠ Each read FALLS BACK to the old RLS-bounded one when the function is not
   there (PGRST202 before the migration is applied), so this bundle is safe on
   either side of the apply. */
type ProfileFollowerRow = { user_id: string; full_name: string | null; profile_photo_path: string | null; city: string | null };
type ProfileFollowingRow = { kind: "person" | "business" | "crew"; id: string; name: string | null; photo_path: string | null; city: string | null; business_type: string | null };

export async function loadFollowersAction(raw: unknown): Promise<FollowListResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Invalid list", rows: [] };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  /* not signed in is not an error — it is an empty list, which is what the
     policy would hand back anyway. A sheet must never be the reason a public
     page shows an error. */
  if (!user) return { error: null, rows: [] };
  const viaDefiner = await supabase.rpc("profile_followers", { p_kind: parsed.data.kind, p_id: parsed.data.id });
  if (!viaDefiner.error) {
    return {
      error: null,
      rows: ((viaDefiner.data ?? []) as ProfileFollowerRow[]).map((r) => ({
        id: r.user_id,
        name: r.full_name ?? "Someone",
        sub: r.city,
        href: `/person/${r.user_id}`,
        photoPath: r.profile_photo_path,
      })),
    };
  }
  /* a person's list has no RLS-bounded fallback — say so rather than drawing an
     empty sheet under a count that is not zero */
  if (parsed.data.kind === "person") return { error: "That list could not be read just now.", rows: [] };
  try {
    const rows =
      parsed.data.kind === "business"
        ? (await findBusinessFollowers(supabase, parsed.data.id)).map((f) => ({
            id: f.followId,
            name: f.name,
            sub: f.city,
            href: `/person/${f.userId}`,
            photoPath: f.avatarPath,
          }))
        : (await findCrewFollowers(supabase, parsed.data.id)).map((f) => ({
            id: f.followId,
            name: f.name,
            sub: f.city,
            href: `/person/${f.userId}`,
            photoPath: f.avatarPath,
          }));
    return { error: null, rows };
  } catch {
    return { error: "That list could not be read just now.", rows: [] };
  }
}

/** ⚠⚠ AND THE OTHER HALF OF THE SAME COMPLAINT (27 Sep 2026, the user:
 *  *"following list not opening properly crew and organization"*).
 *
 *  `loadFollowersAction` above made the FOLLOWERS figure a door on all seven
 *  surfaces that printed a dead number — and left FOLLOWING a dead number on the
 *  three entity homes, which is the same bug one column to the right. A crew's
 *  home, a studio's and an organization's each print a Following figure that is
 *  the ACCOUNT's own (a crew follows nothing — `follows.follower_id` references
 *  `profiles`, so there is nothing to follow WITH), and pressing it did nothing
 *  at all.
 *
 *  ⚠ IT TAKES NO ARGUMENT, AND THAT IS THE WHOLE OF ITS SECURITY. There is no
 *  `p_user_id` to aim at anybody: the four reads below are each scoped to
 *  `auth.uid()` in their own SQL, so this can only ever answer with the caller's
 *  own list. That is also why the three homes may draw the door — on every one of
 *  them the viewer IS the account whose list it is (`requireLedCrew`, and the
 *  studio and organization pages pass the figure only to an owner).
 *
 *  ⚠ THE PUBLIC PAGES DELIBERATELY KEEP A PLAIN FIGURE. On `/studio/{id}` and
 *  `/person/{id}` the Following count belongs to somebody ELSE, and `follows` has
 *  no public SELECT policy — so a door there could never open for anybody but
 *  its owner, and a control that is always empty is worse than no control. Step
 *  15's rule stands: the count is public, the list is not. */
export async function loadFollowingAction(raw?: unknown): Promise<FollowListResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null, rows: [] };
  /* SOMEBODY ELSE'S LIST (2 Oct 2026) — through the definer read, the same rows
     `person_follower_counts` counts as following */
  const who = z.object({ userId: z.string().uuid() }).safeParse(raw);
  if (who.success && who.data.userId !== user.id) {
    const [{ data, error }, teams] = await Promise.all([
      supabase.rpc("profile_following", { p_user_id: who.data.userId }),
      findTeamFollows(supabase, who.data.userId).catch(() => ({ businesses: [], crews: [] })),
    ]);
    if (error) return { error: "That list could not be read just now.", rows: [] };
    const followed: FollowListResult["rows"] = ((data ?? []) as ProfileFollowingRow[]).map((r) => {
        if (r.kind === "person") return { id: `p-${r.id}`, name: r.name ?? "Someone", sub: r.city, href: `/person/${r.id}`, photoPath: r.photo_path };
        if (r.kind === "crew") return { id: `c-${r.id}`, name: r.name ?? "A crew", sub: r.city ? `Crew · ${r.city}` : "Crew", href: `/crew/${r.id}`, photoPath: r.photo_path };
        const kind = r.business_type === "studio" ? "Studio" : "Artist";
        return {
          id: `b-${r.id}`,
          name: r.name ?? "A business",
          sub: r.city ? `${kind} · ${r.city}` : kind,
          href: `/${r.business_type === "studio" ? "studio" : "artist"}/${r.id}`,
          photoPath: r.photo_path,
        };
      });
    /* ⚠ AND THEIR TEAMS (2 Oct 2026) — the crews and studios they are on, unless
       they already follow them; `teamRows` is the same shape the own branch uses */
    const hrefs = new Set(followed.map((r) => r.href));
    return { error: null, rows: [...followed, ...teamRows(teams).filter((r) => !hrefs.has(r.href))] };
  }
  try {
    const [people, followedBusinesses, followedCrews, teams] = await Promise.all([
      findMyFollowedPeople(supabase),
      findMyFollowing(supabase),
      findMyFollowedCrews(supabase).catch(() => []),
      findTeamFollows(supabase, user.id).catch(() => ({ businesses: [], crews: [] })),
    ]);
    /* your own teams are in your Following (2 Oct 2026) — added where not already followed */
    const { businesses, crews } = withTeamFollows({ businesses: followedBusinesses, crews: followedCrews }, teams);
    /* the same three kinds the person's own sheet lists, in the same order, so
       the two sheets cannot come to disagree about what "following" means.
       ⚠ The organizations segment was the fourth and went on 29 Sep 2026; the
       `follows` rows naming one are the sweep's.

       ⚠⚠ A BUSINESS ROW DREW AS INITIALS AND SAID ONLY ITS KIND (fixed 29 Sep
       2026, the user: "fix follow following list when it opens shows inaccurate
       details and counts"). `photoPath` was hard-coded null while the people and
       crews on either side of it carried theirs, so a studio you follow was the
       one row in the sheet with no face — the read never selected the column.
       And the sub-line said "Studio" where a person's says their CITY, which is
       both less informative and inconsistent: the kind is said with the place
       now, the way every other list in this app says it. */
    const rows: FollowListResult["rows"] = [
      ...people.map((f) => ({ id: f.followId, name: f.name, sub: f.city, href: `/person/${f.userId}`, photoPath: f.avatarPath })),
      ...businesses.map((t) => {
        const kind = t.businessType === "studio" ? "Studio" : "Artist";
        return {
          id: t.followId,
          name: t.businessName,
          sub: t.businessCity ? `${kind} · ${t.businessCity}` : kind,
          href: `/${t.businessType === "studio" ? "studio" : "artist"}/${t.businessId}`,
          photoPath: t.businessPhotoPath,
        };
      }),
      ...crews.map((c) => ({ id: c.followId, name: c.name, sub: c.city ? `Crew · ${c.city}` : "Crew", href: `/crew/${c.crewId}`, photoPath: c.photo })),
    ];
    return { error: null, rows };
  } catch {
    return { error: "That list could not be read just now.", rows: [] };
  }
}
