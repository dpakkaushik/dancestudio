import { notFound, redirect } from "next/navigation";
import { TeamMemberPage, type TeamMemberShow } from "@/features/staff/components/TeamMemberPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPersonPayHistory } from "@/repositories/payouts";
import { findTeamMemberWork } from "@/repositories/teamMemberWork";
import { findMyMemberships, findBusinessTeam, runsTheBusiness } from "@/repositories/businesses";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ONE PERSON ON THIS TEAM — their payments, their stats and how their classes
 *  went here (29 Sep 2026 as the payment history; 3 Oct 2026 as the team
 *  member's own page, the user: *"should have payment details, artist stats and
 *  performance for that team"*). `?show=payments|stats|performance`.
 *
 *  ⚠ THE OWNER'S ALONE, and re-checked here rather than trusted from the card.
 *  `runsTheBusiness` lets a manager onto the Team desk (28 Sep 2026, R55/R56)
 *  and what somebody is PAID is the owner's. A URL is a request, never an
 *  authority. */
export default async function TeamMemberRoute({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; userId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const [{ businessId, userId }, { show: asked }] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(businessId) || !UUID_RE.test(userId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole) || seat.memberRole !== "owner") {
    redirect(`/business/${businessId}/staff`);
  }

  const [team, history, work] = await Promise.all([
    findBusinessTeam(supabase, businessId),
    findPersonPayHistory(supabase, businessId, userId),
    findTeamMemberWork(supabase, businessId, userId),
  ]);

  /* ⚠ THE PERSON COMES OFF THE TEAM, NOT OFF THE PAYMENTS — somebody paid
     nothing yet has no payout row to read a name from */
  const member = team.find((m) => m.userId === userId);
  if (!member) {
    notFound();
  }

  const show: TeamMemberShow = asked === "stats" || asked === "performance" ? asked : "payments";
  return <TeamMemberPage businessId={businessId} businessName={seat.business.name} member={member} history={history} work={work} show={show} />;
}
