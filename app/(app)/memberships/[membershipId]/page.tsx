import { MembershipUsageRoute } from "@/features/memberships/server/membershipUsageRoute";

/** /memberships/{id} — one membership's usage, class-wise and student-wise
 *  (19 Sep 2026). The PERSON's address — an artist's own page sells it. A
 *  studio's membership has its own address under the studio since 4 Oct 2026
 *  (`/business/{id}/memberships/{id}`), so the switcher stays on the studio;
 *  this one still opens it for its team (Rule 14 — a link handed out stays). */
export default async function MembershipUsagePageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { membershipId } = await params;
  const { show } = await searchParams;
  return <MembershipUsageRoute membershipId={membershipId} showParam={show} />;
}
