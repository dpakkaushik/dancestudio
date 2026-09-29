import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantCalendar } from "@/repositories/calendar";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

const stampNowIso = (): string => new Date().toISOString();
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** The studio's calendar — every session of every class, room by room
 *  (prototype `StudioCalPage`, S_profiletab calendarOnly in studio mode). Any
 *  member of the studio may read it: RLS admits members to their business's
 *  classes, drafts included, and nobody else to the drafts. */
export default async function TenantCalendarPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* ⚠ the seat has to RUN the business (28 Sep 2026) — see the layout's switcher */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const business = seat.business;

  const now = stampNowIso();
  const months = monthsWindow(now, MONTHS_BACK, MONTHS_AHEAD);
  const fromIso = monthStartIso(months[0].key);
  const toIso = monthStartIso(shiftMonthKey(months[months.length - 1].key, -1));
  const entries = await findTenantCalendar(
    supabase,
    businessId,
    { name: business.name, city: business.city },
    fromIso,
    toIso
  );

  /* ⚠ THE EMPTY DAY'S DOOR IS THE REGISTER NOW, NOT THE FORM (22 Sep 2026, the
     user: "class should only be created from home tab … from inside their
     respective sections"). A class begins in the Classes section, so a day with
     nothing on it sends you there rather than straight into a form opened from
     a section that does not own it — and the compose ＋ this page used to pass
     is gone with it (`composeHref` is the organization's alone). */
  const emptyHref = `/business/${businessId}/classes`;
  return (
    <CalendarScreen
      mode="studio"
      months={months}
      todayKey={dayKeyOf(now)}
      entries={entries}
      emptyHref={emptyHref}
    />
  );
}
