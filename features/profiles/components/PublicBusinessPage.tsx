import { notFound, redirect } from "next/navigation";
import { publicProfilePath, publicSchedulePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findNextPublicSessions } from "@/repositories/calendar";
import { findBusinessFollowers, isFollowingBusiness } from "@/repositories/follows";
import { findBusinessHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findPublicBusinessProfile } from "@/repositories/publicProfile";
import { findPersonFollowerCounts } from "@/repositories/publicPerson";
import { findMyMembershipRole } from "@/repositories/businesses";
import { findMyEnrolledSessionIds } from "@/repositories/classBookings";
import { findRoomsByBusiness } from "@/repositories/rooms";
import { fullAddressOf } from "@/lib/geo/fullAddress";
import type { BusinessType } from "@/types/business";
import { startedSessionIds } from "@/types/calendar";
import { PublicProfile } from "./PublicProfile";

/** The public page of a business, for anybody — a stranger, a follower, or its
 *  own members. Not signed in is fine: RLS shows a listed business to everyone
 *  and an unlisted one to its members only, so "not found" is the honest answer
 *  for both a bad id and somebody else's private business. */
export async function PublicBusinessPage({ businessId, expect }: { businessId: string; expect: BusinessType }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* the business, its styles, its TEAM (19 Sep 2026) and its follower count, in one read set */
  const profile = await findPublicBusinessProfile(supabase, businessId);
  if (!profile) {
    notFound();
  }
  /* a studio opened under /artist (or the reverse) lands on its own address */
  if (profile.business.type !== expect) {
    redirect(publicProfilePath(profile.business));
  }

  /* ⚠ THE VIEWER'S OWN PROFILE IS NO LONGER READ (20 Sep 2026). It was fetched
     for one reason — "an organization follows nothing", so the bell had to be
     drawn disabled for one — and an organization follows since
     `20260920180000_an_organization_follows`. One round trip fewer on a page
     strangers open. */
  const isStudio = profile.business.type === "studio";
  const place = [profile.business.area, profile.business.city].filter(Boolean).join(", ");
  const [following, role, header, memberships, ownerCounts, nextSessions, rooms, address, mine] = await Promise.all([
    user ? isFollowingBusiness(supabase, businessId) : Promise.resolve(false),
    user ? findMyMembershipRole(supabase, businessId) : Promise.resolve(null),
    /* THE HEADER (15 Sep 2026): the pictures that swipe across the top — the
       RPC decides what this viewer may see, and signs nothing it may not */
    findBusinessHeaderPhotos(supabase, businessId),
    /* WHAT IT SELLS (19 Sep 2026): the live memberships of a listed business — anybody's to read */
    findMembershipsOnSale(supabase, businessId),
    /* ⚠ WHAT THIS STUDIO FOLLOWS IS WHAT ITS OWNER FOLLOWS (20 Sep 2026, the
       user: "Organization and Studio still dont have Following section in
       profile and home"). A studio cannot follow ANYTHING on its own and never
       will without a schema change: `follows.follower_id` references `profiles`,
       and a studio is a `businesses` row with nothing to follow with. What runs
       the studio is an account, and that account's follows are the honest
       reading of the question. `person_follower_counts` hands back both numbers
       for a public organization or an artist, and nothing at all otherwise — in
       which case the figure is simply not drawn (`Figure` prints no zero it did
       not read). */
    (async () => {
      const owner = profile.team.find((m) => m.role === "owner");
      return owner ? findPersonFollowerCounts(supabase, [owner.userId]).catch(() => new Map()) : new Map();
    })(),
    /* ⚠ THE FIRST FEW CLASSES BEHIND THE SCHEDULE BAR (30 Sep 2026, #0aj) — it
       rides the batch this page was already awaiting, so it costs no wall clock
       on a page strangers open. The function says why it is the schedule page's
       own, and why a failure here is nothing rather than a 500. */
    findNextPublicSessions(supabase, businessId, { name: profile.business.name, city: profile.business.city }),
    /* ⚠ THE STUDIO ITSELF (5 Oct 2026, the user: "below Schedule should have full
       adrees and rooms with amenities") — its rooms (a listed studio's are
       anybody's to read, Step 11) and its address in words. Both degrade to
       nothing rather than failing: a page strangers open must not 500 over a
       room list or a geocoder, and the geocoder has 1.2 s at most. */
    isStudio ? findRoomsByBusiness(supabase, businessId).catch(() => []) : Promise.resolve([]),
    isStudio
      ? fullAddressOf({ lat: profile.business.lat ?? null, lng: profile.business.lng ?? null, locationSetAt: profile.business.locationSetAt ?? null }, place)
      : Promise.resolve(place),
    /* the viewer's own seats, so a card on the rail says Booked rather than Book Now */
    user ? findMyEnrolledSessionIds(supabase).catch(() => new Map()) : Promise.resolve(new Map()),
  ]);
  /* ⚠ WHAT THE VIEWER RUNS OFFERS NO SEAT — the class page's own rule (R61): the
     OWNER on the studio's own classes, and whoever is the artist taking it. Faculty
     and a manager may still book, exactly as on the class page. */
  const runs = nextSessions
    .filter((e) => (role === "owner" && e.owner?.kind === "studio") || (user && e.artist?.userId === user.id))
    .map((e) => e.sessionId);
  const booking = { signedIn: Boolean(user), mine: Object.fromEntries(mine), runs, started: startedSessionIds(nextSessions) };
  const ownerId0 = profile.team.find((m) => m.role === "owner")?.userId ?? null;
  const followingN = ownerId0 ? (ownerCounts.get(ownerId0)?.following ?? null) : null;

  /* WHO follows you is the owner's to read (B6). The policy would admit any
     member; the app asks only when the owner is the one looking, so the second
     query is not made for the other 99% of visits either. */
  const followers = role === "owner" ? await findBusinessFollowers(supabase, businessId) : null;

  /* ⚠ `canEditPhoto` and `ownerId` no longer travel to the page (20 Sep 2026):
     a studio's pictures are changed on the studio's OWN HOME — the ⊕ on the disc
     and the ⊕ on the posters rail, where a person's have been since 19 Sep — so
     this page has nothing to hand a picture control, and the Edit button here
     edits words. */
  return (
    <PublicProfile
      profile={profile}
      header={header}
      path={publicProfilePath(profile.business)}
      following={following}
      signedIn={Boolean(user)}
      followingN={followingN}
      isMember={role !== null}
      canEdit={role === "owner"}
      followers={followers}
      scheduleHref={publicSchedulePath(profile.business)}
      nextSessions={nextSessions}
      manageHref={profile.business.type === "studio" ? `/business/${businessId}` : `/business/${businessId}/classes`}
      memberships={memberships}
      address={address}
      rooms={rooms}
      booking={booking}
    />
  );
}
