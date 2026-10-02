import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActingAs } from "@/repositories/actingAs";
import { findMyLedCrews } from "@/repositories/crews";
import { findReceivedEnquiries, findReceivedEnquiriesForCrews, findSentEnquiries } from "@/repositories/enquiries";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** ⚠⚠ ENQUIRIES IS A TOOL (27 Sep 2026, the user: *"enquiries should not be on
 *  navbar a tab in tools for all"*, and then *"with its setting as well manged
 *  from there"*).
 *
 *  It was the Inbox's third section that morning, then the bar's fourth tab for
 *  a few hours, and it is a TILE on all four tool grids by the evening. What has
 *  not moved is why it is not the Inbox: the Inbox is what somebody has asked OF
 *  you — a class, a room, a duet, a seat on a team — and every row there is a yes
 *  or a no you owe them. An enquiry is somebody wanting to BOOK you, and it has a
 *  life of its own: a quote, a revision, an advance, a balance, won or lost.
 *
 *  ⚠ IT DRAWS THE SAME COMPONENT (`InboxScreen desk="enquiries"`) rather than a
 *  fork of it: the cards, the Received/Sent sides, the pipeline tiles and the
 *  Done treatment are identical, and this repo's bill for copying a screen has
 *  been paid three times already.
 *
 *  ⚠⚠ AND THE TILE SAYS WHOSE DESK IT OPENS (`?as=`). One screen serves the whole
 *  account, so without it an owner of two studios would press two tiles onto one
 *  undivided list — and the SETTINGS would have no subject at all. It is the same
 *  pointer the Discover booking gate carries, resolved the same way: **a pointer
 *  is never an authority**, so it is looked up among the businesses this account
 *  is on the team of and the crews it leads, and an id that is a stranger's, made
 *  up, or one this person has left resolves to null — which means "everything you
 *  are entitled to", the permissive answer, because narrowing is a presentation
 *  choice and the reads underneath are RLS-bounded either way.
 *
 *  ⚠ The reads are exactly the Inbox's enquiry reads and nothing else — the
 *  requests batch is not made here at all, so the desk costs what it draws. */
export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* ⚠ the profile read went with organizations (29 Sep 2026): it was asked for
     one thing, the accent, and the KIND is the plan's answer alone now */
  const [memberships, plan, ledCrews, actingAs] = await Promise.all([
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    /* the crews you lead take enquiries too (18 Sep 2026); a business leads none */
    findMyLedCrews(supabase).catch(() => []),
    resolveActingAs(supabase, as),
  ]);

  /* ⚠⚠ ONE PROFILE PER DESK, ALWAYS (2 Oct 2026, the user: "all items on home
     tab should be for that specific profile right now i can see earnings,
     enquiries, assets being overlapping same data for a studio or artist / user
     profile"). Measured on their own account first: the person's desk and their
     studio's desk drew the SAME list — the studio's enquiry under Received on
     both, and the person's own under Sent on both.
     · UNSCOPED is the PERSON's own tile, and a person is asked through the
       artist page behind them (`artist_page_of`, 18 Sep) — so Received is that
       page's alone, never a studio's or a crew's (they have tiles of their own).
     · SCOPED is that studio's or that crew's, and has NO Sent side: an enquiry
       is sent BY A PERSON (`guard_person_only`), so what you sent belongs on
       your own desk and nowhere else.
     ⚠ This supersedes 27 Sep's "the unscoped list is still everything you are
     entitled to" — that was the overlap. */
  const scopedBusiness = actingAs && actingAs.kind !== "crew" ? actingAs.id : null;
  const scopedCrew = actingAs && actingAs.kind === "crew" ? actingAs.id : null;
  const scoped = Boolean(actingAs);
  const businessIds = scopedCrew
    ? []
    : scopedBusiness
      ? memberships.map((m) => m.business.id).filter((id) => id === scopedBusiness)
      : memberships.filter((m) => m.memberRole === "owner" && m.business.type === "artist_page").map((m) => m.business.id);
  const crewIds = scopedCrew ? ledCrews.map((c) => c.id).filter((id) => id === scopedCrew) : [];

  const [enquiriesToBusinesses, enquiriesToCrews, enquiriesOut] = await Promise.all([
    businessIds.length ? findReceivedEnquiries(supabase, businessIds) : Promise.resolve([]),
    crewIds.length ? findReceivedEnquiriesForCrews(supabase, crewIds) : Promise.resolve([]),
    scoped ? Promise.resolve([]) : findSentEnquiries(supabase, user.id),
  ]);

  /* one desk: what your businesses were asked, and what your crews were asked, newest first */
  const enquiriesIn = [...enquiriesToBusinesses, ...enquiriesToCrews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  /* ⚠ THE SETTINGS ARE THE OWNER'S, AND ONLY A BUSINESS HAS ANY. `enquiry_types`
     is a `businesses` column and `update_business_profile` admits the owner
     alone, so a trainer or a front desk reads the desk and is offered no
     control — a door that would be refused is not offered (21 Sep). A crew's
     three kinds are fixed in `send_enquiry`, so there is nothing to set.
     ⚠ AN ARTIST PAGE IS IN THIS LIST on purpose: an enquiry to an artist is sent
     to the page behind them (`artist_page_of`, 18 Sep), so the kinds it takes —
     the judge one among them — are theirs to set, and this is the only screen
     that offers it since the Profile tab's own sheet went.

     ⚠⚠ AND UNSCOPED, IT IS YOUR OWN PROFILE'S AND NOTHING ELSE'S (27 Sep 2026,
     the user: *"user and artist should see settings for only their profiles not
     for other profiles created by them in their enquiries section"*). The tile
     on a PERSON's own grid carries no `?as=`, and this listed every business
     they owned — so somebody who had opened two studios and an organization
     pressed their own Enquiries tile and was handed four settings blocks, three
     of them about businesses with tiles and desks of their own.
     ⚠ Since 2 Oct 2026 the LIST is narrowed the same way (above), so the desk
     and its settings are always about one subject. */
  const settingsFor = memberships
    .filter((m) => m.memberRole === "owner")
    .filter((m) => (scopedBusiness ? m.business.id === scopedBusiness : m.business.type === "artist_page"))
    .filter(() => !scopedCrew)
    .map((m) => m.business);

  return (
    <InboxScreen
      desk="enquiries"
      accent={accent}
      requestsIn={[]}
      requestsOut={[]}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
      deskSub={actingAs ? actingAs.name : "Your profile"}
      settings={<EnquirySettings businesses={settingsFor} />}
    />
  );
}
