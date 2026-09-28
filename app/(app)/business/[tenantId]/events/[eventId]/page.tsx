import { notFound, redirect } from "next/navigation";
import { EventManager } from "@/features/events/components/EventManager";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventBookings, findEventById } from "@/repositories/events";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** The event manager (prototype S_eventmanage 13946): Details, Participants,
 *  Spectators, and the door — the gate list and the scanner.
 *  ⚠ A SEAT THAT RUNS THE BUSINESS (28 Sep 2026). This read "any member of the
 *  organiser", which since that morning means the gate list of a paid event was
 *  readable by anybody the organization had ever named. The RPCs underneath are
 *  still `is_business_member`, so this is a presentation gate over a wider one. */
export default async function EventManagePage({ params }: { params: Promise<{ tenantId: string; eventId: string }> }) {
  const { tenantId, eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const seat = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const event = await findEventById(supabase, eventId);
  if (!event || event.tenantId !== tenantId) {
    notFound();
  }
  const bookings = await findEventBookings(supabase, eventId);
  return <EventManager tenantId={tenantId} event={event} bookings={bookings} canRun={runsTheBusiness(seat.memberRole)} todayKey={dayKeyOf(stampNowIso())} />;
}
