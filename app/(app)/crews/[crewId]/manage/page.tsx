import { CrewHome } from "@/features/crews/components/CrewHome";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { dayKeyOf } from "@/lib/format/month";
import { findCrewEntries, findCrewMembers } from "@/repositories/crews";
import { findCrewHeaderPhotos } from "@/repositories/headerPhotos";

const stampNowIso = (): string => new Date().toISOString();

/** THE CREW'S HOME (18 Sep 2026) — what a crew you lead opens. It was the
 *  members desk itself (S_crewmanage) until the user asked for a home with
 *  tools; the desk is one tile away at /manage/team, the battle record at
 *  /manage/events, and the URL stays what the hub, the Inbox and the e2e have
 *  always pointed at (Rule 14). The header pictures (19 Sep 2026) ride in for
 *  the hero and for the Edit sheet's grid. */
export default async function CrewManagePage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [members, entries, header] = await Promise.all([findCrewMembers(supabase, crewId), findCrewEntries(supabase, crewId), findCrewHeaderPhotos(supabase, crewId)]);
  return <CrewHome crew={crew} members={members} entries={entries} header={header} todayKey={dayKeyOf(stampNowIso())} />;
}
