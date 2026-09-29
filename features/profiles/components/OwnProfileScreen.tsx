import { redirect } from "next/navigation";
import { MyProfilePage } from "@/features/profiles/components/MyProfilePage";
import { headerMaxFor } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findNextPublicSessions } from "@/repositories/calendar";
import { findMyFollowedCrews, findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findPublicStudioTeam } from "@/repositories/publicProfile";
import { findPublicPerson, type PublicPerson } from "@/repositories/publicPerson";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyMemberships } from "@/repositories/businesses";
import { kindOf } from "@/types/profile";

/** YOUR OWN PROFILE, WHEREVER ITS ADDRESS IS (21 Sep 2026).
 *
 *  The user: *"how can you reduce the no. of pages per profile type without
 *  changing functionality"*, then *"keep stats as a separate page and push to
 *  live."* So `/profile` stopped being a SCREEN and became a redirect, and the
 *  two public addresses draw the owner's version when the subject is you:
 *  `/person/{me}` for a person, `/org/{me}` for an organization. One address per
 *  subject — which is the same rule the disc, the QR and the Share chip have
 *  followed since 19 Sep, finally true of the tab as well.
 *
 *  ⚠ THE READS LIVE HERE RATHER THAN IN EITHER ROUTE, and that is the point: two
 *  routes needing the same fourteen reads is exactly how `/profile` and
 *  `/person/{id}` drifted five ways in the first place (C32). The component both
 *  render is still `MyProfilePage`; what changed is which addresses reach it.
 *
 *  ⚠ AND IT IS NOT GATED ON BEING PUBLIC. `/org/{id}` answers through
 *  `findPublicOrganization`, a definer read that returns a row only for a PUBLIC
 *  organization — so an organization that is not verified yet would have got
 *  `notFound()` on its OWN profile. The owner branch is taken before that read,
 *  which is why this component reads `findPublicPerson` (the account) rather
 *  than the organization's public face. */
