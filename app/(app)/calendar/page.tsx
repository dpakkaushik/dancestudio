import { redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCalendar } from "@/repositories/calendar";

/* the clock lives outside the component (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

/* two months of history and three ahead: the schedule opens on today, and
   history is something you scroll back into rather than go looking for
   (prototype 9327); the deep record is the Stats page's, Step 25 */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** Your calendar — what you train in, teach and assist, one schedule
 *  (prototype `CalTab`, S_profiletab calendarOnly). */
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
  const entries = await findMyCalendar(supabase, user.id, fromIso, toIso);

  return (
    <CalendarScreen mode="personal" months={months} todayKey={dayKeyOf(now)} entries={entries} emptyHref="/discover" />
  );
}
