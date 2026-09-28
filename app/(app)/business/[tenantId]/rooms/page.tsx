import { redirect } from "next/navigation";
import { RoomForm } from "@/features/rooms/components/RoomForm";
import { RoomsManager } from "@/features/rooms/components/RoomsManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";

export default async function TenantRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { tenantId } = await params;
  /* the form opens over the desk at `?new=1` (22 Sep 2026) — and the gate is
     re-checked below against `canEdit`, because a query parameter is a request
     and never an authority */
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* membership is the spine — and the seat has to RUN the business (28 Sep 2026) */
  const seat = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const tenant = seat.tenant;

  /* ⚠ THE TWO POLICIES ON `rooms` ADMIT AN OWNER OR A TRAINER to write ("rooms
     are plain studio config, not a seat ledger"), and until 21 Sep the desk took
     no role at all — so the ＋, the ✕ and every amenity toggle were drawn for a
     visiting teacher, an assistant and the front desk, and each press came back
     an RLS refusal in silence.
     ⚠ SINCE 28 Sep 2026 ONLY A SEAT THAT RUNS THE BUSINESS REACHES THIS PAGE, so
     the trainer half of that test is unreachable from here and `canEdit` is the
     same question the guard above already answered. The seat is read once.
     ⚠ A MANAGER IS NOT IN THE `rooms` POLICIES YET — that is the held migration's
     to add; today the value cannot exist, so nobody meets the gap. */
  const myRole = seat.memberRole;
  const rooms = await findRoomsByTenant(supabase, tenantId);
  const canEdit = runsTheBusiness(myRole);
  return (
    <>
      <RoomsManager
        tenantId={tenantId}
        tenantName={tenant.name}
        tenantWhere={[tenant.area, tenant.city].filter(Boolean).join(", ") || "Your studio"}
        rooms={rooms}
        canEdit={canEdit}
      />
      {opening && canEdit ? <RoomForm tenantId={tenantId} tenantName={tenant.name} defaultName={`Room ${rooms.length + 1}`} /> : null}
    </>
  );
}
