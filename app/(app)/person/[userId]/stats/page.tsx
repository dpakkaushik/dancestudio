import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StatsPageBody, type StatsQuery } from "@/features/stats/components/StatsPageBody";
import { ROLE_RING } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublicPerson } from "@/repositories/publicPerson";
import { KIND_WORD, kindOf } from "@/types/profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /person/{id}/stats — this person's record, their history and the rankings.
 *
 *  ⚠⚠ THE THREE-COLUMN SCREEN IS BACK, AND THIS UNDOES C86 (29 Sep 2026). That
 *  day the two stats screens were collapsed into one — correctly — and into the
 *  WRONG ONE: `StatsScreen` (Record with its number grid and its graphs ·
 *  History · Rankings) was deleted and the thin `EntityStatsPage` kept. The user:
 *  *"you messed up with the stats page — it was supposed to be the one with the
 *  graphs and number grid, history and rankings in 3 columns for all profiles."*
 *  So it is the rich screen that is universal now, which is what "only one view"
 *  should have meant.
 *
 *  The door is unchanged: a signed-in reader gets anybody's; a stranger gets a
 *  public ARTIST's and is sent to sign in for a plain user's (`findPublicPerson`
 *  and `entity_chart_row` draw the same line). What a stranger can READ is
 *  narrower, and `StatsPageBody` says which column is which rather than drawing
 *  an empty shelf. */
export default async function PersonStatsPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<StatsQuery> }) {
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
  const kind = kindOf(person.isArtist);
  return (
    <StatsPageBody
      subject={{
        kind: "person",
        id: userId,
        name: person.profile.fullName,
        eyebrow: KIND_WORD[kind],
        accent: ROLE_RING[kind][1],
        backHref: `/person/${userId}`,
        segment: kind === "artist" ? "artist" : "dancer",
        city: person.profile.city,
        isArtist: person.isArtist,
        stats: person.stats,
      }}
      query={await searchParams}
      basePath={`/person/${userId}/stats`}
    />
  );
}