export async function OwnProfileScreen({ userId, loaded }: { userId: string; loaded?: PublicPerson }) {
  const supabase = await createSupabaseServerClient();
  /* `/person/{me}` has already read this row to decide whose page it is, so it
     hands it over rather than making the same query twice; `/org/{me}` reads the
     ORGANIZATION's public face, which is a different row and often no row at
     all, so it has none to give and this asks for the account itself. */
  const person = loaded ?? (await findPublicPerson(supabase, userId));
  if (!person) {
    redirect("/onboarding");
  }
  /* ⚠ `role` went with organizations (29 Sep 2026): it told this screen which of
     two profiles it was drawing, and there is one kind of profile now */
  /* what reaches you left this page on 19 Sep 2026 — the bell's own screen carries it, once */
  /* ⚠ `amIPlatformAdmin` AND `findMyGst` LEFT THIS LIST (21 Sep 2026). They were
     read here for the Settings sheet's Admin-panel and GST tiles, and the sheet
     is the chrome's now — so the layout reads them once for every page instead
     of this page reading them for one. Two fewer reads here, and the two they
     replaced in the layout ride a batch that was already being awaited. */
  const [followers, followingPeople, followingBusinesses, followingCrews, seats, plan, memberships, artistTeam] = await Promise.all([
    findMyPersonFollowers(supabase),
    findMyFollowedPeople(supabase),
    findMyFollowing(supabase),
    /* the kind that became followable on 19 Sep 2026 — an organization was the
       other and went on 29 Sep, taking `findMyFollowedOrganizations` with it */
    findMyFollowedCrews(supabase),
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    /* ⚠ WHAT YOU SELL, ON YOUR OWN TAB TOO (20 Sep 2026). /person/{id} has drawn
       an artist's live memberships since 19 Sep and this screen drew none, so an
       artist saw one thing on their public page and another on their own — one
       of the five ways the two had drifted. A failed read is no block, never a
       profile that will not open. */
    person.artistPageId ? findMembershipsOnSale(supabase, person.artistPageId).catch(() => []) : Promise.resolve([]),
    /* ⚠ THE TRAIN READ IS GONE FROM THIS PAGE (27 Sep 2026, the user: "Train
       section to be removed from profiles"). `findStudiosAttended` was this
       screen's only reason to query 300 bookings on every visit, and with the
       group gone it would have been a read nothing drew — the shape this repo
       keeps finding from the other side (the two Inbox enquiry reads, the same
       day). ⚠ The FUNCTION stays: the Studios hub still lists where you have
       learnt (R22), which typecheck is what said out loud. One fewer read here. */
    /* ⚠ `findOrganizationsNaming` sat here and went with organizations (29 Sep
       2026) — one fewer read on every visit to your own profile */
    /* ⚠ AND THE PEOPLE ON YOUR OWN PAGE (27 Sep 2026) — the same read the public
       side makes, so an artist sees their own faculty here exactly as a visitor
       does. Not drawn on a studio's home or on a plain user's, because neither
       has an artist page for it to answer about. */
    person.artistPageId ? findPublicStudioTeam(supabase, person.artistPageId).catch(() => []) : Promise.resolve([]),
    /* ⚠ `findMyOrgBusinessId` LEFT THIS LIST (26 Sep 2026) with the organization
       login: `my_org_business()` is dropped, and every profile here is a person's */
  ]);
  /* THE HEADER (15 Sep 2026): the KIND decides how many — one for a user and
     five for an artist (19 Sep 2026) — the same rule the database keeps on the
     way in */
  const headerMax = headerMaxFor(kindOf(Boolean(plan?.active)));
  /* ⚠ the `type !== "org"` filter went with organizations (29 Sep 2026); every
     business left has a public page for `scheduleHref` to point at */
  const businesses = seats.map((m) => m.business);
  /* ⚠⚠ WHAT YOU RUN (27 Sep 2026, the user: "user and artist profiles dont show
     what they own on their profile"). The owner seat, so a studio somebody
     merely teaches at is not in it — that one is an association and is listed as
     one, with its seat word, further down the page. */
  const owned = seats.filter((m) => m.memberRole === "owner").map((m) => m.business);
  /* ⚠ THE "WHICH BUSINESS" PICK LEFT THIS PAGE WITH SETTINGS (21 Sep 2026), and
     it is worth keeping the record of what it was: it read `businesses[0]` —
     the first business you are on the TEAM of — so a person who teaches
     somewhere and owns nothing had Settings' Payments, Invoices and Refunds
     addressing SOMEBODY ELSE'S STUDIO, and `/business/{id}/invoices` admits any
     member, so it opened that studio's ledger. Narrowing it to `owned[0]` fixed
     that and left a smaller version of the same shape (an organization owns its
     studios AND its hosting row). The layout asks the question properly now:
     the artist page you OWN, or nothing.
     ⚠ `scheduleHref` keeps the OLD rule on purpose: a schedule is a PUBLIC page
     and pointing at one you teach at is a reasonable thing for your profile's
     Schedule button to do, where addressing its money is not. */
  const schedBiz = businesses.find((t) => t.type === "artist_page") ?? businesses[0];
  const scheduleHref = schedBiz ? `/${schedBiz.type === "studio" ? "studio" : "artist"}/${schedBiz.id}/schedule` : null;

  /* ⚠ THE SUMMARY IS ON YOUR OWN TAB TOO (30 Sep 2026, #0aj), and that is
     `PersonBody`'s whole argument rather than a nicety: this screen and
     `/person/{id}` draw the same person, and every time one of them has been
     given something the other was not, they drifted — five ways by 20 Sep, which
     is why the body below them is one component. Defaulting the prop to `[]`
     here would have been the sixth.
     ⚠ It rides the header's await rather than the batch above, because the
     business it is about comes OUT of that batch (`seats`); paired with the
     header it costs no wall clock. */
  const [header, nextSessions] = await Promise.all([
    findPersonHeaderPhotos(supabase, userId, headerMax),
    schedBiz
      ? findNextPublicSessions(supabase, schedBiz.id, { name: schedBiz.name, city: schedBiz.city })
      : Promise.resolve([]),
  ]);

  return (
    <MyProfilePage
      person={person}
      header={header}
      headerMax={headerMax}
      followers={followers}
      followingPeople={followingPeople}
      followingBusinesses={followingBusinesses}
      followingCrews={followingCrews}
      scheduleHref={scheduleHref}
      nextSessions={nextSessions}
      owned={owned}
      memberships={memberships}
      artistTeam={artistTeam}
      plan={plan}
    />
  );
}
