import { CrewHome } from "@/features/crews/components/CrewHome";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findCrewMembers } from "@/repositories/crews";
import { findCrewFollowerCount } from "@/repositories/follows";
import { findCrewHeaderPhotos } from "@/repositories/headerPhotos";

/** THE CREW'S HOME (18 Sep 2026) — what a crew you lead opens. It was the
 *  members desk itself (S_crewmanage) until the user asked for a home with
 *  tools; the desk is one tile away at /manage/team, and the URL stays what the
 *  hub, the Inbox and the e2e have always pointed at (Rule 14). The header
 *  pictures (19 Sep 2026) ride in for the hero and for the Edit sheet's grid.
 *  ⚠ The Events tile and its `/manage/events` battle record went with events
 *  on 29 Sep 2026, and `findCrewEntries` with them. */
export default async function CrewManagePage({ params, searchParams }: { params: Promise<{ crewId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { crewId } = await params;
  /* `?edit=1` — Settings' "Edit crew" navigates here with it (22 Sep 2026).
     `requireLedCrew` below is the authority; the query only asks. */
  const editOpen = (await searchParams).edit === "1";
  const { supabase, crew } = await requireLedCrew(crewId);
  /* the follower count joins the batch — a failed read is a 0 on a figure */
  const [members, header, followers] = await Promise.all([
    findCrewMembers(supabase, crewId),
    findCrewHeaderPhotos(supabase, crewId),
    findCrewFollowerCount(supabase, crewId).catch(() => 0),
    /* ⚠ the LEADER's following count left this batch on 2 Oct 2026 — a crew's
       Following is its team now (the user), drawn off `members` above */
  ]);
  return (
    <CrewHome
      crew={crew}
      members={members}
      header={header}
      followers={followers ?? 0}
      editOpen={editOpen}
    />
  );
}
