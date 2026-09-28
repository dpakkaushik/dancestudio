import { redirect } from "next/navigation";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants, findMyPendingClaims } from "@/repositories/claims";
import { findMyVenueAsks, findVenueRequestsForTenants } from "@/repositories/classes";
import { findAskedForMyCrews, findMyPendingCrewAsks } from "@/repositories/crews";
import { findMyCrewPractices } from "@/repositories/crewPractices";
import { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
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

  /* ⚠ NO ENQUIRY READS HERE ANY MORE (27 Sep 2026, the user: "only enquiry
     becomes a new option in tab and is removed from inbox"). Three reads and
     the crews-you-lead lookup went with the section — so this tab costs less
     than it did, and `/enquiries` pays for exactly what it draws. */
  /* ⚠ THE PROFILE READ WENT WITH ORGANIZATIONS (29 Sep 2026): it was asked for
     one thing, the accent `kindOf` paints this desk with, and the KIND is the
     plan's answer alone now. One round trip fewer. */
  const [memberships, plan] = await Promise.all([findMyMemberships(supabase), findMyArtistPlan(supabase)]);
  const businesses = memberships.map((m) => m.tenant);
  const tenantIds = businesses.map((t) => t.id);
  /* the rooms asked of the STUDIOS you own, and the rooms your own PAGE has asked for */
  const ownedStudioIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "studio").map((m) => m.tenant.id);
  const ownedPageIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "artist_page").map((m) => m.tenant.id);

  /* AN ANSWERED ASK STAYS ON THE DESK (19 Sep 2026, the user: "enquiries and
     requests don't get removed after accepting"): every ask read takes the
     answered rows too, newest first, and the row wears its answer. Team invites
     are the one kind the invitee cannot read back once answered (the table has
     no policy for them — `my_pending_invites` is the only door), so those go. */
  /* ⚠⚠ FOUR READS WENT WITH EVENTS AND ORGANIZATIONS (29 Sep 2026): the duet
     PARTNER asks from both ends, the one `findEventsByIds` call behind them —
     which is what let this desk draw the app's own event card rather than a row
     of its own invention (27 Sep) — and the organization team asks from both
     ends (push 2, 19 Sep; keyed on the businesses owned since 26 Sep). */
  const ALL = ["asked", "confirmed", "rejected"] as const;
  const [claimsIn, invitesIn, claimsOut, invitesOutByTenant, crewIn, crewOut, venueIn, venueOut] = await Promise.all([
    findMyPendingClaims(supabase, [...ALL]),
    findMyPendingInvites(supabase),
    findAskedClaimsForTenants(supabase, tenantIds, [...ALL]),
    Promise.all(businesses.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, tenantName: t.name })))),
    findMyPendingCrewAsks(supabase, [...ALL]),
    findAskedForMyCrews(supabase, [...ALL]),
    findVenueRequestsForTenants(supabase, ownedStudioIds).catch(() => []),
    findMyVenueAsks(supabase, ownedPageIds).catch(() => []),
  ]);

  /* ⚠ THE PRACTICES THIS PERSON HAS BEEN ASKED TO (27 Sep 2026). Only the ones
     still AHEAD: a rehearsal that has happened is not a yes or a no you owe
     anybody, and the Inbox counts what waits on you. ⚠ The leader's own are
     filtered out because the database never asks them — `my_status` is `leader`
     — so the list is asks and nothing else. It answers an empty list rather than
     throwing; an Inbox must not fail over a crew's rehearsals. */
  const practiceIn = (await findMyCrewPractices(supabase, { from: stampNowIso() })).filter((p) => p.myStatus !== "leader" && p.status !== "cancelled");

  const { requestsIn, requestsOut } = buildRequests({
    venueIn,
    claimsIn,
    invitesIn,
    crewIn,
    practiceIn,
    venueOut,
    claimsOut,
    invitesOut: invitesOutByTenant.flat(),
    crewOut,
  });

  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={[]}
      enquiriesOut={[]}
      nowIso={stampNowIso()}
    />
  );
}
