import { CrewManager } from "@/features/crews/components/CrewManager";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { dayKeyOf } from "@/lib/format/month";
import { findCrewEntries, findCrewMembers } from "@/repositories/crews";

const stampNowIso = (): string => new Date().toISOString();

/** The crew's EVENTS desk (18 Sep 2026) — the battle record half of
 *  S_crewmanage, behind the Events tile on the crew's home: every event the crew
 *  entered, each a door to its page, and the crew ranking. */
export default async function CrewEventsPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [members, entries] = await Promise.all([findCrewMembers(supabase, crewId), findCrewEntries(supabase, crewId)]);
  return <CrewManager crew={crew} members={members} entries={entries} todayKey={dayKeyOf(stampNowIso())} section="battles" />;
}
