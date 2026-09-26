import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClaimsByClass } from "@/repositories/claims";
import { findClassById } from "@/repositories/classes";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findBusinessName, findMyMemberships } from "@/repositories/tenants";

/** Edit class — the owner alone (18 Sep 2026), like Add class. */
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

  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/business");
  }
  const { tenant, memberRole } = membership;
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  if (memberRole !== "owner") {
    redirect(tenant.type === "artist_page" ? "/my-classes" : `/business/${tenantId}/classes`);
  }

  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.tenantId !== tenantId) {
    redirect(tenant.type === "artist_page" ? "/my-classes?show=manage" : `/business/${tenantId}/classes`);
  }

  /* ⚠ `findDiscoverCities` LEFT THIS LIST WITH THE MAP PICKER (20 Sep 2026) —
     it centred a map this form no longer draws. One round trip fewer on every
     edit. */
  const [rooms, claims, venueName] = await Promise.all([
    tenant.type === "studio" ? findRoomsByTenant(supabase, tenantId) : Promise.resolve([]),
    findClaimsByClass(supabase, classId),
    /* the studio an artist asked for a room, BY NAME — the form used to reopen on
       "the studio you asked" because only the id was on the row (18 Sep 2026) */
    danceClass.venueBusinessId ? findBusinessName(supabase, danceClass.venueBusinessId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <ClassForm
      tenantId={tenantId}
      tenantType={tenant.type}
      existing={danceClass}
      venueName={venueName}
      rooms={rooms}
      claims={claims}
      isOwner
      /* 26 Sep 2026: the owner may take their own class; an artist's class in a studio they own needs no request */
      meId={tenant.type === "studio" ? user.id : null}
      ownedStudioIds={memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "studio").map((m) => m.tenant.id)}
      studioPlace={[tenant.area, tenant.city].filter(Boolean).join(", ")}
    />
  );
}
