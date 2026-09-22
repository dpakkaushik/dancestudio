import { redirect } from "next/navigation";
import { EventForm } from "@/features/events/components/EventForm";
import { EventsDesk } from "@/features/events/components/EventsDesk";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";
import { findEventsByTenant } from "@/repositories/events";
import { findWhyNoEvent } from "@/repositories/gst";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** The events desk (prototype S_eventsmod). Since R15 (9 Sep 2026) the tenant
 *  here is the ORGANIZATION's own hosting row, not one of its studios — an
 *  event belongs to the organization and carries its own venue. An artist page
 *  still hosts its own. Any member reads the desk; the RPCs decide who may
 *  create, publish or delete, and `save_event` refuses a studio outright. */
export default async function TenantEventsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenantId } = await params;
  const opening = (await searchParams).new === "1";
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
  /* AN EVENT NEEDS THE ORGANIZATION'S GST NUMBER (11 Sep 2026): the sentence
     is the database's, and the desk prints it where Create event would be —
     with the door to /gst, which is where the number is entered. The desk
     itself still opens, because an organization with events already published
     must be able to read and run them while the number is missing. */
  const [events, whyNoEvent] = await Promise.all([findEventsByTenant(supabase, tenantId), findWhyNoEvent(supabase)]);

  /* ⚠ THE FORM OPENS OVER THE DESK THAT OFFERS IT (22 Sep 2026, ask 6), and
     every gate `/events/new` keeps is re-checked HERE — a query parameter is a
     request, never an authority. The role check and the GST redirect are the
     new page's own, word for word, so typing `?new=1` can reach nothing the
     route could not. `/business/{id}/events/new` still renders full page
     (Rule 14: a link handed out is a promise). */
  let cityCentres: Awaited<ReturnType<typeof findDiscoverCities>> = [];
  if (opening) {
    const role = await findMyMembershipRole(supabase, tenantId);
    if (role !== "owner" && role !== "trainer") {
      redirect(`/business/${tenantId}/events`);
    }
    if (whyNoEvent) {
      redirect("/gst?from=events");
    }
    cityCentres = await findDiscoverCities(supabase);
  }

  return (
    <>
      <EventsDesk tenantId={tenantId} events={events} todayKey={dayKeyOf(stampNowIso())} whyNoEvent={whyNoEvent} />
      {opening ? <EventForm tenantId={tenantId} existing={null} cityCentres={cityCentres} sheet /> : null}
    </>
  );
}
