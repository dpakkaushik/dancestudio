import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntityStatsPage } from "@/features/stats/components/EntityStatsPage";
import { OrgDashboard } from "@/features/tenants/components/OrgDashboard";
import { DOS_TINT } from "@/lib/design/tokens";
import { monthKeyOf, monthRefOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrgStats } from "@/repositories/orgStats";
import { findProfileById } from "@/repositories/profiles";
import { findPublicOrganization, findPublicOrganizationStudios } from "@/repositories/publicOrganization";
import { findEntityChartRow } from "@/repositories/stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/* the clock lives outside the component — this repo's lint refuses an impure
   call during render (react-hooks/purity), even in a server component */
const stampNowIso = (): string => new Date().toISOString();

/** /org/{id}/stats — an organization's standing (push 2, 19 Sep 2026). An
 *  organization has no board of its own — it teaches nothing and dances
 *  nothing — so its standing is its STUDIOS': a row per listed studio, each
 *  opening that studio's own record. Readable signed out for a PUBLIC
 *  organization, the way its page is.
 *
 *  ⚠⚠ AND WHEN THE SUBJECT IS YOU, THIS IS THE COMBINED DASHBOARD (22 Sep 2026).
 *  `/business/stats` drew `OrgDashboard` — the money and the fill, studio by
 *  studio — while this address drew the visitor's aggregate, so an organization
 *  reading its own id got the stranger's version of itself. `/business/stats`
 *  is a redirect here now; one address per subject, as C40 left profiles.
 *
 *  ⚠ THE OWNER BRANCH SITS ABOVE `findPublicOrganization`, AND THAT IS THE
 *  SAME LOAD-BEARING LINE `/org/{id}` HAS CARRIED SINCE C40: that read is
 *  `public_organization`, a definer read that answers only for a PUBLIC
 *  organization. Below it, an UNVERIFIED organization would meet `notFound()`
 *  on its own figures — the worst possible place to meet a visibility rule,
 *  and the exact trap the profile page was one line away from. */
export default async function OrgStatsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.id === orgId) {
    const profile = await findProfileById(supabase, orgId);
    if (!profile) {
      redirect("/onboarding");
    }
    if (profile.role === "org") {
      const rows = await findMyOrgStats(supabase);
      return <OrgDashboard rows={rows} monthName={monthRefOf(monthKeyOf(stampNowIso())).monthName} />;
    }
    /* your id is a person's, so your stats are your record — one subject, one
       address, and this is not it */
    redirect(`/person/${orgId}/stats`);
  }

  const org = await findPublicOrganization(supabase, orgId);
  if (!org) {
    notFound();
  }
  const studios = await findPublicOrganizationStudios(supabase, orgId);
  const rows = await Promise.all(studios.map((s) => findEntityChartRow(supabase, { segment: "studio", id: s.id })));
  const ranked = studios.map((s, i) => ({ id: s.id, name: s.name, row: rows[i] })).sort((a, b) => (a.row?.place ?? Number.MAX_SAFE_INTEGER) - (b.row?.place ?? Number.MAX_SAFE_INTEGER));
  return <EntityStatsPage name={org.name} eyebrow="Organization" segment="studio" accent={DOS_TINT.org} backHref={`/org/${orgId}`} standings={[]} studios={ranked} />;
}
