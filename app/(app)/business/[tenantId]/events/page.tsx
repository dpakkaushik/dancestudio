import { redirect } from "next/navigation";
import { EventsDesk } from "@/features/events/components/EventsDesk";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenant } from "@/repositories/events";
import { findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** The studio's events desk (prototype S_eventsmod). Any member reads it; the
 *  RPCs decide who may create, publish or delete. */
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
