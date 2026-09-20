import { redirect } from "next/navigation";
import { MyProfilePage } from "@/features/profiles/components/MyProfilePage";
import { headerMaxFor } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyFollowedCrews, findMyFollowedOrganizations, findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findPublicPerson } from "@/repositories/publicPerson";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyTenants } from "@/repositories/tenants";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyGst } from "@/repositories/gst";
import { kindOf } from "@/types/profile";

/** The Profile tab — prototype S_profiletab's own render, lifted in
 *  `MyProfilePage`, with the Settings sheet behind the chrome's gear
 *  (`?settings=1`, prototype 19263). Everything on it is a row this app keeps:
 *  the profile with its fields, the person's followers and the people,
 *  businesses, organizations and crews they follow, and the same crews /
 *  teaches-at / runs groups the person page draws. Where they stand on a board
 *  left this page on 19 Sep 2026 — the Stats chip is the door to it. */
export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const person = await findPublicPerson(supabase, user.id);
  if (!person) {
    redirect("/onboarding");
  }
  const role = person.profile.role;
  /* what reaches you left this page on 19 Sep 2026 — the bell's own screen carries it, once */
  const [followers, followingPeople, followingTenants, followingOrgs, followingCrews, tenants, plan, isAdmin, gst, memberships] = await Promise.all([
    findMyPersonFollowers(supabase),
    findMyFollowedPeople(supabase),
    findMyFollowing(supabase),
    /* the two kinds that became followable on 19 Sep 2026.
       ⚠ AN ORGANIZATION ASKS FOR ALL FOUR NOW (20 Sep 2026): it follows since
       `20260920180000_an_organization_follows`, so its Following figure counts
       real rows rather than being withheld. */
    findMyFollowedOrganizations(supabase),
    findMyFollowedCrews(supabase),
    findMyTenants(supabase),
    findMyArtistPlan(supabase),
    amIPlatformAdmin(supabase),
    /* the Settings sheet's GST row says verified or not (11 Sep 2026); only an
       organization has the row, so only an organization is asked about it */
    role === "org" ? findMyGst(supabase, person.profile.id) : Promise.resolve({ gstin: null, verifiedAt: null }),
    /* ⚠ WHAT YOU SELL, ON YOUR OWN TAB TOO (20 Sep 2026). /person/{id} has drawn
       an artist's live memberships since 19 Sep and this screen drew none, so an
       artist saw one thing on their public page and another on their own — one
       of the five ways the two had drifted. A failed read is no block, never a
       profile that will not open. */
    person.artistPageId ? findMembershipsOnSale(supabase, person.artistPageId).catch(() => []) : Promise.resolve([]),
  ]);
  /* THE HEADER (15 Sep 2026): the KIND decides how many — one for a user, five
     for an artist, ten for an organization (19 Sep 2026) — the same rule the
     database keeps on the way in */
  const headerMax = headerMaxFor(kindOf(role, Boolean(plan?.active)));
  /* ⚠ THE RANK IS NOT READ HERE ANY MORE (19 Sep 2026, the user: "remove rank
     from profile tab") — `findMyPlace` was the only reason this page made a
     second round trip, so the header is the whole of it now. Where you stand is
     the Stats chip's own screen, with its population beside it. */
  const header = await findPersonHeaderPhotos(supabase, user.id, headerMax);
  /* Schedule goes to the public schedule of the business this person runs —
     a trainer's own (prototype `hasSchedule` = mode === "trainer", 10868); with
     none, the button is not drawn rather than pointing nowhere */
  /* R15 (9 Sep 2026): an organization's event-hosting row is a tenant but not
     one of its BUSINESSES — it is unlisted for ever, has no rooms and no public
     page. It is filtered out here so "Your studios" counts studios and the
     Schedule button never points at a page that does not exist. */
  const businesses = tenants.filter((t) => t.type !== "org");
  const biz = businesses.find((t) => t.type === "artist_page") ?? businesses[0];
  const scheduleHref = biz ? `/${biz.type === "studio" ? "studio" : "artist"}/${biz.id}/schedule` : null;

  return (
    <MyProfilePage
      person={person}
      header={header}
      headerMax={headerMax}
      followers={followers}
      followingPeople={followingPeople}
      followingTenants={followingTenants}
      followingOrgs={followingOrgs}
      followingCrews={followingCrews}
      scheduleHref={scheduleHref}
      business={biz ?? null}
      businesses={businesses}
      memberships={memberships}
      plan={plan}
      isAdmin={isAdmin}
      gstVerified={Boolean(gst.verifiedAt)}
    />
  );
}
