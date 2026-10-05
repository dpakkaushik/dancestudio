import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { OwnProfileScreen } from "@/features/profiles/components/OwnProfileScreen";
import { PublicPersonPage } from "@/features/profiles/components/PublicPersonPage";
import { headerMaxFor } from "@/lib/media/photo";
import { kindOf } from "@/types/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findTeamFollows } from "@/repositories/follows";
import type { MembershipOnSale } from "@/repositories/memberships";
import { findNextPublicSessions } from "@/repositories/calendar";
import { startedSessionIds } from "@/types/calendar";
import { findMyEnrolledSessionIds } from "@/repositories/classBookings";
import { findPublicPerson, isFollowingPerson, personScheduleBusiness } from "@/repositories/publicPerson";
import { findPublicStudioTeam } from "@/repositories/publicProfile";
import { ensureArtistPage, findMyMemberships as findMyTeams } from "@/repositories/businesses";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadPerson = cache(async (userId: string) => {
  const supabase = await createSupabaseServerClient();
  return findPublicPerson(supabase, userId);
});

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) return { title: "Person — DanceOS" };
  const person = await loadPerson(userId);
  /* ⚠ the `role !== "org"` guard went with organizations (29 Sep 2026) — every
     profile here is a person's */
  return person
    ? { title: `${person.profile.fullName} — DanceOS`, description: `${person.profile.fullName} on DanceOS${person.profile.city ? ` · ${person.profile.city}` : ""}.` }
    : { title: "Person — DanceOS" };
}

