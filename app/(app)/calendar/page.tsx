import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCalendar } from "@/repositories/calendar";
import { findMyCrewPractices, practiceToCalendar } from "@/repositories/crewPractices";

/* the clock lives outside the component (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

/* two months of history and three ahead: the schedule opens on today, and
   history is something you scroll back into rather than go looking for
   (prototype 9327); the deep record is the Stats page's, Step 25 */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** Your calendar — what you train in, teach and assist, and the practices of
 *  every crew you are on (prototype `CalTab`, S_profiletab calendarOnly).
 *
 *  ⚠⚠ THE EVENTS HALF IS GONE (29 Sep 2026, the user: "remove Organization and
 *  Events completely"). It was R21 (18 Sep): the tickets you held, the entries
 *  you had made and the events run by a business you were on, one row per day an
 *  event covered, behind the Classes · Events switch. With it went
 *  `findMyCalendarEvents` and the `findMyTenants` read that fed it — so this
 *  page makes two round trips where it made three. */
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

  const [entries, practices] = await Promise.all([
    findMyCalendar(supabase, user.id, fromIso, toIso),
    /* ⚠ AND THE PRACTICES OF EVERY CREW THIS PERSON IS ON (27 Sep 2026, the
       user: "practice also get added to calendar"). `my_crew_practices` is
       scoped to `auth.uid()` inside its own SQL and takes no user id, so this
       can only ever be the caller's own — and it answers an EMPTY LIST rather
       than throwing, because a crew's rehearsals must never be the reason
       somebody's whole calendar refuses to render. */
    findMyCrewPractices(supabase, { from: fromIso, to: toIso }),
  ]);

  return (
    <CalendarScreen
      mode="personal"
      months={months}
      todayKey={todayKey}
      entries={entries}
      practices={practices.map(practiceToCalendar)}
      emptyHref="/discover"
    />
  );
}
