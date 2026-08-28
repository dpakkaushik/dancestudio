import { notFound, redirect } from "next/navigation";
import { EventManager } from "@/features/events/components/EventManager";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventBookings, findEventById } from "@/repositories/events";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** The event manager (prototype S_eventmanage 13946): Details, Participants,
 *  Spectators. Any member of the organiser reads it and runs the door — the
 *  RPCs say so too (`is_tenant_member`); editing stays with owners and trainers. */
export default async function EventManagePage({ params }: { params: Promise<{ tenantId: string; eventId: string }> }) {
  const { tenantId, eventId } = await params;
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
  const [role, event] = await Promise.all([findMyMembershipRole(supabase, tenantId), findEventById(supabase, eventId)]);
  if (!event || event.tenantId !== tenantId) {
    notFound();
  }
  const bookings = await findEventBookings(supabase, eventId);
  return <EventManager tenantId={tenantId} event={event} bookings={bookings} canRun={role === "owner" || role === "trainer"} todayKey={dayKeyOf(stampNowIso())} />;
}
