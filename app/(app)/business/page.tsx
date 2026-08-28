import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/tenants/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findMyMemberships } from "@/repositories/tenants";

export default async function BusinessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  // membership is the spine, and the ROLE on it decides which list a business
  // sits in — owned rows get their room count for the sub-line (prototype 2655)
  const memberships = await findMyMemberships(supabase);
  const roomCounts = await countRoomsByTenants(
    supabase,
    memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant.id)
  );
  return <BusinessHub memberships={memberships} roomCounts={roomCounts} />;
}
