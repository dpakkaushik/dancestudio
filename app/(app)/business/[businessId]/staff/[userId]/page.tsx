import { notFound, redirect } from "next/navigation";
import { PersonPayments } from "@/features/staff/components/PersonPayments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPersonPayHistory } from "@/repositories/payouts";
import { findMyMemberships, findTenantTeam, runsTheBusiness } from "@/repositories/businesses";

/** EVERY TRANSACTION WITH ONE PERSON (29 Sep 2026, the user: "Team payment
 *  history to be a button called History which should show all transactions
 *  with that particular person on a different page").
 *
 *  The member sheet drew the last six payments inline with no way to reach the
 *  rest, so a studio that had paid somebody monthly for a year saw half of it
 *  under a total that counted all of it. This is the page behind the History
 *  button on that sheet.
 *
 *  ⚠ THE OWNER'S ALONE, and re-checked here rather than trusted from the sheet.
 *  `runsTheBusiness` lets a manager onto the Team desk (28 Sep 2026, R55/R56)
 *  and what somebody is PAID is the owner's — the same line `StaffDesk` draws
 *  the PAYMENTS block behind. A URL is a request, never an authority. */
export default async function StaffPersonPaymentsPage({
  params,
}: {
  params: Promise<{ businessId: string; userId: string }>;
}) {
  const { businessId, userId } = await params;
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

  const [team, history] = await Promise.all([
    findTenantTeam(supabase, businessId),
    findPersonPayHistory(supabase, businessId, userId),
  ]);

  /* ⚠ THE NAME COMES OFF THE TEAM, NOT OFF THE PAYMENTS. Somebody who has been
     paid nothing yet has no payout row to read a name from — and that is the
     commonest way to arrive here, since History is on every member's sheet. */
  const member = team.find((m) => m.userId === userId);
  if (!member) {
    /* not on this team: the row does not exist, so neither does the page */
    notFound();
  }

  return (
    <PersonPayments
      businessId={businessId}
      businessName={seat.business.name}
      personName={member.name}
      avatarPath={member.avatarPath}
      history={history}
    />
  );
}
