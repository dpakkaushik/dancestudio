import { notFound, redirect } from "next/navigation";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantFollowers, isFollowingTenant } from "@/repositories/follows";
import { findTenantHeaderPhotos } from "@/repositories/headerPhotos";
import { findPublicTenantProfile } from "@/repositories/publicProfile";
import { findProfileById } from "@/repositories/profiles";
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

  const [following, role, viewer, header] = await Promise.all([
    user ? isFollowingTenant(supabase, tenantId) : Promise.resolve(false),
    user ? findMyMembershipRole(supabase, tenantId) : Promise.resolve(null),
    /* an organization follows nothing (8 Sep 2026) — the button is not drawn for one */
    user ? findProfileById(supabase, user.id) : Promise.resolve(null),
    /* THE HEADER (15 Sep 2026): the pictures that swipe across the top — the
       RPC decides what this viewer may see, and signs nothing it may not */
    findTenantHeaderPhotos(supabase, tenantId),
  ]);

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
      canFollow={viewer?.role !== "org"}
      isMember={role !== null}
      canEditPhoto={role === "owner" || role === "trainer"}
      canEdit={role === "owner"}
      /* the owner's own id, for the Edit sheet's header grid — a new picture
         goes into `proof/{owner}/…`, which is the only folder they may write */
      ownerId={role === "owner" ? (user?.id ?? null) : null}
      followers={followers}
      scheduleHref={publicSchedulePath(profile.tenant)}
      manageHref={profile.tenant.type === "studio" ? `/business/${tenantId}` : `/business/${tenantId}/classes`}
    />
  );
}
