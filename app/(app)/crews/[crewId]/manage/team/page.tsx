import { CrewManager } from "@/features/crews/components/CrewManager";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { dayKeyOf } from "@/lib/format/month";
import { findCrewEntries, findCrewMembers } from "@/repositories/crews";

const stampNowIso = (): string => new Date().toISOString();

/** The crew's TEAM desk (18 Sep 2026) — the roster half of S_crewmanage, behind
 *  the Team tile on the crew's home: the members, the asks still waiting, Promote
 *  / Make leader / Remove, the order the public page prints, ＋ Add member. */
export default async function CrewTeamPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [members, entries] = await Promise.all([findCrewMembers(supabase, crewId), findCrewEntries(supabase, crewId)]);
  return <CrewManager crew={crew} members={members} entries={entries} todayKey={dayKeyOf(stampNowIso())} section="members" />;
}
