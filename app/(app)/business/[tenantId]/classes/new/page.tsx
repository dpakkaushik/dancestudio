import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyMemberships } from "@/repositories/tenants";

/** Add class. THE OWNER ALONE (18 Sep 2026, the user: "an artist should not
 *  create form on behalf of a studio"; asked who creates and edits: "Owner
 *  alone") — the RPC refuses anybody else, and so does this page, in the same
 *  breath. A studio's form offers its rooms; an artist's offers a studio to ask
 *  or a place of their own. */
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

  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/business");
  }
  const { tenant, memberRole } = membership;
  /* the hosting row has no classes and no form for one (17 Sep 2026) */
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  if (memberRole !== "owner") {
    redirect(tenant.type === "artist_page" ? "/my-classes" : `/business/${tenantId}/classes`);
  }

  const [rooms, cityCentres] = await Promise.all([
    tenant.type === "studio" ? findRoomsByTenant(supabase, tenantId) : Promise.resolve([]),
    tenant.type === "artist_page" ? findDiscoverCities(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <ClassForm
      tenantId={tenantId}
      tenantType={tenant.type}
      rooms={rooms}
      isOwner
      studioPlace={[tenant.area, tenant.city].filter(Boolean).join(", ")}
      cityCentres={cityCentres}
      city={tenant.city}
    />
  );
}
