import { notFound, redirect } from "next/navigation";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantFollowers, isFollowingTenant } from "@/repositories/follows";
import { findTenantHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findPublicTenantProfile } from "@/repositories/publicProfile";
import { findPersonFollowerCounts } from "@/repositories/publicPerson";
import { findMyMembershipRole } from "@/repositories/tenants";
import type { TenantType } from "@/types/tenant";
import { PublicProfile } from "./PublicProfile";

/** The public page of a business, for anybody — a stranger, a follower, or its
 *  own members. Not signed in is fine: RLS shows a listed business to everyone
 *  and an unlisted one to its members only, so "not found" is the honest answer
 *  for both a bad id and somebody else's private business. */
export async function PublicTenantPage({ tenantId, expect }: { tenantId: string; expect: TenantType }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* the tenant, its styles, its TEAM (19 Sep 2026) and its follower count, in one read set */
  const profile = await findPublicTenantProfile(supabase, tenantId);
  if (!profile) {
    notFound();
  }
  /* a studio opened under /artist (or the reverse) lands on its own address */
  if (profile.tenant.type !== expect) {
    redirect(publicProfilePath(profile.tenant));
  }

  /* ⚠ THE VIEWER'S OWN PROFILE IS NO LONGER READ (20 Sep 2026). It was fetched
     for one reason — "an organization follows nothing", so the bell had to be
     drawn disabled for one — and an organization follows since
     `20260920180000_an_organization_follows`. One round trip fewer on a page
     strangers open. */
  const [following, role, header, memberships, ownerCounts] = await Promise.all([
    user ? isFollowingTenant(supabase, tenantId) : Promise.resolve(false),
    user ? findMyMembershipRole(supabase, tenantId) : Promise.resolve(null),
    /* THE HEADER (15 Sep 2026): the pictures that swipe across the top — the
       RPC decides what this viewer may see, and signs nothing it may not */
    findTenantHeaderPhotos(supabase, tenantId),
    /* WHAT IT SELLS (19 Sep 2026): the live memberships of a listed business — anybody's to read */
    findMembershipsOnSale(supabase, tenantId),
    /* ⚠ WHAT THIS STUDIO FOLLOWS IS WHAT ITS OWNER FOLLOWS (20 Sep 2026, the
       user: "Organization and Studio still dont have Following section in
       profile and home"). A studio cannot follow ANYTHING on its own and never
       will without a schema change: `follows.follower_id` references `profiles`,
       and a studio is a `businesses` row with nothing to follow with. What runs
       the studio is an account, and that account's follows are the honest
       reading of the question. `person_follower_counts` hands back both numbers
       for a public organization or an artist, and nothing at all otherwise — in
       which case the figure is simply not drawn (`Figure` prints no zero it did
       not read). */
    (async () => {
      const owner = profile.team.find((m) => m.role === "owner");
      return owner ? findPersonFollowerCounts(supabase, [owner.userId]).catch(() => new Map()) : new Map();
    })(),
  ]);
  const ownerId0 = profile.team.find((m) => m.role === "owner")?.userId ?? null;
  const followingN = ownerId0 ? (ownerCounts.get(ownerId0)?.following ?? null) : null;

  /* WHO follows you is the owner's to read (B6). The policy would admit any
     member; the app asks only when the owner is the one looking, so the second
     query is not made for the other 99% of visits either. */
  const followers = role === "owner" ? await findTenantFollowers(supabase, tenantId) : null;

  return (
    <PublicProfile
      profile={profile}
      header={header}
      path={publicProfilePath(profile.tenant)}
      following={following}
      signedIn={Boolean(user)}
      followingN={followingN}
      isMember={role !== null}
      canEditPhoto={role === "owner" || role === "trainer"}
      canEdit={role === "owner"}
      /* the owner's own id, for the Edit sheet's header grid — a new picture
         goes into `proof/{owner}/…`, which is the only folder they may write */
      ownerId={role === "owner" ? (user?.id ?? null) : null}
      followers={followers}
      scheduleHref={publicSchedulePath(profile.tenant)}
      manageHref={profile.tenant.type === "studio" ? `/business/${tenantId}` : `/business/${tenantId}/classes`}
      memberships={memberships}
    />
  );
}
