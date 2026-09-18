import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessCalendarEvents, findMyCalendar, findMyCalendarEvents } from "@/repositories/calendar";
import { findMyOrgTenantId } from "@/repositories/orgStanding";
import { findProfileById } from "@/repositories/profiles";
import { findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

/* two months of history and three ahead: the schedule opens on today, and
   history is something you scroll back into rather than go looking for
   (prototype 9327); the deep record is the Stats page's, Step 25 */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** Your calendar — what you train in, teach and assist, and the events you hold
 *  a ticket for or are running (prototype `CalTab`, S_profiletab calendarOnly).
 *
 *  ⚠ AN ORGANIZATION GETS ITS OWN CALENDAR HERE (18 Sep 2026). It books no
 *  class, teaches none and assists on none — `guard_person_only` refuses an
 *  organization every one of those seats — so this page could only ever draw it
 *  an empty schedule, under a heading that offered to find it a class Discover
 *  would not let it book. What an organization actually runs is EVENTS, so that
 *  is what its calendar is. */
export default async function CalendarPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const now = stampNowIso();
  const months = monthsWindow(now, MONTHS_BACK, MONTHS_AHEAD);
  const fromIso = monthStartIso(months[0].key);
  const toIso = monthStartIso(shiftMonthKey(months[months.length - 1].key, -1));
  const todayKey = dayKeyOf(now);

  const [profile, businesses] = await Promise.all([findProfileById(supabase, user.id), findMyTenants(supabase)]);
  const tenantIds = businesses.map((t) => t.id);

  if (profile?.role === "org") {
    /* every business it owns, the hosting row included — that row is where its
       events live (R15), and the others are its studios */
    const [events, hostId] = await Promise.all([
      findBusinessCalendarEvents(supabase, tenantIds, fromIso, toIso),
      findMyOrgTenantId(supabase).catch(() => null),
    ]);
    const desk = hostId ? `/business/${hostId}/events` : "/business";
    return (
      <CalendarScreen
        mode="org"
        months={months}
        todayKey={todayKey}
        entries={[]}
        events={events}
        emptyHref={desk}
        composeHref={hostId ? "/events/new" : desk}
      />
    );
  }

  const [entries, events] = await Promise.all([
    findMyCalendar(supabase, user.id, fromIso, toIso),
    findMyCalendarEvents(supabase, user.id, tenantIds, fromIso, toIso),
  ]);

  return (
    <CalendarScreen
      mode="personal"
      months={months}
      todayKey={todayKey}
      entries={entries}
      events={events}
      emptyHref="/discover"
    />
  );
}
