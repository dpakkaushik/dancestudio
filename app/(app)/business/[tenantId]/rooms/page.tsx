import { redirect } from "next/navigation";
import { RoomsManager } from "@/features/rooms/components/RoomsManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

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
  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  /* ⚠ EVERY MEMBER READS THE ROOMS, AN OWNER OR A TRAINER EDITS THEM — which is
     what the two policies on `rooms` admit ("rooms are plain studio config, not
     a seat ledger"). Until 21 Sep the desk took no role at all, so the ＋, the ✕
     and every amenity toggle were drawn for a visiting teacher, an assistant and
     the front desk, and each press came back an RLS refusal in silence. */
  const [rooms, myRole] = await Promise.all([
    findRoomsByTenant(supabase, tenantId),
    findMyMembershipRole(supabase, tenantId),
  ]);
  return (
    <RoomsManager
      tenantId={tenantId}
      tenantName={tenant.name}
      tenantWhere={[tenant.area, tenant.city].filter(Boolean).join(", ") || "Your studio"}
      rooms={rooms}
      canEdit={myRole === "owner" || myRole === "trainer"}
    />
  );
}
