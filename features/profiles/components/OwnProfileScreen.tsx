import { redirect } from "next/navigation";
import { MyProfilePage } from "@/features/profiles/components/MyProfilePage";
import { headerMaxFor } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyFollowedCrews, findMyFollowedOrganizations, findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findStudiosAttended } from "@/repositories/enrollments";
import { findMyOrgTenantId } from "@/repositories/orgStanding";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findPublicPerson, type PublicPerson } from "@/repositories/publicPerson";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyMemberships } from "@/repositories/tenants";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyGst } from "@/repositories/gst";
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
  const role = person.profile.role;
  /* what reaches you left this page on 19 Sep 2026 — the bell's own screen carries it, once */
  const [followers, followingPeople, followingTenants, followingOrgs, followingCrews, seats, plan, isAdmin, gst, memberships, trainsAt, eventsHostId] = await Promise.all([
    findMyPersonFollowers(supabase),
    findMyFollowedPeople(supabase),
    findMyFollowing(supabase),
    /* the two kinds that became followable on 19 Sep 2026.
       ⚠ AN ORGANIZATION ASKS FOR ALL FOUR NOW (20 Sep 2026): it follows since
       `20260920180000_an_organization_follows`, so its Following figure counts
       real rows rather than being withheld. */
    findMyFollowedOrganizations(supabase),
    findMyFollowedCrews(supabase),
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    amIPlatformAdmin(supabase),
    /* the Settings sheet's GST row says verified or not (11 Sep 2026); only an
       organization has the row, so only an organization is asked about it */
    role === "org" ? findMyGst(supabase, person.profile.id) : Promise.resolve({ gstin: null, verifiedAt: null }),
    /* ⚠ WHAT YOU SELL, ON YOUR OWN TAB TOO (20 Sep 2026). /person/{id} has drawn
       an artist's live memberships since 19 Sep and this screen drew none, so an
       artist saw one thing on their public page and another on their own — one
       of the five ways the two had drifted. A failed read is no block, never a
       profile that will not open. */
    person.artistPageId ? findMembershipsOnSale(supabase, person.artistPageId).catch(() => []) : Promise.resolve([]),
    /* ⚠ TRAIN — WHERE THEY HAVE TAKEN CLASSES (21 Sep 2026, the user's Studios
       columns). Read HERE and not on the public page, on their own answer when
       asked: a booking is private, so the group exists on your own view of
       yourself and on nobody else's view of you. An organization books nothing
       (R11), so it is not asked. */
    role === "org" ? Promise.resolve([]) : findStudiosAttended(supabase, userId).catch(() => []),
    /* an ORGANIZATION's own hosting row (R15) — where an enquiry to it lands,
       and the one id the button row needs that `findPublicPerson` cannot
       carry (21 Sep 2026). A person has none and is not asked. */
    role === "org" ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  /* THE HEADER (15 Sep 2026): the KIND decides how many — one for a user, five
     for an artist, ten for an organization (19 Sep 2026) — the same rule the
     database keeps on the way in */
  const headerMax = headerMaxFor(kindOf(role, Boolean(plan?.active)));
  const header = await findPersonHeaderPhotos(supabase, userId, headerMax);
  /* R15 (9 Sep 2026): an organization's event-hosting row is a tenant but not
     one of its BUSINESSES — it is unlisted for ever, has no rooms and no public
     page. It is filtered out here so "Your studios" counts studios and the
     Schedule button never points at a page that does not exist. */
  const businesses = seats.filter((m) => m.tenant.type !== "org").map((m) => m.tenant);
  /* ⚠⚠ THE DESK SETTINGS POINTS AT MUST BE ONE YOU OWN (21 Sep 2026). This was
     `businesses[0]` — the first business you are on the TEAM of — so a person
     who teaches somewhere and owns nothing had Settings' Payments, Invoices and
     Refunds addressing SOMEBODY ELSE'S STUDIO. Not merely a bounced link:
     `/business/{id}/invoices` admits any member, so it opened that studio's
     invoice ledger. It is the "first business you own" bug in its third
     costume — the memberships desk was rebuilt on 21 Sep to kill exactly this
     shape, and this instance was one read away from it the whole time.
     ⚠ `scheduleHref` keeps the OLD rule on purpose: a schedule is a PUBLIC page
     and pointing at one you teach at is a reasonable thing for your profile's
     Schedule button to do, where addressing its money is not. */
  const owned = seats.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
  const biz = owned.find((t) => t.type === "artist_page") ?? owned[0] ?? null;
  const schedBiz = businesses.find((t) => t.type === "artist_page") ?? businesses[0];
  const scheduleHref = schedBiz ? `/${schedBiz.type === "studio" ? "studio" : "artist"}/${schedBiz.id}/schedule` : null;

  return (
    <MyProfilePage
      person={person}
      header={header}
      headerMax={headerMax}
      followers={followers}
      followingPeople={followingPeople}
      followingTenants={followingTenants}
      followingOrgs={followingOrgs}
      followingCrews={followingCrews}
      scheduleHref={scheduleHref}
      business={biz ?? null}
      businesses={businesses}
      memberships={memberships}
      trainsAt={trainsAt}
      eventsHostId={eventsHostId}
      plan={plan}
      isAdmin={isAdmin}
      gstVerified={Boolean(gst.verifiedAt)}
    />
  );
}
