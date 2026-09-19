import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityStatsPage } from "@/features/stats/components/EntityStatsPage";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublicOrganization, findPublicOrganizationStudios } from "@/repositories/publicOrganization";
import { findEntityChartRow } from "@/repositories/stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /org/{id}/stats — an organization's standing (push 2, 19 Sep 2026). An
 *  organization has no board of its own — it teaches nothing and dances
 *  nothing — so its standing is its STUDIOS': a row per listed studio, each
 *  opening that studio's own record. Readable signed out for a PUBLIC
 *  organization, the way its page is; the organization's own combined figures
 *  stay on its Home's Stats chip (`/business/stats`), which is money and fill
 *  it alone may read. */
export default async function OrgStatsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const org = await findPublicOrganization(supabase, orgId);
  if (!org) {
    notFound();
  }
  const studios = await findPublicOrganizationStudios(supabase, orgId);
  const rows = await Promise.all(studios.map((s) => findEntityChartRow(supabase, { segment: "studio", id: s.id })));
  const ranked = studios.map((s, i) => ({ id: s.id, name: s.name, row: rows[i] })).sort((a, b) => (a.row?.place ?? Number.MAX_SAFE_INTEGER) - (b.row?.place ?? Number.MAX_SAFE_INTEGER));
  return <EntityStatsPage name={org.name} eyebrow="Organization" segment="studio" accent={DOS_TINT.org} backHref={`/org/${orgId}`} standings={[]} studios={ranked} />;
}
