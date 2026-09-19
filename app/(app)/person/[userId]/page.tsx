import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PublicPersonPage } from "@/features/profiles/components/PublicPersonPage";
import { headerMaxFor } from "@/lib/media/photo";
import { kindOf } from "@/types/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { findMembershipsOnSale } from "@/repositories/memberships";
import { findProfileById } from "@/repositories/profiles";
import { findPublicPerson, isFollowingPerson } from "@/repositories/publicPerson";
import { ensureArtistPage, findMyMemberships as findMyTeams } from "@/repositories/tenants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadPerson = cache(async (userId: string) => {
  const supabase = await createSupabaseServerClient();
  return findPublicPerson(supabase, userId);
});

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) return { title: "Person — DanceOS" };
  const person = await loadPerson(userId);
  /* an organization's name is not printed in the tab of a visitor who is about
     to be told there is nothing here */
  return person && person.profile.role !== "org"
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
 *  An ORGANIZATION has no page here (R9, 8 Sep 2026 — the user's rule); since
 *  18 Sep 2026 it has one at /org/{id} instead, and this address sends it there.
 *  The organization itself and a platform admin still read this one. */
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
  const isOrg = person.profile.role === "org";
  if (isOrg && !isMe && !(user && (await amIPlatformAdmin(supabase)))) {
    /* an organization's public face is its own page now (18 Sep 2026) */
    redirect(`/org/${userId}`);
  }
  /* an organization neither follows nor is followed — the button is not drawn
     when either side is one (the RPC refuses it too) */
  const viewer = isMe ? person.profile : user ? await findProfileById(supabase, user.id) : null;
  const canFollow = !isMe && !isOrg && viewer?.role !== "org";
  const [following, header, memberships] = await Promise.all([
    canFollow && user ? isFollowingPerson(supabase, userId) : Promise.resolve(false),
    /* THE HEADER (15 Sep 2026): their own pictures, as many as their KIND shows —
       one for a user, five for an artist, ten for an organization (19 Sep 2026) */
    findPersonHeaderPhotos(supabase, userId, headerMaxFor(kindOf(person.profile.role, person.isArtist))),
    /* WHAT THIS ARTIST SELLS (19 Sep 2026): the live memberships of the page
       behind them — bought from this page, exactly as a studio's are from its */
    person.artistPageId ? findMembershipsOnSale(supabase, person.artistPageId) : Promise.resolve([]),
  ]);

  /* ⚠ AN ARTIST'S PAGE IS MADE HERE TOO, NOT ONLY ON HOME (19 Sep 2026, the user:
     "some artist profiles don't have enquiry button on profile"). The page every
     ask hangs off was provisioned by Home alone, so anybody who took the plan and
     then landed on their own profile — or was VISITED before they next opened
     Home — had no page, and the Enquiry button was silently not drawn. Their own
     visit makes it; a refusal is swallowed, exactly as Home swallows it, because
     a profile must never fail to render over this. */
  if (isMe && person.isArtist && !person.artistPageId) {
    const made = await ensureArtistPage(supabase, person.profile, await findMyTeams(supabase).catch(() => []));
    if (made) redirect(`/person/${userId}`);
  }

  return <PublicPersonPage person={person} header={header} isMe={isMe} following={following} signedIn={Boolean(user)} canFollow={canFollow} memberships={memberships} />;
}
