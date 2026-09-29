import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatsPageBody, type StatsQuery } from "@/features/stats/components/StatsPageBody";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewById } from "@/repositories/crews";
import { CREW_GRAD } from "@/types/crew";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /crew/{id}/stats — the same three columns every profile wears (29 Sep 2026).
 *  A crew is public, so this is too.
 *
 *  ⚠ A crew's Record is the thinnest of the three, and it is thin HONESTLY: the
 *  crew board's only term is its confirmed roster since the events removal took
 *  "Event entered · +3 pts" with it (29 Sep 2026), and inventing a second term
 *  to make the card look fuller would be a claim about a formula nobody has
 *  decided. Its practices are the crew's own business (R53 — no anon policy, no
 *  anon grant), so they are not a public history and never will be. */
export default async function CrewStatsPage({ params, searchParams }: { params: Promise<{ crewId: string }>; searchParams: Promise<StatsQuery> }) {
  const { crewId } = await params;
  if (!UUID_RE.test(crewId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const crew = await findCrewById(supabase, crewId);
  if (!crew) {
    notFound();
  }
  return (
    <StatsPageBody
      subject={{
        kind: "crew",
        id: crewId,
        name: crew.name,
        eyebrow: "Crew",
        accent: CREW_GRAD[1],
        backHref: `/crew/${crewId}`,
        segment: "crew",
        city: crew.city,
        isArtist: false,
        stats: null,
      }}
      query={await searchParams}
      basePath={`/crew/${crewId}/stats`}
    />
  );
}
