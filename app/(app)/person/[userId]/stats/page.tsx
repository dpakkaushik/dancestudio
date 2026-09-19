import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntityStatsPage, type Standing } from "@/features/stats/components/EntityStatsPage";
import { ROLE_RING } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublicPerson } from "@/repositories/publicPerson";
import { findEntityChartRow } from "@/repositories/stats";
import { KIND_WORD, kindOf } from "@/types/profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /person/{id}/stats — this person's record and where they stand (push 2,
 *  19 Sep 2026). The same door the person page has: a signed-in reader gets
 *  anybody's; a stranger gets a public ARTIST's and is sent to sign in for a
 *  plain user's (`findPublicPerson` and `entity_chart_row` draw the same line).
 *  An organization's standing is its studios' — its own address. */
export default async function PersonStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const person = await findPublicPerson(supabase, userId);
  if (!person) {
    if (!user) {
      redirect(`/login?next=${encodeURIComponent(`/person/${userId}/stats`)}`);
    }
    notFound();
  }
  if (person.profile.role === "org") {
    redirect(`/org/${userId}/stats`);
  }
  const kind = kindOf(person.profile.role, person.isArtist);
  const segment = kind === "artist" ? "artist" : "dancer";
  const city = person.profile.city;
  const [everywhere, inCity] = await Promise.all([
    findEntityChartRow(supabase, { segment, id: userId }),
    city ? findEntityChartRow(supabase, { segment, id: userId, city }) : Promise.resolve(null),
  ]);
  const standings: Standing[] = [{ scope: "Everywhere", row: everywhere }, ...(city ? [{ scope: `In ${city}`, row: inCity }] : [])];
  return <EntityStatsPage name={person.profile.fullName} eyebrow={KIND_WORD[kind]} segment={segment} accent={ROLE_RING[kind][1]} backHref={`/person/${userId}`} standings={standings} stats={person.stats} />;
}
