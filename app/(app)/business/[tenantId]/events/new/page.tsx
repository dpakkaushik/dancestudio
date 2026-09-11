import { redirect } from "next/navigation";
import { EventForm } from "@/features/events/components/EventForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/** Add event (prototype S_eventform). Owners and trainers create; the RPC
 *  enforces it too. */
export default async function NewEventPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) {
    redirect("/business");
  }
  const role = await findMyMembershipRole(supabase, tenantId);
  if (role !== "owner" && role !== "trainer") {
    redirect(`/business/${tenantId}/events`);
  }
  /* the city registry (11 Sep 2026): quick chips beside the venue, and where
     the map opens — it replaces the twelve hardcoded names */
  const cityCentres = await findDiscoverCities(supabase);
  return <EventForm tenantId={tenantId} existing={null} cityCentres={cityCentres} />;
}
