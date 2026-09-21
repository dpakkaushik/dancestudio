import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OrganizationPublicPage } from "@/features/profiles/components/OrganizationPublicPage";
import { OwnProfileScreen } from "@/features/profiles/components/OwnProfileScreen";
import { dayKeyOf } from "@/lib/format/month";
import { HEADER_MAX_ORG } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenants } from "@/repositories/events";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isMe = Boolean(user) && user!.id === orgId;
  /* ⚠ THE OWNER BRANCH COMES BEFORE THE PUBLIC READ, AND THAT ORDER IS THE WHOLE
     POINT (21 Sep 2026). An organization's own profile lives here now — `/profile`
     is a redirect to it — and `findPublicOrganization` is a DEFINER read that
     answers only for a PUBLIC organization. Read it first and every organization
     that is not verified yet would have got `notFound()` on its OWN profile,
     which is precisely the account most likely to be looking at it. */
  if (isMe) {
    return <OwnProfileScreen userId={orgId} />;
  }
  const org = await loadOrg(orgId);
  if (!org) {
    notFound();
  }
  const today = dayKeyOf(stampNowIso());
  /* ⚠ THE VIEWER'S OWN PROFILE IS NO LONGER READ HERE (20 Sep 2026). It was
     fetched for one reason — "an organization viewer follows nothing", so the
     bell had to be drawn disabled for one — and an organization follows since
     `20260920180000_an_organization_follows`. One round trip fewer on a page a
     stranger opens. */
  const [studios, events, following, header, team, counts] = await Promise.all([
    findPublicOrganizationStudios(supabase, orgId),
    org.hostBusinessId ? findEventsByTenants(supabase, [org.hostBusinessId]).catch(() => []) : Promise.resolve([]),
    user && !isMe ? isFollowingPerson(supabase, orgId) : Promise.resolve(false),
    findPersonHeaderPhotos(supabase, orgId, HEADER_MAX_ORG),
    /* OWNER and TEAM (push 2): the confirmed people it named, through the definer read */
    findPublicOrganizationTeam(supabase, orgId).catch(() => []),
    /* the count on the Follow button (19 Sep 2026, later) — `person_follower_counts` answers for a public organization */
    findPersonFollowerCounts(supabase, [orgId]),
  ]);
  const followers = counts.get(orgId)?.followers ?? null;
  /* ⚠ AND WHAT IT FOLLOWS (20 Sep 2026, the user: "Organization and Studio still
     dont have Following section in profile and home"). `person_follower_counts`
     has always returned BOTH numbers in the one row — the page simply never read
     the second, because an organization could not follow until today. */
  const following_n = counts.get(orgId)?.following ?? null;
  /* what a visitor came for: the published events still to come, soonest first */
  const upcoming = events
    .filter((e) => e.status === "published" && e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <OrganizationPublicPage
      org={org}
      studios={studios}
      events={upcoming}
      team={team}
      header={header}
      isMe={isMe}
      following={following}
      followers={followers}
      followingN={following_n}
      signedIn={Boolean(user)}
    />
  );
}
