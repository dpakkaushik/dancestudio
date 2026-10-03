import { notFound, redirect } from "next/navigation";
import { MembershipUsagePage } from "@/features/memberships/components/MembershipUsagePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships, findMembershipClassUsage, findMembershipHolders, findPassUsesMany } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/businesses";
import { findProfileById } from "@/repositories/profiles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /memberships/{id} — one membership's usage, class-wise and student-wise
 *  (19 Sep 2026). The membership is found in the caller's OWN business's list
 *  rather than read by id, so "not found" is the honest answer for somebody
 *  else's — and the two usage reads answer nobody but the seller's team anyway. */
export default async function MembershipUsageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { membershipId } = await params;
  const show = (await searchParams).show === "earnings" ? "earnings" : "holders";
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
  /* which classes EACH holder spent theirs on (30 Sep 2026) — one `pass_uses`
     per holder who has spent anything, in parallel; the RPC admits the seller's team */
  const usesByPass = await findPassUsesMany(supabase, holders);
  /* ⚠ THE OWNER SEAT, not merely a seat on the seller's team (28 Sep 2026):
     this page admits every member — a trainer reads the usage — and
     `delete_membership` admits the OWNER alone. Offering the control to a
     trainer would be a button whose only possible answer is a refusal. */
  const isOwner = teams.some((t) => t.business.id === owned[sellerIdx].id && t.memberRole === "owner");
  /* WHO SELLS IT — the profile the page leads with, as its card does (3 Oct
     2026): a studio is itself; an artist page IS its owner, so the owner's own
     face and name when the reader is that owner, the page's otherwise */
  const sellerBiz = owned[sellerIdx];
  const isArtist = sellerBiz.type === "artist_page";
  const me = isArtist && isOwner ? await findProfileById(supabase, user.id).catch(() => null) : null;
  const seller = {
    name: me?.fullName ?? sellerBiz.name,
    photoPath: me?.avatarPath ?? sellerBiz.photoPath ?? null,
    kind: isArtist ? ("artist" as const) : ("studio" as const),
    href: isArtist ? (isOwner ? `/person/${user.id}` : `/artist/${sellerBiz.id}`) : `/studio/${sellerBiz.id}`,
  };
  return <MembershipUsagePage membership={membership} holders={holders} classes={classes} canManage={isOwner} usesByPass={usesByPass} seller={seller} show={show} />;
}
