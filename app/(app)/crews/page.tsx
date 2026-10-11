import { redirect } from "next/navigation";
import { CrewForm } from "@/features/crews/components/CrewForm";
import { CrewsHub } from "@/features/crews/components/CrewsHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews, findMyMemberCrews, findMyPendingCrewAsks } from "@/repositories/crews";
import { findMyInboxOff } from "@/repositories/askSettings";
import { findProfileById } from "@/repositories/profiles";

/** The Crews hub — TWO COLUMNS: the crews you created, and the crews you are a
 *  part of (29 Sep 2026; S_bizhub 2585-2691's two relationships).
 *
 *  ⚠ Practices left this hub the same day for its own tile at `/practice`. */
export default async function CrewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const opening = sp.new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* ⚠ THE CREW ASKS ARE ANSWERED HERE (11 Oct 2026, the user: "handle invites to
     join a team and crew from the crew and studio tabs at home. remove from
     inbox") — the unanswered ones put to you, and the switch behind the gear */
  const [led, member, asks, inboxOff] = await Promise.all([
    findMyLedCrews(supabase),
    findMyMemberCrews(supabase),
    findMyPendingCrewAsks(supabase, ["asked"]).catch(() => []),
    findMyInboxOff(supabase, user.id),
  ]);
  /* the segment the ADDRESS asks for — the URL is the state, as on every other
     segmented desk in the app (19 Sep 2026's rule); with no `?show=` the hub
     opens on Member while an ask waits there (11 Oct 2026) */
  const show = sp.show === "in" || (sp.show === undefined && asks.length > 0) ? "in" : "led";
  /* ⚠ THE ONE READ THE FORM NEEDS IS MADE ONLY WHEN THE FORM IS ASKED FOR
     (22 Sep 2026). Create crew opens over this hub now, and the form wants the
     city to start from — which this page had no reason to read. Behind `?new=1`
     it costs a round trip on the press and nothing on every other visit, which
     is the whole reason the sheet is URL state rather than desk state. */
  const profile = opening ? await findProfileById(supabase, user.id).catch(() => null) : null;
  return (
    <>
      <CrewsHub
        led={led}
        member={member}
        show={show}
        asks={asks.map((a) => ({ id: a.id, crewId: a.crewId, crewName: a.crewName, crewCity: a.crewCity, leaderName: a.leaderName, crewPhoto: a.crewPhoto ?? null }))}
        inboxOff={inboxOff}
      />
      {opening && profile ? <CrewForm defaultCity={profile.city} sheet /> : null}
    </>
  );
}
