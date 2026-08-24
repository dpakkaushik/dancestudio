import { redirect } from "next/navigation";
import { RoomsManager } from "@/features/rooms/components/RoomsManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyTenants } from "@/repositories/tenants";

export default async function TenantRoomsPage({
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

  // membership is the spine — findMyTenants filters to the caller's own rows
  const tenants = await findMyTenants(supabase);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const rooms = await findRoomsByTenant(supabase, tenantId);
  return (
    <RoomsManager
      tenantId={tenantId}
      tenantName={tenant.name}
      tenantWhere={[tenant.area, tenant.city].filter(Boolean).join(", ") || "Your studio"}
      rooms={rooms}
    />
  );
}
