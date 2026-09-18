import { redirect } from "next/navigation";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants, findMyPendingClaims } from "@/repositories/claims";
import { findMyVenueAsks, findVenueRequestsForTenants } from "@/repositories/classes";
import { findAskedForMyCrews, findMyLedCrews, findMyPendingCrewAsks, findMyPendingPartnerAsks, findMyUnansweredPartners } from "@/repositories/crews";
import { findReceivedEnquiries, findReceivedEnquiriesForCrews, findSentEnquiries } from "@/repositories/enquiries";
import { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** Inbox tab — the prototype's S_chats: Requests and Enquiries, two desks that
 *  count what is waiting on you. Requests are rows that already exist (class
 *  claims, team invites), read from BOTH ends: what is asked of you, and what
 *  your businesses have asked of others. The mapping into rows lives in
 *  `features/inbox/requestItems.ts` since 18 Sep 2026, because a studio's inbox
 *  and a crew's inbox draw the same rows scoped to one entity. */
export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [profile, memberships, plan, ledCrews] = await Promise.all([
    findProfileById(supabase, user.id),
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    /* the crews you lead take enquiries too (18 Sep 2026); an organization leads none */
    findMyLedCrews(supabase).catch(() => []),
  ]);
  const businesses = memberships.map((m) => m.tenant);
  const tenantIds = businesses.map((t) => t.id);
  /* the rooms asked of the STUDIOS you own, and the rooms your own PAGE has asked for */
  const ownedStudioIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "studio").map((m) => m.tenant.id);
  const ownedPageIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "artist_page").map((m) => m.tenant.id);

  const [claimsIn, invitesIn, claimsOut, invitesOutByTenant, enquiriesToBusinesses, enquiriesToCrews, enquiriesOut, crewIn, crewOut, partnerIn, partnerOut, venueIn, venueOut] = await Promise.all([
    findMyPendingClaims(supabase),
    findMyPendingInvites(supabase),
    findAskedClaimsForTenants(supabase, tenantIds),
    Promise.all(businesses.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, tenantName: t.name })))),
    findReceivedEnquiries(supabase, tenantIds),
    findReceivedEnquiriesForCrews(
      supabase,
      ledCrews.map((c) => c.id)
    ),
    findSentEnquiries(supabase, user.id),
    findMyPendingCrewAsks(supabase),
    findAskedForMyCrews(supabase),
    findMyPendingPartnerAsks(supabase),
    findMyUnansweredPartners(supabase),
    findVenueRequestsForTenants(supabase, ownedStudioIds).catch(() => []),
    findMyVenueAsks(supabase, ownedPageIds).catch(() => []),
  ]);

  const { requestsIn, requestsOut } = buildRequests({
    venueIn,
    claimsIn,
    invitesIn,
    crewIn,
    partnerIn,
    venueOut,
    claimsOut,
    invitesOut: invitesOutByTenant.flat(),
    crewOut,
    partnerOut,
  });

  /* one desk: what your businesses were asked, and what your crews were asked, newest first */
  const enquiriesIn = [...enquiriesToBusinesses, ...enquiriesToCrews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const accent = DOS_TINT[kindOf(profile?.role ?? "user", Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
    />
  );
}
