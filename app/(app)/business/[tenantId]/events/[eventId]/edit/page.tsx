import { notFound, redirect } from "next/navigation";
import { EventForm } from "@/features/events/components/EventForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventById } from "@/repositories/events";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

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
  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) {
    redirect("/business");
  }
  const [role, event] = await Promise.all([findMyMembershipRole(supabase, tenantId), findEventById(supabase, eventId)]);
  if (!event || event.tenantId !== tenantId) {
    notFound();
  }
  if (role !== "owner" && role !== "trainer") {
    redirect(`/business/${tenantId}/events`);
  }
  return <EventForm tenantId={tenantId} existing={event} />;
}
