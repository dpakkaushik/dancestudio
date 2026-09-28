import { CrewManager } from "@/features/crews/components/CrewManager";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findCrewMembers } from "@/repositories/crews";

/** The crew's TEAM desk (18 Sep 2026) — the roster half of S_crewmanage, behind
 *  the Team tile on the crew's home: the members, the asks still waiting, Promote
 *  / Make leader / Remove, the order the public page prints, ＋ Add member.
 *
 *  ⚠ It was the ROSTER half because the desk had two: the battle record was the
 *  other, at `/manage/events`. That went with events on 29 Sep 2026, so this is
 *  the whole desk now and `section` has nothing left to choose between. */
export default async function CrewTeamPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const members = await findCrewMembers(supabase, crewId);
  return <CrewManager crew={crew} members={members} />;
}
