import { CrewHome } from "@/features/crews/components/CrewHome";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { toolsLayoutKey } from "@/features/home/toolOrder";
import { findMyToolOrder } from "@/repositories/layout";
import { dayKeyOf } from "@/lib/format/month";
import { findCrewEntries, findCrewMembers } from "@/repositories/crews";
import { findCrewFollowerCount } from "@/repositories/follows";
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
  /* the follower count joins the batch rather than adding a round trip — and a
     failed read is a 0 on a figure, never a crew's home that will not open */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [members, entries, header, followers, order] = await Promise.all([
    findCrewMembers(supabase, crewId),
    findCrewEntries(supabase, crewId),
    findCrewHeaderPhotos(supabase, crewId),
    findCrewFollowerCount(supabase, crewId).catch(() => 0),
    /* how THIS leader has arranged THIS crew's tools (22 Sep 2026) — the read
       rides the batch, and `getUser` above is free: the server client memoises
       it per request (19 Sep 2026), so `requireLedCrew` has already paid for it */
    user ? findMyToolOrder(supabase, user.id, toolsLayoutKey("crew", crewId)) : Promise.resolve(null),
  ]);
  return <CrewHome crew={crew} members={members} entries={entries} header={header} followers={followers ?? 0} order={order} todayKey={dayKeyOf(stampNowIso())} />;
}
