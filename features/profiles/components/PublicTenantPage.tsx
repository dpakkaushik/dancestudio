import { notFound, redirect } from "next/navigation";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantFollowers, isFollowingTenant } from "@/repositories/follows";
import { findPublicTenantProfile } from "@/repositories/publicProfile";
import { findMyMembershipRole } from "@/repositories/tenants";
import type { TenantType } from "@/types/tenant";
import { PublicProfile } from "./PublicProfile";

/* the clock lives outside the component (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

/** The public page of a business, for anybody — a stranger, a follower, or its
 *  own members. Not signed in is fine: RLS shows a listed business to everyone
 *  and an unlisted one to its members only, so "not found" is the honest answer
 *  for both a bad id and somebody else's private business. */
export async function PublicTenantPage({ tenantId, expect }: { tenantId: string; expect: TenantType }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = await findPublicTenantProfile(supabase, tenantId, stampNowIso());
  if (!profile) {
    notFound();
  }
  /* a studio opened under /artist (or the reverse) lands on its own address */
  if (profile.tenant.type !== expect) {
    redirect(publicProfilePath(profile.tenant));
  }

  const [following, role] = await Promise.all([
    user ? isFollowingTenant(supabase, tenantId) : Promise.resolve(false),
    user ? findMyMembershipRole(supabase, tenantId) : Promise.resolve(null),
  ]);

  /* WHO follows you is the owner's to read (B6). The policy would admit any
     member; the app asks only when the owner is the one looking, so the second
     query is not made for the other 99% of visits either. */
  const followers = role === "owner" ? await findTenantFollowers(supabase, tenantId) : null;

  return (
    <PublicProfile
      profile={profile}
      path={publicProfilePath(profile.tenant)}
      following={following}
      signedIn={Boolean(user)}
      isMember={role !== null}
      canEditPhoto={role === "owner" || role === "trainer"}
      canEdit={role === "owner"}
      followers={followers}
      scheduleHref={publicSchedulePath(profile.tenant)}
      manageHref={`/business/${tenantId}/classes`}
    />
  );
}
