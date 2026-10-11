import { CrewManager } from "@/features/crews/components/CrewManager";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { crewAnsweredRow } from "@/features/inbox/inviteRows";
import { findCrewAnsweredAsks, findCrewMembers } from "@/repositories/crews";

/** The crew's TEAM desk (18 Sep 2026) — the roster half of S_crewmanage, behind
 *  the Team tile on the crew's home: the members, the asks still waiting, Promote
 *  / Make leader / Remove, the order the public page prints, ＋ Add member.
 *
 *  ⚠ It was the ROSTER half because the desk had two: the battle record was the
 *  other, at `/manage/events`. That went with events on 29 Sep 2026, so this is
 *  the whole desk now and `section` has nothing left to choose between.
 *
 *  ⚠ The asks the leader sent that are OVER (said yes, said no, taken back, or
 *  joined and left) are the head's Answered sheet since 11 Oct 2026, the shape
 *  Classes gives its own; a failed read is simply none. */
export default async function CrewTeamPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [members, answered] = await Promise.all([
    findCrewMembers(supabase, crewId),
    findCrewAnsweredAsks(supabase, crewId).catch(() => []),
  ]);
  return <CrewManager crew={crew} members={members} answered={answered.map((a) => crewAnsweredRow(a, "sender"))} />;
}
