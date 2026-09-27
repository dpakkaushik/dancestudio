import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { dayKeyOf, monthsWindow } from "@/lib/format/month";
import { findCrewPractices, practiceToCalendar } from "@/repositories/crewPractices";

const stampNowIso = (): string => new Date().toISOString();

/* the same window every other calendar uses: two months back, three ahead */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** A CREW'S CALENDAR (27 Sep 2026, the user: *"crews should also have a calendar
 *  tab"*). ⚠ Its calendar IS its practices, exactly as an organization's IS its
 *  events: a crew teaches no class and hosts no event of its own — it ENTERS
 *  events, which are somebody else's — so it is never offered the Classes ·
 *  Events · Practice switch and opens on the only half it has.
 *
 *  ⚠ The practices are NOT re-read here with a date window. `my_crew_practices`
 *  is already scoped to what this person may see and a crew has tens of these,
 *  not thousands; the calendar's own `inWindow` does the narrowing, so the desk
 *  and the calendar cannot come to disagree about what is on. */
export default async function CrewCalendarPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const now = stampNowIso();
  const practices = await findCrewPractices(supabase, crewId);
  return (
    <CalendarScreen
      mode="crew"
      months={monthsWindow(now, MONTHS_BACK, MONTHS_AHEAD)}
      todayKey={dayKeyOf(now)}
      entries={[]}
      practices={practices.map(practiceToCalendar)}
      emptyHref={`/crews/${crew.id}/manage/practice?new=1`}
    />
  );
}
