import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { loadEnquiries } from "@/features/enquiries/server/loadEnquiries";
import { PersonAskSettings } from "@/features/inbox/components/AskSettings";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { findMyInboxOff } from "@/repositories/askSettings";
import { buildRequests } from "@/features/inbox/requestItems";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyPendingClassPeople } from "@/repositories/classPeople";
import { findAskedForMyCrews, findMyPendingCrewAsks } from "@/repositories/crews";
import { findMyCrewPractices } from "@/repositories/crewPractices";
import { findMyAnsweredInvites, findMyPendingInvites, findSentInvites } from "@/repositories/invites";
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
  /* ⚠ and the kinds of ask this person has switched off (3 Oct 2026) — it rides
     the batch that was already awaited, and answers [] rather than throwing */
  /* ⚠ THE PRACTICES RIDE THE FIRST ROUND (10 Oct 2026, the user: "make sure app
     is fast and smooth on every page"): they depend on nothing else here, and
     measured, they were a round trip of their own at the END of the page, after
     the enquiries and after the asks — six rounds one after another. Read for
     sixty days back; what that keeps is decided below. */
  const nowIso = stampNowIso();
  const [memberships, plan, inboxOff, practicesRaw, { show }] = await Promise.all([
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    findMyInboxOff(supabase, user.id),
    findMyCrewPractices(supabase, { from: new Date(Date.parse(nowIso) - 60 * 86400000).toISOString() }),
    searchParams,
  ]);
  const businesses = memberships.map((m) => m.business);

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
  /* ⚠⚠ NOTHING ANSWERED LEAVES THE DESK (2 Oct 2026, the user: "check … if
     changing their status is … visible in the right section and doesnt get
     removed from the system"). Four kinds used to vanish once their status
     moved: a WITHDRAWN class or crew ask (a soft delete — `withdrawn: true`
     reads them back), an ANSWERED room request (the read was `requested`
     only), an answered or revoked SENT invite (pending-only), and an answered
     RECEIVED invite (no policy at all — `my_answered_invites`, the held
     20261002140000, which answers none until it is applied). Each now lands
     under its column's Completed. */
  /* ⚠ ENQUIRIES ARE BACK ON THIS DESK (2 Oct 2026, the user: "shift back enquiries to inbox from home tools for all profiles") — the reads `/enquiries` made, through one loader shared with a studio's and a crew's Inbox.
     ⚠ It rides the same round as the asks (10 Oct 2026): it needs the memberships and nothing the asks need, and it was a round of its own. */
  /* ⚠⚠ THE CLASS ASKS LEFT THIS DESK (11 Oct 2026, the user's choice: class
     requests live in Classes only). Teach and assist asks put to you, and the
     ones your own page sent, are the Requests column of /my-classes; a studio's
     room requests and the teachers it asked are its own register's. What is read
     here is only the COUNT of what waits on you, for the one line that says so —
     the room and sent-ask reads went with them. */
  const [enq, classPeopleIn, invitesIn, invitesInAnswered, invitesOutByBusiness, crewIn, crewOut] = await Promise.all([
    loadEnquiries(supabase, { kind: "person", userId: user.id, memberships }),
    findMyPendingClassPeople(supabase).catch(() => []),
    findMyPendingInvites(supabase),
    findMyAnsweredInvites(supabase),
    Promise.all(businesses.map(async (t) => (await findSentInvites(supabase, t.id)).map((i) => ({ ...i, businessName: t.name })))),
    findMyPendingCrewAsks(supabase, [...ALL], { withdrawn: true }),
    findAskedForMyCrews(supabase, [...ALL], { withdrawn: true }),
  ]);
  const classAsksWaiting = classPeopleIn.filter((c) => c.status === "asked" && !c.withdrawn).length;

  /* ⚠ THE PRACTICES THIS PERSON HAS BEEN ASKED TO (27 Sep 2026). Only the ones
     still AHEAD: a rehearsal that has happened is not a yes or a no you owe
     anybody, and the Inbox counts what waits on you. ⚠ The leader's own are
     filtered out because the database never asks them — `my_status` is `leader`
     — so the list is asks and nothing else. It answers an empty list rather than
     throwing; an Inbox must not fail over a crew's rehearsals. */
  /* ⚠ AND THE ONES YOU ANSWERED STAY, for sixty days back (2 Oct 2026): a yes
     or a no to a practice is a decision like any other, so it moves to
     Completed rather than vanishing the moment the evening passes. A PAST
     practice nobody answered is left out — it waits on nobody now, and a
     Reject button on last Tuesday would be a control that means nothing. */
  const practiceIn = practicesRaw.filter(
    (p) => p.myStatus !== "leader" && p.status !== "cancelled" && (p.startsAt >= nowIso || p.myStatus !== "asked")
  );

  const { requestsIn, requestsOut } = buildRequests({
    invitesIn,
    invitesInAnswered,
    crewIn,
    practiceIn,
    invitesOut: invitesOutByBusiness.flat(),
    crewOut,
  });

  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={enq.enquiriesIn}
      enquiriesOut={enq.enquiriesOut}
      settings={<EnquirySettings businesses={enq.settingsFor} />}
      /* the teach / assist switches moved to Classes with the asks (11 Oct 2026) */
      classPointer={{ n: classAsksWaiting, href: "/my-classes?show=requests" }}
      inviteSettings={<PersonAskSettings section="invites" off={inboxOff} />}
      initialSection={show === "enquiries" ? "enq" : show === "done" ? "done" : undefined}
      nowIso={nowIso}
    />
  );
}
