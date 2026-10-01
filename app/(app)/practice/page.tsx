import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { MyPractices } from "@/features/crews/components/MyPractices";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
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
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const params = await searchParams;
  const rawShow = Array.isArray(params.show) ? params.show[0] : params.show;
  const practices = await findMyCrewPractices(supabase);
  /* ⚠ TWO COLUMNS, THE CREWS HUB'S OWN TWO (1 Oct 2026, the user: *"practice also
     in 2 columns"*): the practices of crews you LEAD — the ones you arranged and
     run the register for — and the ones of crews you are IN, where you were
     asked. It is the same split Crews and Studios wear since 30 Sep, so the
     three hubs read one way. Each column keeps its own Coming up / Over. */
  const led = practices.filter((p) => p.iLead);
  const member = practices.filter((p) => !p.iLead);
  /* a link naming a column wins; otherwise open on the one that has something,
     leading first — the person who arranged a practice came here to run it */
  const show = rawShow === "in" ? "in" : rawShow === "led" ? "led" : led.length === 0 && member.length > 0 ? "in" : "led";
  const todayIso = new Date().toISOString();
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint and the same word as the tile that opened it */}
        <DeskHero tool="practice" as="h1" margin="0 0 12px" />
        <SegmentedPanels
          /* the key is the SERVER's answer, so a link carrying `?show=` wins */
          key={show}
          initial={show}
          label="Show"
          segments={[
            { key: "led", href: "/practice?show=led", label: "Yours", n: led.length, aria: "Practices of the crews you lead" },
            { key: "in", href: "/practice?show=in", label: "You are in", n: member.length, aria: "Practices of the crews you are a part of" },
          ]}
          panels={[
            {
              key: "led",
              node: <MyPractices practices={led} todayIso={todayIso} bare empty="Nothing arranged yet — practices you arrange for a crew you lead land here." />,
            },
            {
              key: "in",
              node: <MyPractices practices={member} todayIso={todayIso} bare empty="Nothing yet — when a crew you are on arranges one, you are asked here." />,
            },
          ]}
        />
      </div>
    </div>
  );
}
