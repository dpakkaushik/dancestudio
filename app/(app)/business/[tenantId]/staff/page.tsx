import { redirect } from "next/navigation";
import { StaffDesk } from "@/features/staff/components/StaffDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPendingInvites } from "@/repositories/invites";
import { findTenantPayLedger } from "@/repositories/payouts";
import { findMyMembershipRole, findMyTenants, findTenantTeam } from "@/repositories/tenants";

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

  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const [team, invites, myRole, ledger] = await Promise.all([
    findTenantTeam(supabase, tenantId),
    findPendingInvites(supabase, tenantId),
    findMyMembershipRole(supabase, tenantId),
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
