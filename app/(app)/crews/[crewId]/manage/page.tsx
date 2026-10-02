import { CrewHome } from "@/features/crews/components/CrewHome";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { toolsLayoutKey } from "@/features/home/toolOrder";
import { findMyToolOrder } from "@/repositories/layout";
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
  /* the follower count joins the batch rather than adding a round trip — and a
     failed read is a 0 on a figure, never a crew's home that will not open */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [members, header, followers, order] = await Promise.all([
    findCrewMembers(supabase, crewId),
    findCrewHeaderPhotos(supabase, crewId),
    findCrewFollowerCount(supabase, crewId).catch(() => 0),
    /* how THIS leader has arranged THIS crew's tools (22 Sep 2026) — the read
       rides the batch, and `getUser` above is free: the server client memoises
       it per request (19 Sep 2026), so `requireLedCrew` has already paid for it */
    user ? findMyToolOrder(supabase, user.id, toolsLayoutKey("crew", crewId)) : Promise.resolve(null),
    /* ⚠ the LEADER's following count left this batch on 2 Oct 2026 — a crew's
       Following is its team now (the user), drawn off `members` above */
  ]);
  return (
    <CrewHome
      crew={crew}
      members={members}
      header={header}
      followers={followers ?? 0}
      order={order}
      editOpen={editOpen}
    />
  );
}
