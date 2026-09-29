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
  params: Promise<{ businessId: string; classId: string }>;
}) {
  const { businessId, classId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.business.id === businessId);
  if (!membership) {
    redirect("/business");
  }
  const { business, memberRole } = membership;
  /* ⚠ the hosting row's redirect went with events (29 Sep 2026) */
  if (memberRole !== "owner") {
    redirect(business.type === "artist_page" ? "/my-classes" : `/business/${businessId}/classes`);
  }

  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.businessId !== businessId) {
    redirect(business.type === "artist_page" ? "/my-classes?show=manage" : `/business/${businessId}/classes`);
  }

  /* ⚠ `findDiscoverCities` LEFT THIS LIST WITH THE MAP PICKER (20 Sep 2026) —
     it centred a map this form no longer draws. One round trip fewer on every
     edit. */
  const [rooms, classPeople, venueName] = await Promise.all([
    business.type === "studio" ? findRoomsByTenant(supabase, businessId) : Promise.resolve([]),
    findClaimsByClass(supabase, classId),
    /* the studio an artist asked for a room, BY NAME — the form used to reopen on
       "the studio you asked" because only the id was on the row (18 Sep 2026) */
    danceClass.venueBusinessId ? findBusinessName(supabase, danceClass.venueBusinessId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <ClassForm
      businessId={businessId}
      businessType={business.type}
      existing={danceClass}
      venueName={venueName}
      rooms={rooms}
      classPeople={classPeople}
      isOwner
      /* 26 Sep 2026: the owner may take their own class; an artist's class in a studio they own needs no request */
      meId={business.type === "studio" ? user.id : null}
      ownedStudioIds={memberships.filter((m) => m.memberRole === "owner" && m.business.type === "studio").map((m) => m.business.id)}
      studioPlace={[business.area, business.city].filter(Boolean).join(", ")}
    />
  );
}
