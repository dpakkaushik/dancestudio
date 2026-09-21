import { redirect } from "next/navigation";
import { MembershipsScreen } from "@/features/memberships/components/MembershipsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships, findMyMemberships } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /memberships — the Memberships tile (18 Sep 2026's grid), built 19 Sep 2026.
 *  Two sides on one page, because an ARTIST is the account that has both (the
 *  user: "artist should be able to create and track usage of memberships they
 *  have created AND memberships they have purchased"): YOURS, the passes you
 *  hold with their progress bars, and ON SALE, what the business you own sells.
 *
 *  ⚠⚠ WHICH business sells, RE-CUT 21 Sep 2026 (the user: "fix memberships for
 *  studio"): YOUR ARTIST PAGE, and only that. It used to be "the first business
 *  you own" — `teams.find(owner && (studio || artist_page))` — which is not a
 *  choice anybody made: an organization running two studios reached ONE of them,
 *  whichever came back first, and the second studio's memberships could not be
 *  read or made at all. A STUDIO's memberships live on the studio's own home
 *  now, beside its Classes, Rooms, Team and Earnings, where every other
 *  per-studio desk has always been. So this address means one thing: the passes
 *  you hold, and what you sell as an artist. */
export default async function MembershipsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [passes, teams] = await Promise.all([
    findMyMemberships(supabase).catch(() => []),
    findMyTeams(supabase).catch(() => []),
  ]);
  /* an organization's hosting row sells nothing — a membership is spent on classes */
  const owned = teams.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null;
  const selling = owned ? await findBusinessMemberships(supabase, owned.id).catch(() => []) : [];
  return <MembershipsScreen passes={passes} selling={selling} canSell={Boolean(owned)} />;
}
