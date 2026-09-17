import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrgDashboard } from "@/features/tenants/components/OrgDashboard";
import { monthKeyOf, monthRefOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrgStats } from "@/repositories/orgStats";
import { findProfileById } from "@/repositories/profiles";

export const metadata: Metadata = { title: "Studios · combined — DanceOS" };

/* the clock lives outside the component — this repo's lint refuses an impure
   call during render (react-hooks/purity), even in a server component */
const stampNowIso = (): string => new Date().toISOString();

/** /business/stats — an ORGANIZATION's figures, combined and studio by studio
 *  (17 Sep 2026). The Stats tile on an organization's Home opens here; a
 *  person's opens /stats, their own record. Every number is `my_org_stats()`,
 *  scoped to the signed-in owner, so this page can only ever show your own. */
export default async function OrgStatsPage() {
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
  /* a person's stats are their record; this page is the organization's */
  if (profile.role !== "org") {
    redirect("/stats");
  }
  const rows = await findMyOrgStats(supabase);
  return <OrgDashboard rows={rows} monthName={monthRefOf(monthKeyOf(stampNowIso())).monthName} />;
}
