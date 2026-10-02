import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { loadEnquiries } from "@/features/enquiries/server/loadEnquiries";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClassPeopleForBusinesses, findClassArtists, findMyPendingClassPeople } from "@/repositories/classPeople";
import { findMyVenueAsks, findVenueRequestsForBusinesses } from "@/repositories/classes";
import { findAskedForMyCrews, findMyPendingCrewAsks } from "@/repositories/crews";
import { findMyCrewPractices } from "@/repositories/crewPractices";
import { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** Inbox tab — the prototype's S_chats: Requests and Enquiries, two desks that
 *  count what is waiting on you. Requests are rows that already exist (class
 *  classPeople, team invites), read from BOTH ends: what is asked of you, and what
 *  your businesses have asked of others. The mapping into rows lives in
 *  `features/inbox/requestItems.ts` since 18 Sep 2026, because a studio's inbox
 *  and a crew's inbox draw the same rows scoped to one entity. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
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
  /* ⚠ ENQUIRIES ARE BACK ON THIS DESK (2 Oct 2026, the user: "shift back enquiries to inbox from home tools for all profiles") — the reads `/enquiries` made, through one loader shared with a studio's and a crew's Inbox */
  const [{ show }, enq] = await Promise.all([searchParams, loadEnquiries(supabase, { kind: "person", userId: user.id, memberships })]);
  const businesses = memberships.map((m) => m.business);
  const businessIds = businesses.map((t) => t.id);
  /* the rooms asked of the STUDIOS you own, and the rooms your own PAGE has asked for */
  const ownedStudioIds = memberships.filter((m) => m.memberRole === "owner" && m.business.type === "studio").map((m) => m.business.id);
  const ownedPageIds = memberships.filter((m) => m.memberRole === "owner" && m.business.type === "artist_page").map((m) => m.business.id);

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
  const [classPeopleIn, invitesIn, classPeopleOut, invitesOutByBusiness, crewIn, crewOut, venueIn, venueOut] = await Promise.all([
    findMyPendingClassPeople(supabase, [...ALL]),
    findMyPendingInvites(supabase),
    findAskedClassPeopleForBusinesses(supabase, businessIds, [...ALL]),
    Promise.all(businesses.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, businessName: t.name })))),
    findMyPendingCrewAsks(supabase, [...ALL]),
    findAskedForMyCrews(supabase, [...ALL]),
    findVenueRequestsForBusinesses(supabase, ownedStudioIds).catch(() => []),
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
    classPeopleIn,
    invitesIn,
    crewIn,
    practiceIn,
    venueOut,
    classPeopleOut,
    invitesOut: invitesOutByBusiness.flat(),
    crewOut,
  });

  /* the teacher each class card wears — one read for the whole desk (1 Oct 2026) */
  const classIds = [...new Set([...requestsIn, ...requestsOut].map((r) => r.danceClass?.id).filter((x): x is string => Boolean(x)))];
  const artists = Object.fromEntries(await findClassArtists(supabase, classIds).catch(() => new Map()));

  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      artists={artists}
      enquiriesIn={enq.enquiriesIn}
      enquiriesOut={enq.enquiriesOut}
      settings={<EnquirySettings businesses={enq.settingsFor} />}
      initialSection={show === "enquiries" ? "enq" : show === "done" ? "done" : undefined}
      nowIso={stampNowIso()}
    />
  );
}
