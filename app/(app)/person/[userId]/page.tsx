import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PublicPersonPage } from "@/features/profiles/components/PublicPersonPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublicPerson, isFollowingPerson } from "@/repositories/publicPerson";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadPerson = cache(async (userId: string) => {
  const supabase = await createSupabaseServerClient();
  return findPublicPerson(supabase, userId);
});

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) return { title: "Dancer — DanceOS" };
  const person = await loadPerson(userId);
  return person
    ? { title: `${person.profile.fullName} — DanceOS`, description: `${person.profile.fullName} on DanceOS${person.profile.city ? ` · ${person.profile.city}` : ""}.` }
    : { title: "Dancer — DanceOS" };
}

/** A person's page. Signed-in only, deliberately: `profiles` is readable by
 *  signed-in users (Step 1), and whether a person page should be PUBLIC is a
 *  decision about somebody else's data — it stays on the backlog rather than
 *  being taken in passing here. */
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
  const following = user.id === userId ? false : await isFollowingPerson(supabase, userId);

  return <PublicPersonPage person={person} isMe={user.id === userId} following={following} signedIn={Boolean(user)} />;
}
