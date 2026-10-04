import { notFound, redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthsWindow } from "@/lib/format/month";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PUBLIC_SCHEDULE_MONTHS, findPublicBusinessSchedule, publicScheduleToIso } from "@/repositories/calendar";
import { findPublicBusiness, findPublicStudioTeam } from "@/repositories/publicProfile";
import type { BusinessType } from "@/types/business";

const stampNowIso = (): string => new Date().toISOString();

/* ⚠ HOW FAR IT LOOKS IS THE REPOSITORY'S (30 Sep 2026) — `PUBLIC_SCHEDULE_MONTHS`
   and `publicScheduleToIso`, so the NEXT SESSIONS summary on the profile page
   whose bar opens this screen cannot come to a different answer about what
   "upcoming" means. It was a local `MONTHS_AHEAD` until that second reader. */

/** The prototype's `PubCal` (19140): S_profiletab calendarOnly pubSchedule —
 *  published classes still to come, one view, no switcher. */
export async function PublicSchedulePage({ businessId, expect }: { businessId: string; expect: BusinessType }) {
  const supabase = await createSupabaseServerClient();
  const business = await findPublicBusiness(supabase, businessId);
  if (!business) {
    notFound();
  }
  /* ⚠ the `type === "org"` guard went with organizations (29 Sep 2026) — R15's,
     for a hosting row nobody browsed to */
  if (business.type !== expect) {
    redirect(publicSchedulePath(business));
  }

  const now = stampNowIso();
  const months = monthsWindow(now, 0, PUBLIC_SCHEDULE_MONTHS);
  /* ⚠⚠ AN ARTIST'S SCHEDULE IS EVERY CLASS THEY TEACH (5 Oct 2026) — not only
     the ones their page owns. Its owner comes off `public_studio_team`, the
     definer read that already names an artist page's people to a stranger
     (anon cannot call `business_owner`); a studio's schedule is its own and
     passes nobody. */
  const teacherId =
    business.type === "artist_page"
      ? ((await findPublicStudioTeam(supabase, businessId).catch(() => [])).find((m) => m.role === "owner")?.userId ?? null)
      : null;
  const entries = await findPublicBusinessSchedule(
    supabase,
    businessId,
    { name: business.name, city: business.city },
    now,
    publicScheduleToIso(now),
    teacherId
  );

  return (
    <CalendarScreen
      mode="public"
      title={business.name}
      months={months}
      todayKey={dayKeyOf(now)}
      entries={entries}
      emptyHref={publicProfilePath(business)}
    />
  );
}
