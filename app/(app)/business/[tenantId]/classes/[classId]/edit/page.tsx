import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassById } from "@/repositories/classes";
import { findClaimsByClass } from "@/repositories/claims";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyTenants, findTenantTeam } from "@/repositories/tenants";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ tenantId: string; classId: string }>;
}) {
  const { tenantId, classId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) {
    redirect("/business");
  }

  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.tenantId !== tenantId) {
    redirect(`/business/${tenantId}/classes`);
  }

  const [rooms, team, claims] = await Promise.all([
    findRoomsByTenant(supabase, tenantId),
    findTenantTeam(supabase, tenantId),
    findClaimsByClass(supabase, classId),
  ]);

  return (
    <ClassForm
      tenantId={tenantId}
      existing={danceClass}
      rooms={rooms}
      team={team}
      claims={claims}
    />
  );
}
