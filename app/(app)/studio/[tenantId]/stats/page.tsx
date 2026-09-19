import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { EntityStatsPage, type Standing } from "@/features/stats/components/EntityStatsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistPageOwner } from "@/repositories/publicOrganization";
import { findPublicTenant } from "@/repositories/publicProfile";
import { findEntityChartRow } from "@/repositories/stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /studio/{id}/stats — this studio's figures and its place on the studio board
 *  (push 2, 19 Sep 2026). Readable signed out for a LISTED studio, the way its
 *  page is; an unlisted one is nobody's to find. An artist page under this
 *  address is sent to its owner's record, since an artist is their profile. */
export default async function StudioStatsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const tenant = await findPublicTenant(supabase, tenantId);
  if (!tenant) {
    notFound();
  }
  if (tenant.type !== "studio") {
    const owner = await findArtistPageOwner(supabase, tenantId);
    redirect(owner ? `/person/${owner}/stats` : `/studio/${tenantId}`);
  }
  const [everywhere, inCity] = await Promise.all([
    findEntityChartRow(supabase, { segment: "studio", id: tenantId }),
    tenant.city ? findEntityChartRow(supabase, { segment: "studio", id: tenantId, city: tenant.city }) : Promise.resolve(null),
  ]);
  const standings: Standing[] = [{ scope: "Everywhere", row: everywhere }, ...(tenant.city ? [{ scope: `In ${tenant.city}`, row: inCity }] : [])];
  return <EntityStatsPage name={tenant.name} eyebrow="Studio" segment="studio" accent={gradientOf(tenant.name)[1]} backHref={`/studio/${tenantId}`} standings={standings} />;
}
