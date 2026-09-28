import { redirect } from "next/navigation";
import { CrewForm } from "@/features/crews/components/CrewForm";
import { CrewsHub } from "@/features/crews/components/CrewsHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCrewPractices } from "@/repositories/crewPractices";
import { findMyLedCrews, findMyMemberCrews } from "@/repositories/crews";
import { findProfileById } from "@/repositories/profiles";

/** The Crews hub — the crews you lead, then the crews you are in (S_crews 2691). */
export default async function CrewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const opening = sp.new === "1";
  /* the segment the ADDRESS asks for — the URL is the state, as on every other
     segmented desk in the app (19 Sep 2026's rule) */
  const show = sp.show === "practices" ? "practices" : "crews";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* ⚠ THE PRACTICES RIDE THE BATCH THIS PAGE ALREADY AWAITED (27 Sep 2026), so
     the hub costs one round trip more in parallel rather than one more in
     series. `my_crew_practices` is scoped to `auth.uid()` inside its own SQL —
     there is no `p_user_id` on it to aim at anybody else — and it answers with
     an empty list rather than throwing, so a hub never fails over a panel. */
  const [led, member, practices] = await Promise.all([findMyLedCrews(supabase), findMyMemberCrews(supabase), findMyCrewPractices(supabase)]);
  /* ⚠ THE ONE READ THE FORM NEEDS IS MADE ONLY WHEN THE FORM IS ASKED FOR
     (22 Sep 2026). Create crew opens over this hub now, and the form wants the
     city to start from — which this page had no reason to read. Behind `?new=1`
     it costs a round trip on the press and nothing on every other visit, which
     is the whole reason the sheet is URL state rather than desk state. */
  const profile = opening ? await findProfileById(supabase, user.id).catch(() => null) : null;
  return (
    <>
      <CrewsHub led={led} member={member} practices={practices} todayIso={new Date().toISOString()} show={show} />
      {opening && profile ? <CrewForm defaultCity={profile.city} sheet /> : null}
    </>
  );
}
