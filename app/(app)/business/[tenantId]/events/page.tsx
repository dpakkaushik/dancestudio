import { redirect } from "next/navigation";
import { EventsDesk } from "@/features/events/components/EventsDesk";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenant } from "@/repositories/events";
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
  const events = await findEventsByTenant(supabase, tenantId);
  return <EventsDesk tenantId={tenantId} events={events} todayKey={dayKeyOf(stampNowIso())} />;
}
