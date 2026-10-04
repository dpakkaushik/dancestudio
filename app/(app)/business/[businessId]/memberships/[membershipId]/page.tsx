import { MembershipUsageRoute } from "@/features/memberships/server/membershipUsageRoute";

/** /business/{studio}/memberships/{id} — a STUDIO's membership details, under
 *  the studio's own address (4 Oct 2026, the user: "Membership Details button on
 *  Studio membership cards taking to detail but profile shifts to artist").
 *  The profile switcher reads the pathname, so `/memberships/{id}` had left the
 *  studio; here the chrome stays the studio's. The membership must be this
 *  studio's own, or the page is not found. */
export default async function StudioMembershipUsageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; membershipId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { businessId, membershipId } = await params;
  const { show } = await searchParams;
  return <MembershipUsageRoute membershipId={membershipId} showParam={show} businessId={businessId} />;
}
