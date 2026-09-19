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
  const owned = teams.filter((m) => m.tenant.type === "studio" || m.tenant.type === "artist_page").map((m) => m.tenant);
  const lists = await Promise.all(owned.map((t) => findBusinessMemberships(supabase, t.id).catch(() => [])));
  const membership = lists.flat().find((m) => m.id === membershipId);
  if (!membership) {
    notFound();
  }
  const [holders, classes] = await Promise.all([
    findMembershipHolders(supabase, membershipId),
    findMembershipClassUsage(supabase, membershipId),
  ]);
  return <MembershipUsagePage membership={membership} holders={holders} classes={classes} />;
}
