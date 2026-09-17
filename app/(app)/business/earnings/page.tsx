import { redirect } from "next/navigation";
import { OrgEarnings } from "@/features/tenants/components/OrgEarnings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrgStats } from "@/repositories/orgStats";
import { findProfileById } from "@/repositories/profiles";

/* the clock lives outside the component (react-hooks/purity) */
const monthNameNow = (): string => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long" }).format(new Date());

/** /business/earnings — an ORGANIZATION's earnings, combined (18 Sep 2026). A
 *  person's earnings are their own ledger at /earnings; an organization's are
 *  its studios' and its events', which `my_org_stats()` sums per business the
 *  caller owns and this page adds up. Static segment: matched in the chrome
 *  before the studio id route, like /business/stats. */
export default async function OrgEarningsPage() {
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
  const rows = await findMyOrgStats(supabase);
  return <OrgEarnings rows={rows} monthName={monthNameNow()} />;
}
