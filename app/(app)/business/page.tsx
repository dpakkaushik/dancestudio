import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/tenants/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan, findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findDiscoverCities } from "@/repositories/cities";
import { findMyOrgTenantId, findWhyNoStudio } from "@/repositories/orgStanding";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findStudioVerificationStates } from "@/repositories/studioVerification";
import { findMyStudioSubscriptions } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/tenants";

/** /business — an organization's studios, or a person's one artist page. Who is
 *  here decides which hub is drawn (8 Sep 2026).
 *
 *  Since 10 Sep 2026 every studio row carries ITS OWN subscription: whether it
 *  is live, renews, or is ending; and — from the database — the one sentence
 *  between the studio and Discover, with the button that sets the mandate up.
 *  The verification timeline itself lives on Home (R13). */
export default async function BusinessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  const isOrg = profile.role === "org";
  // membership is the spine, and the ROLE on it decides which list a business
  // sits in — owned rows get their room count for the sub-line (prototype 2655)
  const [memberships, plan, whyNoStudio, eventsHostId, catalog, cityCentres] = await Promise.all([
    findMyMemberships(supabase),
    isOrg ? Promise.resolve(null) : findMyArtistPlan(supabase),
    /* the gate to CREATING a studio — verification, in the database's own words (R14) */
    isOrg ? findWhyNoStudio(supabase).catch(() => null) : Promise.resolve(null),
    /* the organization's ONE events host (R15) — made on first ask */
    isOrg ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
    isOrg ? findPlanCatalog(supabase).catch(() => []) : Promise.resolve([]),
    /* the cities that already have a business in them (11 Sep 2026) — the
       New-studio sheet's quick chips, and where its map opens. Replaces
       DOS_CITIES, which was twelve names nobody could add to. */
    findDiscoverCities(supabase),
  ]);
  const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
  const studioIds = owned.filter((t) => t.type === "studio").map((t) => t.id);
  const [roomCounts, studioSubscriptions, studioVerification] = await Promise.all([
    countRoomsByTenants(supabase, owned.map((t) => t.id)),
    isOrg ? findMyStudioSubscriptions(supabase, studioIds).catch(() => ({})) : Promise.resolve({}),
    /* WHERE EACH STUDIO STANDS WITH DANCEOS (11 Sep 2026): its badge, its
       photos, whether an admin is looking — one pair of reads for all of them */
    isOrg
      ? findStudioVerificationStates(
          supabase,
          owned.filter((t) => t.type === "studio").map((t) => ({ id: t.id, verifiedAt: t.verifiedAt }))
        )
      : Promise.resolve({}),
  ]);
  return (
    <BusinessHub
      memberships={memberships}
      roomCounts={roomCounts}
      role={profile.role}
      isArtist={Boolean(plan?.active)}
      whyNoStudio={whyNoStudio}
      eventsHostId={eventsHostId}
      studioSubscriptions={studioSubscriptions}
      studioVerification={studioVerification}
      userId={user.id}
      studioPrice={pickPlan(catalog, "studio")}
      cityCentres={cityCentres}
    />
  );
}
