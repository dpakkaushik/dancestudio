import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantCalendar } from "@/repositories/calendar";
import { findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** The studio's calendar — every session of every class, room by room
 *  (prototype `StudioCalPage`, S_profiletab calendarOnly in studio mode). Any
 *  member of the studio may read it: RLS admits members to their tenant's
 *  classes, drafts included, and nobody else to the drafts. */
export default async function TenantCalendarPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tenants = await findMyTenants(supabase);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const now = stampNowIso();
  const months = monthsWindow(now, MONTHS_BACK, MONTHS_AHEAD);
  const fromIso = monthStartIso(months[0].key);
  const toIso = monthStartIso(shiftMonthKey(months[months.length - 1].key, -1));
  const entries = await findTenantCalendar(
    supabase,
    tenantId,
    { name: tenant.name, city: tenant.city },
    fromIso,
    toIso
  );

  const composeHref = `/business/${tenantId}/classes/new`;
  return (
    <CalendarScreen
      mode="studio"
      months={months}
      todayKey={dayKeyOf(now)}
      entries={entries}
      emptyHref={composeHref}
      composeHref={composeHref}
    />
  );
}
