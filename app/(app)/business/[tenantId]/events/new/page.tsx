import { redirect } from "next/navigation";
import { EventForm } from "@/features/events/components/EventForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";
import { findWhyNoEvent } from "@/repositories/gst";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/** Add event (prototype S_eventform). Owners and trainers create; the RPC
 *  enforces it too.
 *
 *  ⚠ NO DOOR — nothing in the app links here, confirmed by a sweep on 28 Sep
 *  2026. Since C54 (22 Sep) the events desk opens this same form as a SHEET at
 *  `?new=1` on its own URL. The route stays under Rule 14 and still renders the
 *  form full page; `shoot-tiles.js` asserts both ends. Do not delete it. */
export default async function NewEventPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const businesses = await findMyTenants(supabase);
  if (!businesses.some((t) => t.id === tenantId)) {
    redirect("/business");
  }
  const role = await findMyMembershipRole(supabase, tenantId);
  if (role !== "owner" && role !== "trainer") {
    redirect(`/business/${tenantId}/events`);
  }
  /* AN EVENT NEEDS THE ORGANIZATION'S GST NUMBER (11 Sep 2026 — the user: "when
     a user goes in even without verification of GST it should redirect the user
     to this settings tab where he can do GST verification"). So this does not
     bounce them back to the desk they came from, which would be a door that
     closes with no way forward: it takes them to the screen that fixes it, and
     `?from=events` is what makes that screen say why they are standing there. */
  if (await findWhyNoEvent(supabase, tenantId)) {
    /* THIS organization's GST screen (26 Sep 2026) — the number is the business row's */
    redirect(`/business/${tenantId}/gst?from=events`);
  }
  /* the city registry (11 Sep 2026): quick chips beside the venue, and where
     the map opens — it replaces the twelve hardcoded names */
  const cityCentres = await findDiscoverCities(supabase);
  return <EventForm tenantId={tenantId} existing={null} cityCentres={cityCentres} />;
}
