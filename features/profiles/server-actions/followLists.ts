"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewFollowers, findMyFollowedCrews, findMyFollowedPeople, findMyFollowing, findTenantFollowers } from "@/repositories/follows";

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

const input = z.object({ kind: z.enum(["business", "crew"]), id: z.string().uuid() });

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
  try {
    const rows =
      parsed.data.kind === "business"
        ? (await findTenantFollowers(supabase, parsed.data.id)).map((f) => ({
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
export async function loadFollowingAction(): Promise<FollowListResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null, rows: [] };
  try {
    const [people, businesses, crews] = await Promise.all([
      findMyFollowedPeople(supabase),
      findMyFollowing(supabase),
      findMyFollowedCrews(supabase).catch(() => []),
    ]);
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
          sub: t.tenantCity ? `${kind} · ${t.tenantCity}` : kind,
          href: `/${t.businessType === "studio" ? "studio" : "artist"}/${t.businessId}`,
          photoPath: t.tenantPhotoPath,
        };
      }),
      ...crews.map((c) => ({ id: c.followId, name: c.name, sub: c.city ? `Crew · ${c.city}` : "Crew", href: `/crew/${c.crewId}`, photoPath: c.photo })),
    ];
    return { error: null, rows };
  } catch {
    return { error: "That list could not be read just now.", rows: [] };
  }
}
