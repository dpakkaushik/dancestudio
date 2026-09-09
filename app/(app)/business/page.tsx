import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/tenants/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findMyOrgTenantId, findWhyNoStudio } from "@/repositories/orgStanding";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findMyMemberships } from "@/repositories/tenants";

/** /business — an organization's studios, or a person's one artist page. Who is
 *  here decides which hub is drawn (8 Sep 2026).
 *
 *  WHAT THIS PAGE NO LONGER FETCHES (R13, 9 Sep 2026): the verification request,
 *  the links count and the support threads. Where an organization stands with
 *  DanceOS, and its conversation with a DanceOS admin, moved to Home — this page
 *  asks only for the consequence: may a studio be created, and if not, why not. */
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
  // membership is the spine, and the ROLE on it decides which list a business
  // sits in — owned rows get their room count for the sub-line (prototype 2655)
  const [memberships, plan, whyNoStudio, eventsHostId] = await Promise.all([
    findMyMemberships(supabase),
    profile.role === "org" ? Promise.resolve(null) : findMyArtistPlan(supabase),
    /* the gate, in the database's own words (R14) */
    profile.role === "org" ? findWhyNoStudio(supabase).catch(() => null) : Promise.resolve(null),
    /* the organization's ONE events host (R15) — made on first ask */
    profile.role === "org" ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  const roomCounts = await countRoomsByTenants(
    supabase,
    memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant.id)
  );
  return (
    <BusinessHub
      memberships={memberships}
      roomCounts={roomCounts}
      role={profile.role}
      isArtist={Boolean(plan?.active)}
      whyNoStudio={whyNoStudio}
      eventsHostId={eventsHostId}
    />
  );
}
