import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OrganizationPublicPage } from "@/features/profiles/components/OrganizationPublicPage";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenants } from "@/repositories/events";
import { findPublicOrganization, findPublicOrganizationStudios } from "@/repositories/publicOrganization";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stampNowIso = (): string => new Date().toISOString();

const loadOrg = cache(async (orgId: string) => {
  const supabase = await createSupabaseServerClient();
  return findPublicOrganization(supabase, orgId);
});

export async function generateMetadata({ params }: { params: Promise<{ orgId: string }> }): Promise<Metadata> {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) return { title: "Organization — DanceOS" };
  const org = await loadOrg(orgId);
  return org ? { title: `${org.name} — DanceOS`, description: `${org.name}${org.city ? `, ${org.city}` : ""} — studios and events on DanceOS.` } : { title: "Organization — DanceOS" };
}

/** /org/{id} — an organization's public page (18 Sep 2026). Works signed out:
 *  the three definer reads answer for a PUBLIC organization and for nobody else,
 *  so "not found" is the honest answer for a bad id, a private organization and
 *  a person's id alike. Its events come through the events policy the public
 *  already has (published, public host), scoped to its hosting row. */
export default async function OrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    notFound();
  }
  const org = await loadOrg(orgId);
  if (!org) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const today = dayKeyOf(stampNowIso());
  const [studios, events] = await Promise.all([
    findPublicOrganizationStudios(supabase, orgId),
    org.hostBusinessId ? findEventsByTenants(supabase, [org.hostBusinessId]).catch(() => []) : Promise.resolve([]),
  ]);
  /* what a visitor came for: the published events still to come, soonest first */
  const upcoming = events
    .filter((e) => e.status === "published" && e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <OrganizationPublicPage org={org} studios={studios} events={upcoming} />;
}
