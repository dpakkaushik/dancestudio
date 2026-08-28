import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyMembershipRole, findMyTenants, findTenantTeam } from "@/repositories/tenants";

export default async function NewClassPage({
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

  const [rooms, team, role] = await Promise.all([
    findRoomsByTenant(supabase, tenantId),
    findTenantTeam(supabase, tenantId),
    findMyMembershipRole(supabase, tenantId),
  ]);

  return (
    <ClassForm
      tenantId={tenantId}
      rooms={rooms}
      team={team}
      isOwner={role === "owner"}
      studioPlace={[tenant.area, tenant.city].filter(Boolean).join(", ")}
    />
  );
}
