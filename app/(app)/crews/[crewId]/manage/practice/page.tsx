import { PracticeDesk } from "@/features/crews/components/PracticeDesk";
import { PracticeForm } from "@/features/crews/components/PracticeForm";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findCrewPractices } from "@/repositories/crewPractices";

const stampNowIso = (): string => new Date().toISOString();

/** THE CREW'S PRACTICE DESK (27 Sep 2026) — behind the Practice tile on its own
 *  home. `requireLedCrew` is the guard, as it is for the Team and Events desks:
 *  arranging, cancelling and the register are the leader's, and the database
 *  says so again on every write.
 *
 *  ⚠ `?new=1` OPENS THE FORM AS A SHEET OVER THIS DESK (C54), and the gate is
 *  RE-CHECKED here rather than trusted from the query — the guard above has
 *  already run for the page, so the parameter asks and never authorises. */
export default async function CrewPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ crewId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { crewId } = await params;
  const { new: isNew } = await searchParams;
  const { supabase, crew } = await requireLedCrew(crewId);
  const practices = await findCrewPractices(supabase, crewId);
  return (
    <>
      <PracticeDesk crewId={crewId} crewName={crew.name} practices={practices} todayIso={stampNowIso()} />
      {isNew ? <PracticeForm crewId={crewId} crewName={crew.name} /> : null}
    </>
  );
}
