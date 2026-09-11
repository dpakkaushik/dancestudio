import { redirect } from "next/navigation";
import { EventsDesk } from "@/features/events/components/EventsDesk";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenant } from "@/repositories/events";
import { findWhyNoEvent } from "@/repositories/gst";
import { findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** The events desk (prototype S_eventsmod). Since R15 (9 Sep 2026) the tenant
 *  here is the ORGANIZATION's own hosting row, not one of its studios — an
 *  event belongs to the organization and carries its own venue. An artist page
 *  still hosts its own. Any member reads the desk; the RPCs decide who may
 *  create, publish or delete, and `save_event` refuses a studio outright. */
export default async function TenantEventsPage({ params }: { params: Promise<{ tenantId: string }> }) {
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
  /* AN EVENT NEEDS THE ORGANIZATION'S GST NUMBER (11 Sep 2026): the sentence
     is the database's, and the desk prints it where Create event would be —
     with the door to /gst, which is where the number is entered. The desk
     itself still opens, because an organization with events already published
     must be able to read and run them while the number is missing. */
  const [events, whyNoEvent] = await Promise.all([findEventsByTenant(supabase, tenantId), findWhyNoEvent(supabase)]);
  return <EventsDesk tenantId={tenantId} events={events} todayKey={dayKeyOf(stampNowIso())} whyNoEvent={whyNoEvent} />;
}
