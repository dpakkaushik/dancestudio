import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { MyPractices } from "@/features/crews/components/MyPractices";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyCrewPractices } from "@/repositories/crewPractices";

export const metadata: Metadata = { title: "Practice — DanceOS" };

/** PRACTICE, ON ITS OWN (29 Sep 2026, the user: *"practice should be seprate tab
 *  in home tab not in crew"*).
 *
 *  Every practice of every crew you are on — what is coming, what is over, the
 *  answer pair on anything you were ASKED to, and Register › on anything you
 *  lead. It was a section stacked under both crew lists (27 Sep), then a segment
 *  of the Crews hub (28 Sep); it is a tile on Home now, because "what am I
 *  rehearsing this week" is not a question about crews.
 *
 *  ⚠ `my_crew_practices` is scoped to `auth.uid()` inside its own SQL — there is
 *  no `p_user_id` on it to aim at anybody else — and it answers with an empty
 *  list rather than throwing, so this screen never fails over a missing crew.
 *
 *  ⚠ A LEADER GETS A LINK, NOT A SECOND REGISTER: their desk at
 *  `/crews/{id}/manage/practice` has the roster, the check-in and Call it off,
 *  and two doors to one subject is the shape this repo has paid for twice. */
export default async function PracticePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const practices = await findMyCrewPractices(supabase);
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint and the same word as the tile that opened it */}
        <DeskHero tool="practice" as="h1" margin="0 0 12px" />
        <MyPractices practices={practices} todayIso={new Date().toISOString()} bare />
      </div>
    </div>
  );
}
