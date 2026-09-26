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
import { findAskedByOrganizations, findMyPendingOrganizationAsks } from "@/repositories/organizationTeam";
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
  /* the ORGANIZATIONS this account owns (26 Sep 2026) — their team asks are its
     out-rows, one organization or several, each row wearing its own name */
  const ownedOrgs = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "org").map((m) => m.tenant);
  const orgNameById = new Map(ownedOrgs.map((t) => [t.id, t.name]));

  /* AN ANSWERED ASK STAYS ON THE DESK (19 Sep 2026, the user: "enquiries and
     requests don't get removed after accepting"): every ask read takes the
     answered rows too, newest first, and the row wears its answer. Team invites
     are the one kind the invitee cannot read back once answered (the table has
     no policy for them — `my_pending_invites` is the only door), so those go. */
  const ALL = ["asked", "confirmed", "rejected"] as const;
  const PARTNER_ALL = ["asked", "accepted", "declined"] as const;
  const [claimsIn, invitesIn, claimsOut, invitesOutByTenant, enquiriesToBusinesses, enquiriesToCrews, enquiriesOut, crewIn, crewOut, partnerIn, partnerOut, venueIn, venueOut, orgIn, orgAsked] = await Promise.all([
    findMyPendingClaims(supabase, [...ALL]),
    findMyPendingInvites(supabase),
    findAskedClaimsForTenants(supabase, tenantIds, [...ALL]),
    Promise.all(businesses.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, tenantName: t.name })))),
    findReceivedEnquiries(supabase, tenantIds),
    findReceivedEnquiriesForCrews(
      supabase,
      ledCrews.map((c) => c.id)
    ),
    findSentEnquiries(supabase, user.id),
    findMyPendingCrewAsks(supabase, [...ALL]),
    findAskedForMyCrews(supabase, [...ALL]),
    findMyPendingPartnerAsks(supabase, [...PARTNER_ALL]),
    findMyUnansweredPartners(supabase, [...PARTNER_ALL]),
    findVenueRequestsForTenants(supabase, ownedStudioIds).catch(() => []),
    findMyVenueAsks(supabase, ownedPageIds).catch(() => []),
    /* push 2: an organization naming you on its page (a person's in), and the
       people YOUR organizations are still waiting on (the owner's out, keyed
       on the businesses owned since 26 Sep 2026) — each read says whose rows
       it wants, so the other side is simply empty */
    findMyPendingOrganizationAsks(supabase, [...ALL]).catch(() => []),
    findAskedByOrganizations(
      supabase,
      ownedOrgs.map((t) => t.id),
      [...ALL]
    ).catch(() => []),
  ]);

  const { requestsIn, requestsOut } = buildRequests({
    venueIn,
    claimsIn,
    invitesIn,
    crewIn,
    partnerIn,
    orgIn,
    venueOut,
    claimsOut,
    invitesOut: invitesOutByTenant.flat(),
    crewOut,
    partnerOut,
    orgOut: orgAsked.map((m) => ({ ...m, orgName: orgNameById.get(m.orgId) ?? "Your organization" })),
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
