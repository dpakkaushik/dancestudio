import { redirect } from "next/navigation";
import { StaffDesk } from "@/features/staff/components/StaffDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findSentInvites } from "@/repositories/invites";
import { sentTeamAnsweredRow } from "@/features/inbox/inviteRows";
import { findBusinessPayLedger } from "@/repositories/payouts";
import { findMyMemberships, findBusinessTeam, runsTheBusiness } from "@/repositories/businesses";
import { findTeamClassCounts } from "@/repositories/teamMemberWork";
import { loadArtistTeams } from "@/features/staff/server/loadArtistTeams";

/* the clock, stamped once outside render (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

export default async function BusinessStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const asked = (await searchParams).show;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* ⚠ THE SEAT HAS TO RUN THE BUSINESS (28 Sep 2026). This was membership-only,
     so a visiting teacher who had accepted one class read the whole roster —
     every colleague's name and seat, every invite the studio had sent, and the
     ledger of what it had paid each of them. `MEMBER_POWER_NOTE` never claimed
     that, which is what makes it a gate rather than a new rule. ⚠ The role rides
     the guard's own query now, so the separate `findMyMembershipRole` is gone. */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const business = seat.business;
  const myRole = seat.memberRole;

  /* ⚠ WHO MAY REMOVE ANOTHER OWNER is read by the Member Detail page now
     (4 Oct 2026): the Manage sheet moved there, so this desk no longer asks */
  /* ⚠ EVERY INVITE THE DESK HAS SENT (11 Oct 2026): the pending ones are the
     WAITING rows, the answered ones the head's Answered sheet, as on Classes */
  const [team, sent, ledger] = await Promise.all([
    findBusinessTeam(supabase, businessId),
    findSentInvites(supabase, businessId),
    /* WHAT THIS BUSINESS HAS PAID ITS PEOPLE (19 Sep 2026, the user: "able to pay
       them, track payment history"). One read for the whole desk — every row
       carries its `userId`, so a person's history is that list filtered, rather
       than a query per person opened. It fails soft: a Team desk must not break
       over a money read. */
    findBusinessPayLedger(supabase, businessId, stampNowIso()).catch(() => null),
  ]);
  /* each member's Classes figure (4 Oct 2026, the user: "Paid Payments and Classes
     for - Team Member Cards") — the Member Detail page's own rule, one batch for
     the desk; a failed read draws no figure rather than a wrong one */
  const invites = sent.filter((i) => i.status === "pending");
  const answered = sent.flatMap((i) => {
    const row = sentTeamAnsweredRow(i, null);
    return row ? [row] : [];
  });
  /* ⚠ MY TEAM · ARTIST TEAMS (11 Oct 2026, the user: "Team section to have two
     columns My Team … and Artist Teams which manages team invites from artist").
     Only on the viewer's OWN artist page — a studio's desk is its team alone,
     and a studio's invitations are answered on the Studios hub. */
  const ownArtistPage = business.type === "artist_page" && myRole === "owner";
  const [classCounts, artistData] = await Promise.all([
    findTeamClassCounts(supabase, businessId, team.map((m) => m.userId)).catch(() => null),
    ownArtistPage ? loadArtistTeams(supabase, user.id) : Promise.resolve(null),
  ]);

  return (
    <StaffDesk
      businessId={businessId}
      businessName={business.name}
      businessType={business.type}
      team={team}
      invites={invites}
      answered={answered}
      payments={ledger?.payouts ?? []}
      classCounts={classCounts ? Object.fromEntries(classCounts) : null}
      // asking and removing are the owner's alone (§10.9); everyone else reads
      isOwner={myRole === "owner"}
      meUserId={user.id}
      artistTeams={artistData ? { ...artistData, stayOn: `/business/${businessId}/staff?show=artists` } : null}
      initialColumn={asked === "artists" || (asked === undefined && (artistData?.invites.length ?? 0) > 0) ? "artists" : "mine"}
    />
  );
}
