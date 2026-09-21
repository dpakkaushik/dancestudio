import { redirect } from "next/navigation";
import { MembershipForm } from "@/features/memberships/components/MembershipForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /memberships/new — the form left the desk for a page of its own (21 Sep 2026,
 *  the user: "same should be for new routine and new membership").
 *
 *  ⚠ WHOSE MEMBERSHIP IT IS, RESOLVED HERE: `?business=` when a studio's own
 *  desk sent you, else the artist page you own. The id in the URL is a POINTER,
 *  never an authority — it is looked up in the businesses this person OWNS, so
 *  editing it to somebody else's studio lands back on the desk rather than on a
 *  form, and `save_membership` refuses it a second time either way.
 *
 *  ⚠ IT USED TO BE "the first business you own" (19 Sep), which is how an
 *  organization with two studios could only ever sell from one of them — and
 *  worse, could fill this form from the second studio's desk and make the
 *  membership against the first. */
export default async function NewMembershipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { business } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const teams = await findMyTeams(supabase).catch(() => []);
  /* an organization's hosting row sells nothing — a membership is spent on classes */
  const sellers = teams.filter((m) => m.memberRole === "owner" && (m.tenant.type === "studio" || m.tenant.type === "artist_page")).map((m) => m.tenant);
  const owned = (business ? sellers.find((t) => t.id === business) : sellers.find((t) => t.type === "artist_page")) ?? null;
  if (!owned) {
    /* back to the desk that sent them, which says why there is nothing to sell from */
    redirect(business ? `/business/${business}/memberships` : "/memberships");
  }
  return <MembershipForm sellerId={owned.id} sellerName={owned.name} backTo={owned.type === "studio" ? `/business/${owned.id}/memberships` : "/memberships"} />;
}
