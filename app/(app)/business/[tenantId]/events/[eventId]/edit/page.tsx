import { notFound, redirect } from "next/navigation";
import { EventForm } from "@/features/events/components/EventForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";
import { findEventById } from "@/repositories/events";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";

/** Edit event — every section pre-filled, the kind fixed (S_eventform 15803). */
export default async function EditEventPage({ params }: { params: Promise<{ tenantId: string; eventId: string }> }) {
  const { tenantId, eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* ⚠ the seat has to RUN the business (28 Sep 2026) — one read where this made
     two, and it is the same question both of the old tests were asking */
  const seat = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const event = await findEventById(supabase, eventId);
  if (!event || event.tenantId !== tenantId) {
    notFound();
  }
  const cityCentres = await findDiscoverCities(supabase);
  return <EventForm tenantId={tenantId} existing={event} cityCentres={cityCentres} />;
}
