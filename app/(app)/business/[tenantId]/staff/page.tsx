import { redirect } from "next/navigation";
import { StaffDesk } from "@/features/staff/components/StaffDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPendingInvites } from "@/repositories/invites";
import { findMyMembershipRole, findMyTenants, findTenantTeam } from "@/repositories/tenants";

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

  const tenants = await findMyTenants(supabase);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const [team, invites, myRole] = await Promise.all([
    findTenantTeam(supabase, tenantId),
    findPendingInvites(supabase, tenantId),
    findMyMembershipRole(supabase, tenantId),
  ]);

  return (
    <StaffDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      team={team}
      invites={invites}
      // asking and removing are the owner's alone (§10.9); everyone else reads
      isOwner={myRole === "owner"}
      meUserId={user.id}
    />
  );
}
