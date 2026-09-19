import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityStatsPage, type Standing } from "@/features/stats/components/EntityStatsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewById } from "@/repositories/crews";
import { findEntityChartRow } from "@/repositories/stats";
import { CREW_GRAD } from "@/types/crew";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /crew/{id}/stats — this crew's figures and its place on the crew board (push
 *  2, 19 Sep 2026). A crew is public, so this is too; what it counts is what the
 *  crew board counts — events entered and members confirmed — with the same
 *  honesty about wins: none is recorded, so none is claimed. */
export default async function CrewStatsPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!UUID_RE.test(crewId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const crew = await findCrewById(supabase, crewId);
  if (!crew) {
    notFound();
  }
  const [everywhere, inCity] = await Promise.all([
    findEntityChartRow(supabase, { segment: "crew", id: crewId }),
    findEntityChartRow(supabase, { segment: "crew", id: crewId, city: crew.city }),
  ]);
  const standings: Standing[] = [
    { scope: "Everywhere", row: everywhere },
    { scope: `In ${crew.city}`, row: inCity },
  ];
  return <EntityStatsPage name={crew.name} eyebrow="Crew" segment="crew" accent={CREW_GRAD[1]} backHref={`/crew/${crewId}`} standings={standings} />;
}
