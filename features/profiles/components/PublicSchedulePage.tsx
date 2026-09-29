import { notFound, redirect } from "next/navigation";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";
import { dayKeyOf, monthStartIso, monthsWindow, shiftMonthKey } from "@/lib/format/month";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublicTenantSchedule } from "@/repositories/calendar";
import { findPublicTenant } from "@/repositories/publicProfile";
import type { BusinessType } from "@/types/tenant";

const stampNowIso = (): string => new Date().toISOString();

/* a public schedule is an offer, so it starts today and looks three months out —
   there is no history on it to scroll back into */
const MONTHS_AHEAD = 3;

/** The prototype's `PubCal` (19140): S_profiletab calendarOnly pubSchedule —
 *  published classes still to come, one view, no switcher. */
export async function PublicSchedulePage({ businessId, expect }: { businessId: string; expect: BusinessType }) {
  const supabase = await createSupabaseServerClient();
  const business = await findPublicTenant(supabase, businessId);
  if (!business) {
    notFound();
  }
  /* ⚠ the `type === "org"` guard went with organizations (29 Sep 2026) — R15's,
     for a hosting row nobody browsed to */
  if (business.type !== expect) {
    redirect(publicSchedulePath(business));
  }

  const now = stampNowIso();
  const months = monthsWindow(now, 0, MONTHS_AHEAD);
  const toIso = monthStartIso(shiftMonthKey(months[months.length - 1].key, -1));
  const entries = await findPublicTenantSchedule(
    supabase,
    businessId,
    { name: business.name, city: business.city },
    now,
    toIso
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
