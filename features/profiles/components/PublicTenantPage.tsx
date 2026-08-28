import { notFound, redirect } from "next/navigation";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isFollowingTenant } from "@/repositories/follows";
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

  return (
    <PublicProfile
      profile={profile}
      path={publicProfilePath(profile.tenant)}
      following={following}
      signedIn={Boolean(user)}
      isMember={role !== null}
      scheduleHref={publicSchedulePath(profile.tenant)}
      manageHref={`/business/${tenantId}/classes`}
    />
  );
}
