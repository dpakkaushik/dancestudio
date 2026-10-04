import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/businesses";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /memberships/{id} — AN ADDRESS NOW, NOT A SECOND COPY OF THE PAGE (5 Oct 2026).
 *
 *  It drew the same membership details as `/business/{studio}/memberships/{id}`
 *  through the same `MembershipUsageRoute`, and the one difference was the
 *  wrong one: the switcher reads the PATHNAME, so opening a studio's membership
 *  here left the studio and the profile fell back to the person (the user, on
 *  4 Oct: "profile shifts to artist"). Since 4 Oct only a studio sells, so every
 *  membership a person can manage has a studio address. The last link that
 *  still opened this one (a payment row on a student's Earnings column) points
 *  at the studio's address now.
 *
 *  ⚠ A REDIRECT RATHER THAN A next.config FORWARD, because the destination
 *  needs the SELLER, which only a read can say. The seller is looked up the way
 *  the page always looked it up — among the businesses THIS person is on the
 *  team of — so somebody else's membership is still "not found", as before.
 *  The `?show=` column rides along. Rule 14: a link handed out stays good. */
export default async function MembershipAddressRoute({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { membershipId } = await params;
  const { show } = await searchParams;
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
  const sellers = teams.filter((m) => m.business.type === "studio" || m.business.type === "artist_page").map((m) => m.business);
  const lists = await Promise.all(sellers.map((b) => findBusinessMemberships(supabase, b.id).catch(() => [])));
  const idx = lists.findIndex((l) => l.some((m) => m.id === membershipId));
  if (idx < 0) {
    notFound();
  }
  const column = show === "earnings" ? "?show=earnings" : "";
  redirect(`/business/${sellers[idx].id}/memberships/${membershipId}${column}`);
}
