import { redirect } from "next/navigation";
import { StaffDesk } from "@/features/staff/components/StaffDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPendingInvites } from "@/repositories/invites";
import { findTenantPayLedger } from "@/repositories/payouts";
import { findMyMemberships, findTenantTeam, runsTheBusiness } from "@/repositories/tenants";

/* the clock, stamped once outside render (react-hooks/purity) */
const stampNowIso = (): string => new Date().toISOString();

export default async function TenantStaffPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
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
  const seat = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const tenant = seat.tenant;
  const myRole = seat.memberRole;

  const [team, invites, ledger] = await Promise.all([
    findTenantTeam(supabase, tenantId),
    findPendingInvites(supabase, tenantId),
    /* WHAT THIS BUSINESS HAS PAID ITS PEOPLE (19 Sep 2026, the user: "able to pay
       them, track payment history"). One read for the whole desk — every row
       carries its `userId`, so a person's history is that list filtered, rather
       than a query per person opened. It fails soft: a Team desk must not break
       over a money read. */
    findTenantPayLedger(supabase, tenantId, stampNowIso()).catch(() => null),
  ]);

  return (
    <StaffDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      tenantType={tenant.type}
      team={team}
      invites={invites}
      payments={ledger?.payouts ?? []}
      // asking and removing are the owner's alone (§10.9); everyone else reads
      isOwner={myRole === "owner"}
      meUserId={user.id}
    />
  );
}