/** A person's page. Signed-in only for a plain user, as it has been since the
 *  first parity slice: `profiles` is readable by signed-in users (Step 1), and
 *  whether a plain user's page should be PUBLIC is a decision about somebody
 *  else's data. ⚠ **An ARTIST's page is public since 18 Sep 2026** (the user:
 *  "should only come as their profile as artist — no separate page required"):
 *  a person with a live Artist plan is readable signed out
 *  (`20260918175000_an_artist_is_their_profile.sql`), because this page is now
 *  what /artist/{id} used to be — the one public face of an artist. So a
 *  stranger is not sent to sign in first; RLS decides: a row comes back for an
 *  artist and for nobody else, and "not found" is the honest answer otherwise.
 *
 *  ⚠ THE ORGANIZATION BRANCH IS GONE (29 Sep 2026). It sent an organization's
 *  login on to /org/{id} and let a platform admin read the evidence here; both
 *  went with organizations themselves. */
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const person = await loadPerson(userId);
  if (!person) {
    /* a stranger who cannot read this row: a plain user's page is still a
       signed-in page, so the honest door is sign-in with the way back */
    if (!user) {
      redirect(`/login?next=${encodeURIComponent(`/person/${userId}`)}`);
    }
    notFound();
  }
  const isMe = Boolean(user) && user!.id === userId;
  /* ⚠ AN ARTIST'S PAGE IS MADE HERE TOO, NOT ONLY ON HOME (19 Sep 2026, the user:
     "some artist profiles don't have enquiry button on profile"). The page every
     ask hangs off was provisioned by Home alone, so anybody who took the plan and
     then landed on their own profile — or was VISITED before they next opened
     Home — had no page, and the Enquiry button was silently not drawn. Their own
     visit makes it; a refusal is swallowed, exactly as Home swallows it, because
     a profile must never fail to render over this.
     ⚠ IT MOVED ABOVE THE OWNER BRANCH ON 21 Sep 2026 and that is not tidying:
     the owner now returns early, so leaving this below would have made your own
     visit stop provisioning the page — silently, and only findable by an artist
     whose Enquiry button never appeared. */
  /* ⚠⚠ REDIRECT ONLY WHEN A PAGE WAS ACTUALLY MADE (1 Oct 2026, the user: "when
     checking discover for your own profile in artist is giving a blank page").
     `person.artistPageId` is the PUBLIC read, which answers null for an artist
     page that is UNLISTED — and `ensureArtistPage` hands back the id of the page
     the person already OWNS. So an artist whose page is unlisted (Deepak's
     `test2`, unlisted on 30 Sep) got "no page" → "here is your page" → redirect
     to this same address → "no page" again, for ever: the route was fetched
     twenty times in six seconds and drew nothing but the top bar. The decision
     is made off the person's OWN seats now, and the redirect fires only after a
     row was created. */
  if (isMe && person.isArtist && !person.artistPageId) {
    const teams = await findMyTeams(supabase).catch(() => []);
    const alreadyOwns = teams.some((m) => m.memberRole === "owner" && m.business.type === "artist_page");
    if (!alreadyOwns) {
      const made = await ensureArtistPage(supabase, person.profile, teams);
      if (made) redirect(`/person/${userId}`);
    }
  }
  /* ⚠ YOUR OWN PROFILE IS THIS ADDRESS NOW (21 Sep 2026, the user: "reduce the
     no. of pages per profile type without changing functionality"). `/profile`
     used to be a second screen drawing this same person from this same read;
     it is a redirect to here, and the owner's version is what renders — so the
     three public-path reads below are not made for you at all, because
     `OwnProfileScreen` asks its own fourteen. */
  if (isMe) {
    return <OwnProfileScreen userId={userId} loaded={person} />;
  }
  /* ⚠ THE VIEWER'S KIND DECIDES NOTHING HERE (20 Sep 2026), so their profile is
     not read for it — one round trip fewer on every person's page. You do not
     follow yourself, and that is the whole of the test now that the
     organization half of it has gone (29 Sep 2026). */
  /* ⚠ THE SAME BUSINESS THE SCHEDULE BAR OPENS (30 Sep 2026, #0aj) — the rule
     lives in `personScheduleBusiness` precisely so this read and that href name
     one business. A preview of somebody else's schedule under a bar that opens
     this one's would be a lie nothing on the page could correct. */
  const schedule = personScheduleBusiness(person);
  const [following, header, memberships, artistTeam, nextSessions, followingN, mine] = await Promise.all([
    !isMe && user ? isFollowingPerson(supabase, userId) : Promise.resolve(false),
    /* THE HEADER (15 Sep 2026): their own pictures, as many as their KIND shows —
       one for a user, five for an artist (19 Sep 2026) */
    findPersonHeaderPhotos(supabase, userId, headerMaxFor(kindOf(person.isArtist))),
    /* ⚠ AN ARTIST SELLS NO MEMBERSHIP (4 Oct 2026, the user: "memberships can
       only be created by studios") — the read is gone, the slot stays empty */
    Promise.resolve([] as MembershipOnSale[]),
    /* AND WHO WORKS WITH THEM (27 Sep 2026) — the other end of a link that ran
       one way: those people's own profiles have named this artist under "Artists
       associated with" since 20 Sep, and this page named nobody back.
       `public_studio_team` answers for an artist page since `20260927120000`,
       and only while the page is LISTED, so it publishes nothing an unpaid plan
       would have hidden.
       ⚠ The organizations-that-name-them read went with organizations (29 Sep). */
    person.artistPageId ? findPublicStudioTeam(supabase, person.artistPageId).catch(() => []) : Promise.resolve([]),
    /* the first few classes behind the Schedule bar — nothing at all when there
       is no business to have a schedule (a plain user) */
    /* ⚠ an artist's rail offers every class they TEACH, at any studio, not only
       their page's own (5 Oct 2026) — `schedule` is their own page whenever it
       is an artist page (`personScheduleBusiness` reads their seats, then
       `artistPageId`), so they are its teacher */
    schedule
      ? findNextPublicSessions(supabase, schedule.id, { name: schedule.name, city: schedule.city }, schedule.type === "artist_page" ? userId : null)
      : Promise.resolve([]),
    /* ⚠⚠ THEIR FOLLOWING COUNTS THEIR TEAMS (2 Oct 2026, the user: "reflect in
       user/ artist profile when seeing following"). A member follows the crews
       and studios they are on — derived, so the figure is what they really
       follow plus each team they do not already follow, which is exactly the
       list the sheet opens onto (`loadFollowingAction` merges the same two). The
       overlap is read only when there is a team and a signed-in reader, because
       `profile_following` is authenticated-only; signed out it cannot be read,
       and a team is rarely also a follow. */
    (async () => {
      const teams = await findTeamFollows(supabase, userId).catch(() => ({ businesses: [], crews: [] }));
      const n = teams.businesses.length + teams.crews.length;
      if (!n) return person.following;
      let overlap = 0;
      if (user) {
        const { data } = await supabase.rpc("profile_following", { p_user_id: userId });
        const ids = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
        overlap = teams.businesses.filter((b) => ids.has(b.businessId)).length + teams.crews.filter((c) => ids.has(c.crewId)).length;
      }
      return person.following + n - overlap;
    })(),
    /* the viewer's own seats, so a card on the rail says Booked rather than Book
       Now (5 Oct 2026, the user: "Book Now button for the next session on public
       profile pages") */
    user ? findMyEnrolledSessionIds(supabase).catch(() => new Map()) : Promise.resolve(new Map()),
  ]);
  /* ⚠ a class the VIEWER is taking offers them no seat — the class page's own rule
     (R61). This page is never the viewer's own (that returned above), so it is
     only ever a class they teach somewhere this person also does. */
  const booking = {
    signedIn: Boolean(user),
    mine: Object.fromEntries(mine),
    runs: nextSessions.filter((e) => user && e.artist?.userId === user.id).map((e) => e.sessionId),
    started: startedSessionIds(nextSessions),
  };

  return <PublicPersonPage person={{ ...person, following: followingN }} header={header} isMe={isMe} following={following} signedIn={Boolean(user)} memberships={memberships} artistTeam={artistTeam} nextSessions={nextSessions} booking={booking} />;
}
