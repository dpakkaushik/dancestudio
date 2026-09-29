import { redirect } from "next/navigation";
import { MembershipForm } from "@/features/memberships/components/MembershipForm";
import { MembershipsScreen } from "@/features/memberships/components/MembershipsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessCardFacts } from "@/repositories/discovery";
import { findBusinessMemberships, findMyMemberships } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/businesses";

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
export default async function MembershipsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const opening = (await searchParams).new === "1";
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
  const owned = teams.find((m) => m.memberRole === "owner" && m.business.type === "artist_page")?.business ?? null;
  const selling = owned ? await findBusinessMemberships(supabase, owned.id).catch(() => []) : [];

  /** ⚠ WHO SOLD YOU THIS PASS, WITH THEIR FACE (28 Sep 2026, the user:
   *  "membership should have studio or artist photo with name"). The NAME has
   *  ridden on `my_memberships` all along; the photo does not, and widening that
   *  RETURNS TABLE would be a drop-and-recreate for a picture — so it is ONE
   *  second query over the businesses the passes name, exactly the shape
   *  Discover's own shelf uses (`findBusinessCardFacts`), never one read per row.
   *
   *  ⚠ It degrades rather than failing: a seller whose row this person may not
   *  read (an unlisted studio under "anyone reads listed businesses") comes back
   *  with no photo and the row draws initials — the rule the Faculty list has
   *  followed since Step 15. A pass is still a pass without a face on it. */
  const sellerIds = [...new Set(passes.map((p) => p.businessId))];
  const sellerFacts = sellerIds.length > 0 ? await findBusinessCardFacts(supabase, sellerIds).catch(() => new Map()) : new Map();
  const sellerPhotos: Record<string, string | null> = {};
  sellerIds.forEach((id) => {
    sellerPhotos[id] = sellerFacts.get(id)?.photoPath ?? null;
  });
  /* ⚠ `?new=1` opens the form over this desk (22 Sep 2026), and WHOSE membership
     it is comes from the same `owned` the desk itself is drawn from — so the
     seller is decided by the server on both paths, and the pointer that
     `/memberships/new?business=` had to carry is not needed here at all. The
     gate is re-checked because a query param is a thing anybody can type. */
  return (
    <>
      <MembershipsScreen passes={passes} selling={selling} canSell={Boolean(owned)} sellerPhotos={sellerPhotos} />
      {opening && owned ? <MembershipForm sellerId={owned.id} sellerName={owned.name} backTo="/memberships" sheet /> : null}
    </>
  );
}
