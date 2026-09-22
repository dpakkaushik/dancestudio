import { redirect } from "next/navigation";
import { CrewForm } from "@/features/crews/components/CrewForm";
import { CrewsHub } from "@/features/crews/components/CrewsHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews, findMyMemberCrews } from "@/repositories/crews";
import { findProfileById } from "@/repositories/profiles";

/** The Crews hub — the crews you lead, then the crews you are in (S_crews 2691). */
export default async function CrewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [led, member] = await Promise.all([findMyLedCrews(supabase), findMyMemberCrews(supabase)]);
  /* ⚠ THE ONE READ THE FORM NEEDS IS MADE ONLY WHEN THE FORM IS ASKED FOR
     (22 Sep 2026). Create crew opens over this hub now, and the form wants the
     city to start from — which this page had no reason to read. Behind `?new=1`
     it costs a round trip on the press and nothing on every other visit, which
     is the whole reason the sheet is URL state rather than desk state. */
  const profile = opening ? await findProfileById(supabase, user.id).catch(() => null) : null;
  return (
    <>
      <CrewsHub led={led} member={member} />
      {opening && profile ? <CrewForm defaultCity={profile.city} sheet /> : null}
    </>
  );
}
