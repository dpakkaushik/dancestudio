import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyMemberships } from "@/repositories/businesses";
import { findProfileById } from "@/repositories/profiles";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { InviteHeadButtons } from "@/features/inbox/components/JoinInvites";
import { ArtistTeams } from "@/features/staff/components/ArtistTeams";
import { loadArtistTeams } from "@/features/staff/server/loadArtistTeams";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";

/** /team — the Team tile for everybody (11 Oct 2026, the user's answer "Team tile
 *  for everyone"). Somebody with an artist page of their own has a team, so they
 *  land on that page's desk on its Artist Teams column; everybody else gets the
 *  Artist Teams column alone: the artists asking them onto a team, and the
 *  artists' teams they are on. A studio's invitations stay on the Studios hub. */
export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [profile, memberships] = await Promise.all([findProfileById(supabase, user.id), findMyMemberships(supabase)]);
  if (!profile) redirect("/onboarding");
  const ownPage = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page");
  if (ownPage) redirect(`/business/${ownPage.business.id}/staff?show=artists`);

  const data = await loadArtistTeams(supabase, user.id);
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "0 16px 40px", boxSizing: "border-box" }}>
      <DeskTop style={{ paddingBottom: 4 }}>
        <div style={{ position: "relative", margin: "0 0 12px" }}>
          <DeskHero tool="team" as="h1" margin="0" toggle={false} />
          <InviteHeadButtons
            answered={data.answered}
            answeredTestId="artist-team-answered"
            answeredListTestId="artist-team-answered-list"
            answeredLabel="Answered artist invitations"
            settings={{ testId: "artist-teams-settings", kind: "team", off: data.inboxOff, title: "Team invitations" }}
          />
        </div>
      </DeskTop>
      <DeskBody style={{ paddingBottom: 4 }}>
        <ArtistTeams invites={data.invites} teams={data.teams} stayOn="/team" />
      </DeskBody>
    </div>
  );
}
