import { redirect } from "next/navigation";
import { EarningsScreen } from "@/features/payouts/components/EarningsScreen";
import { OrgEarnings } from "@/features/tenants/components/OrgEarnings";
import { asPeriod } from "@/lib/format/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessEarnings } from "@/repositories/earnings";
import { findMyOrgStats } from "@/repositories/orgStats";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) */
const monthNameNow = (): string => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long" }).format(new Date());
const stampNowIso = (): string => new Date().toISOString();

/** /business/earnings — an ORGANIZATION's earnings, combined (18 Sep 2026). A
 *  person's earnings are their own ledger at /earnings; an organization's are
 *  its studios' and its events', which `my_org_stats()` sums per business the
 *  caller owns and this page adds up. Static segment: matched in the chrome
 *  before the studio id route, like /business/stats.
 *
 *  ⚠⚠ AND IT HAD NO EXPENSE SIDE AT ALL UNTIL 21 Sep 2026. It showed gross, a
 *  refunded figure and "net of refunds" — and an organization pays its people,
 *  refunds students and buys things, none of which this page could see. The
 *  shared `EarningsScreen` above reads every business the organization OWNS in
 *  one go, so Revenue, Expenses and what is left are the real combined
 *  three — and they move with the period, which this page never had.
 *
 *  ⚠ WHICH BUSINESSES: every one it owns, studios AND its hosting row. That is
 *  the set `/business/earnings` already summed and the set `/business/stats`
 *  did NOT — the two organization screens disagreed, and the map of them found
 *  it. This one is the union, which is what "combined" has to mean. */
export default async function OrgEarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const period = asPeriod((await searchParams).period);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  if (profile.role !== "org") {
    redirect("/earnings");
  }

  const [rows, teams] = await Promise.all([findMyOrgStats(supabase), findMyMemberships(supabase).catch(() => [])]);
  const owned = teams.filter((m) => m.memberRole === "owner").map((m) => m.tenant.id);
  const report = await findBusinessEarnings(supabase, owned, period, stampNowIso());

  return (
    <EarningsScreen
      report={report}
      title="Earnings"
      sub={`${owned.length} business${owned.length === 1 ? "" : "es"} · combined`}
      basePath="/business/earnings"
    >
      {/* the per-studio and per-event breakdown, which is this page's own and is
          a different cut from the by-SOURCE breakup above */}
      <OrgEarnings rows={rows} monthName={monthNameNow()} summary={false} />
    </EarningsScreen>
  );
}
