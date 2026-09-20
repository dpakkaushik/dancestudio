import { redirect } from "next/navigation";
import { MembershipForm } from "@/features/memberships/components/MembershipForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /memberships/new — the form left the desk for a page of its own (21 Sep 2026,
 *  the user: "same should be for new routine and new membership").
 *
 *  ⚠ WHOSE MEMBERSHIP IT IS, RESOLVED HERE: the business you OWN — a studio's
 *  owner sells the studio's, an artist their own page's — which is the same rule
 *  the desk has followed since 19 Sep, read in the same place rather than passed
 *  through a URL somebody could edit. Nobody who owns one is sent back to the
 *  desk, which says so; `save_membership` refuses it either way. */
export default async function NewMembershipPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const teams = await findMyTeams(supabase).catch(() => []);
  /* an organization's hosting row sells nothing — a membership is spent on classes */
  const owned = teams.find((m) => m.memberRole === "owner" && (m.tenant.type === "studio" || m.tenant.type === "artist_page"))?.tenant ?? null;
  if (!owned) {
    redirect("/memberships");
  }
  return <MembershipForm sellerId={owned.id} sellerName={owned.name} />;
}
