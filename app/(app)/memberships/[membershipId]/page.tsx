import { notFound, redirect } from "next/navigation";
import { MembershipUsagePage } from "@/features/memberships/components/MembershipUsagePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships, findMembershipClassUsage, findMembershipHolders } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /memberships/{id} — one membership's usage, class-wise and student-wise
 *  (19 Sep 2026). The membership is found in the caller's OWN business's list
 *  rather than read by id, so "not found" is the honest answer for somebody
 *  else's — and the two usage reads answer nobody but the seller's team anyway. */
export default async function MembershipUsageRoute({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  if (!UUID_RE.test(membershipId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const teams = await findMyTeams(supabase).catch(() => []);
  const owned = teams.filter((m) => m.business.type === "studio" || m.business.type === "artist_page").map((m) => m.business);
  const lists = await Promise.all(owned.map((t) => findBusinessMemberships(supabase, t.id).catch(() => [])));
  /* ⚠ WHICH list it was in is the membership's seller — `MembershipWithUsage`
     carries no business id, and `lists[i]` belongs to `owned[i]` by
     construction, so the index is the answer without widening a type. */
  const sellerIdx = lists.findIndex((l) => l.some((m) => m.id === membershipId));
  const membership = sellerIdx >= 0 ? lists[sellerIdx].find((m) => m.id === membershipId) : undefined;
  if (!membership) {
    notFound();
  }
  const [holders, classes] = await Promise.all([
    findMembershipHolders(supabase, membershipId),
    findMembershipClassUsage(supabase, membershipId),
  ]);
  /* ⚠ THE OWNER SEAT, not merely a seat on the seller's team (28 Sep 2026):
     this page admits every member — a trainer reads the usage — and
     `delete_membership` admits the OWNER alone. Offering the control to a
     trainer would be a button whose only possible answer is a refusal. */
  const isOwner = teams.some((t) => t.business.id === owned[sellerIdx].id && t.memberRole === "owner");
  return <MembershipUsagePage membership={membership} holders={holders} classes={classes} canManage={isOwner} />;
}
