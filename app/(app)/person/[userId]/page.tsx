import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PublicPersonPage } from "@/features/profiles/components/PublicPersonPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findProfileById } from "@/repositories/profiles";
import { findPublicPerson, isFollowingPerson } from "@/repositories/publicPerson";

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

/** A person's page. Signed-in only, deliberately: `profiles` is readable by
 *  signed-in users (Step 1), and whether a person page should be PUBLIC is a
 *  decision about somebody else's data — it stays on the backlog rather than
 *  being taken in passing here.
 *
 *  An ORGANIZATION has no page here (R9, 8 Sep 2026 — the user's rule): to
 *  everyone else it is not an entity; its studios are, each on its own page.
 *  The two who still open it are the organization itself and a platform admin,
 *  who reads it as the evidence behind a verification. Everybody else gets the
 *  404 a bad id gets. RLS still lets a signed-in user read the row (Step 1's
 *  policy) — this is the app's decision on top of that ceiling, like the 404
 *  on the admin queue. */
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/person/${userId}`)}`);
  }

  const person = await loadPerson(userId);
  if (!person) {
    notFound();
  }
  const isMe = user.id === userId;
  const isOrg = person.profile.role === "org";
  if (isOrg && !isMe && !(await amIPlatformAdmin(supabase))) {
    notFound();
  }
  /* an organization neither follows nor is followed — the button is not drawn
     when either side is one (the RPC refuses it too) */
  const viewer = isMe ? person.profile : await findProfileById(supabase, user.id);
  const canFollow = !isMe && !isOrg && viewer?.role !== "org";
  const following = canFollow ? await isFollowingPerson(supabase, userId) : false;

  return <PublicPersonPage person={person} isMe={isMe} following={following} signedIn={Boolean(user)} canFollow={canFollow} />;
}
