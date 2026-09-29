import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/businesses/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan, findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findDiscoverCities } from "@/repositories/cities";
import { findWhyNoStudio } from "@/repositories/orgStanding";
import { countRoomsByBusinesses } from "@/repositories/rooms";
import { findStudiosAttended } from "@/repositories/classBookings";
import { findStudioVerificationStates } from "@/repositories/studioVerification";
import { findMyStudioSubscriptions } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/businesses";

/** /business — the Studios hub: the studios this account RUNS, and for a person
 *  the studios they teach at and learn at.
 *
 *  ⚠ ANYBODY OPENS A STUDIO HERE SINCE 26 Sep 2026 (the user: "allow user and
 *  artist to create studios now from studios tab at home in a section …
 *  verification and subscription process remains the same"). The reads that
 *  used to be an organization's alone — the creation gate, the price list, each
 *  studio's subscription and its standing with DanceOS — are everybody's now,
 *  because a person's studio earns its badge and buys its mandate exactly as an
 *  organization's does. The only person-only read left is where they have
 *  LEARNT, because an organization books nothing.
 *
 *  Since 10 Sep 2026 every studio row carries ITS OWN subscription: whether it
 *  is live, renews, or is ending; and — from the database — the one sentence
 *  between the studio and Discover, with the button that sets the mandate up. */
export default async function BusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  /* which column the ADDRESS asks for — the URL is the state (19 Sep 2026) */
  const show = (await searchParams).show === "learned" ? "learned" : "own";
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
  const [memberships, plan, whyNoStudio, catalog, cityCentres] = await Promise.all([
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    /* the gate to CREATING a studio, in the database's own words — everybody's since 26 Sep 2026 */
    findWhyNoStudio(supabase).catch(() => null),
    /* ⚠ THE EVENTS HOST WAS NOT READ HERE FROM 15 Sep 2026, and there is no such
       row to read since 29 Sep: this hub is "Studios", and events are gone. */
    findPlanCatalog(supabase).catch(() => []),
    /* the cities that already have a business in them (11 Sep 2026) — the
       New-studio sheet's quick chips, and where its map opens. Replaces
       DOS_CITIES, which was twelve names nobody could add to. */
    findDiscoverCities(supabase),
  ]);
  const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.business);
  const studioIds = owned.filter((t) => t.type === "studio").map((t) => t.id);
  const [roomCounts, studioSubscriptions, studioVerification, attended] = await Promise.all([
    countRoomsByBusinesses(supabase, owned.map((t) => t.id)),
    findMyStudioSubscriptions(supabase, studioIds).catch(() => ({})),
    /* WHERE EACH STUDIO STANDS WITH DANCEOS (11 Sep 2026): its badge, its
       photos, whether an admin is looking — one pair of reads for all of them.
       A person with no studio pays nothing for it: both reads take the list. */
    findStudioVerificationStates(
      supabase,
      owned.filter((t) => t.type === "studio").map((t) => ({ id: t.id, verifiedAt: t.verifiedAt }))
    ),
    /* the Studios tile's second list for a person (18 Sep 2026): where they have been a student */
    findStudiosAttended(supabase, user.id).catch(() => []),
  ]);
  return (
    <BusinessHub
      memberships={memberships}
      attended={attended}
      show={show}
      roomCounts={roomCounts}
      isArtist={Boolean(plan?.active)}
      whyNoStudio={whyNoStudio}
      studioSubscriptions={studioSubscriptions}
      studioVerification={studioVerification}
      userId={user.id}
      studioPrice={pickPlan(catalog, "studio")}
      cityCentres={cityCentres}
    />
  );
}
