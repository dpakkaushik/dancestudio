import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { OwnProfileScreen } from "@/features/profiles/components/OwnProfileScreen";
import { PublicPersonPage } from "@/features/profiles/components/PublicPersonPage";
import { headerMaxFor } from "@/lib/media/photo";
import { kindOf } from "@/types/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findNextPublicSessions } from "@/repositories/calendar";
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
  if (isMe && person.isArtist && !person.artistPageId) {
    const made = await ensureArtistPage(supabase, person.profile, await findMyTeams(supabase).catch(() => []));
    if (made) redirect(`/person/${userId}`);
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
  const [following, header, memberships, artistTeam, nextSessions] = await Promise.all([
    !isMe && user ? isFollowingPerson(supabase, userId) : Promise.resolve(false),
    /* THE HEADER (15 Sep 2026): their own pictures, as many as their KIND shows —
       one for a user, five for an artist (19 Sep 2026) */
    findPersonHeaderPhotos(supabase, userId, headerMaxFor(kindOf(person.isArtist))),
    /* WHAT THIS ARTIST SELLS (19 Sep 2026): the live memberships of the page
       behind them — bought from this page, exactly as a studio's are from its */
    person.artistPageId ? findMembershipsOnSale(supabase, person.artistPageId) : Promise.resolve([]),
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
    schedule
      ? findNextPublicSessions(supabase, schedule.id, { name: schedule.name, city: schedule.city })
      : Promise.resolve([]),
  ]);

  return <PublicPersonPage person={person} header={header} isMe={isMe} following={following} signedIn={Boolean(user)} memberships={memberships} artistTeam={artistTeam} nextSessions={nextSessions} />;
}
