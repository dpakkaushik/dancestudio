import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OrganizationPublicPage } from "@/features/profiles/components/OrganizationPublicPage";
import { dayKeyOf } from "@/lib/format/month";
import { HEADER_MAX_ORG } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenants } from "@/repositories/events";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findProfileById } from "@/repositories/profiles";
import { findPublicOrganization, findPublicOrganizationStudios, findPublicOrganizationTeam } from "@/repositories/publicOrganization";
import { findPersonFollowerCounts, isFollowingPerson } from "@/repositories/publicPerson";

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
 *  already has (published, public host), scoped to its hosting row. SINCE 19 Sep
 *  2026 it also reads the organization's header pictures (public rows in the
 *  public bucket, up to ten) and whether the viewer follows it. */
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isMe = Boolean(user) && user!.id === orgId;
  const today = dayKeyOf(stampNowIso());
  const [studios, events, viewer, following, header, team, counts] = await Promise.all([
    findPublicOrganizationStudios(supabase, orgId),
    org.hostBusinessId ? findEventsByTenants(supabase, [org.hostBusinessId]).catch(() => []) : Promise.resolve([]),
    /* an organization viewer follows nothing — the toggle is not drawn for one */
    user && !isMe ? findProfileById(supabase, user.id) : Promise.resolve(null),
    user && !isMe ? isFollowingPerson(supabase, orgId) : Promise.resolve(false),
    findPersonHeaderPhotos(supabase, orgId, HEADER_MAX_ORG),
    /* OWNER and TEAM (push 2): the confirmed people it named, through the definer read */
    findPublicOrganizationTeam(supabase, orgId).catch(() => []),
    /* the count on the Follow button (19 Sep 2026, later) — `person_follower_counts` answers for a public organization */
    findPersonFollowerCounts(supabase, [orgId]),
  ]);
  const followers = counts.get(orgId)?.followers ?? null;
  /* what a visitor came for: the published events still to come, soonest first */
  const upcoming = events
    .filter((e) => e.status === "published" && e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <OrganizationPublicPage org={org} studios={studios} events={upcoming} team={team} header={header} isMe={isMe} following={following} followers={followers} canFollow={viewer?.role !== "org"} signedIn={Boolean(user)} />;
}
