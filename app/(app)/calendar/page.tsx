import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCalendar, findMyCalendarEvents } from "@/repositories/calendar";
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
 *  ⚠ THE ORGANIZATION BRANCH IS GONE (26 Sep 2026): it drew the organization
 *  LOGIN's events as its whole calendar (18 Sep, R21), and that login is
 *  retired. An organization is a business a person opens now, and the events
 *  it runs reach this person's calendar the way a studio's do — through
 *  `findMyCalendarEvents`, which already takes every business they are on. */
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

  const businesses = await findMyTenants(supabase);
  const tenantIds = businesses.map((t) => t.id);

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
