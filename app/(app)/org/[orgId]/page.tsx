import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OrganizationPublicPage } from "@/features/profiles/components/OrganizationPublicPage";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenants } from "@/repositories/events";
import { findFollowerCounts, isFollowingTenant } from "@/repositories/follows";
import { findTenantHeaderPhotos } from "@/repositories/headerPhotos";
import { findPublicOrganization, findPublicOrganizationTeam } from "@/repositories/publicOrganization";

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
  return org ? { title: `${org.name} — DanceOS`, description: `${org.name}${org.city ? `, ${org.city}` : ""} — events on DanceOS.` } : { title: "Organization — DanceOS" };
}

/** /org/{id} — an organization's public page (18 Sep 2026). Works signed out:
 *  the definer reads answer for a PUBLIC organization and for nobody else, so
 *  "not found" is the honest answer for a bad id, a private organization and a
 *  person's id alike. Its events come through the events policy the public
 *  already has (published, public host).
 *
 *  ⚠ KEYED ON THE BUSINESS SINCE 26 Sep 2026. The organization login is retired
 *  — an organization is a `businesses` row a person opens — so `{id}` is that
 *  row's id, its header pictures are its `studio_photos` (through
 *  `business_header_photos`, which admits a PUBLIC organization's to anyone),
 *  and following it is following the BUSINESS (`set_follow`). ⚠ There is no
 *  owner branch any more: the owner sees the public page exactly as a studio's
 *  owner does on `/studio/{id}` — their own screen is `/business/{id}`. And so
 *  an UNVERIFIED organization's page is `notFound()` to its owner too, which is
 *  right for the same reason an unlisted studio's is; the hub says why. */
export default async function OrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const org = await loadOrg(orgId);
  if (!org) {
    notFound();
  }
  const today = dayKeyOf(stampNowIso());
  const [events, following, header, team, counts] = await Promise.all([
    findEventsByTenants(supabase, [orgId]).catch(() => []),
    /* a business follow — `set_follow` admits a PUBLIC organization though its row is never listed */
    user ? isFollowingTenant(supabase, orgId).catch(() => false) : Promise.resolve(false),
    findTenantHeaderPhotos(supabase, orgId),
    /* OWNER and EVENT TEAM (push 2): the confirmed people it named, through the definer read */
    findPublicOrganizationTeam(supabase, orgId).catch(() => []),
    /* the count on the Follow bell — `follower_counts` is aggregate-only and anon-readable */
    findFollowerCounts(supabase, [orgId]).catch(() => new Map<string, number>()),
  ]);
  const followers = counts.get(orgId) ?? null;
  /* what a visitor came for: the published events still to come, soonest first */
  const upcoming = events
    .filter((e) => e.status === "published" && e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <OrganizationPublicPage org={org} events={upcoming} team={team} header={header} following={following} followers={followers} signedIn={Boolean(user)} />;
}
