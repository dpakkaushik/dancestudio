import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassPeopleByClass } from "@/repositories/classPeople";
import { findClassById } from "@/repositories/classes";
import { findRoomsByBusiness } from "@/repositories/rooms";
import { findBusinessName, findMyMemberships } from "@/repositories/businesses";
import { findRefundWindowHours } from "@/repositories/refundWindow";

/** Edit class — the owner or a manager (11 Oct 2026), like Add class. */
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
  /* 11 Oct 2026: a manager edits drafts too — everything but money and people */
  if (memberRole !== "owner" && memberRole !== "manager") {
    redirect(business.type === "artist_page" ? "/my-classes" : `/business/${businessId}/classes`);
  }

  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.businessId !== businessId) {
    redirect(business.type === "artist_page" ? "/my-classes?show=manage" : `/business/${businessId}/classes`);
  }
  /* ⚠ A PUBLISHED CLASS IS FIXED (11 Oct 2026, the user: "should not be able to
     edit a published class only delete it") — the database refuses it too
     (`20261015090000`), so an old Edit link lands on the class itself */
  if (danceClass.status !== "draft") {
    redirect(`/c/${danceClass.shareSlug}`);
  }

  /* ⚠ `findDiscoverCities` LEFT THIS LIST WITH THE MAP PICKER (20 Sep 2026) —
     it centred a map this form no longer draws. One round trip fewer on every
     edit. */
  /* ⚠ A CLOSED DRAFT IS EDITABLE (11 Oct 2026, D3): its date passed and it was
     never published — "Pick a new date" opens this form, and the save may move
     it into the future */
  const [rooms, classPeople, venueName, refundWindowHours] = await Promise.all([
    business.type === "studio" ? findRoomsByBusiness(supabase, businessId) : Promise.resolve([]),
    findClassPeopleByClass(supabase, classId),
    /* the studio an artist asked for a room, BY NAME — the form used to reopen on
       "the studio you asked" because only the id was on the row (18 Sep 2026) */
    danceClass.venueBusinessId ? findBusinessName(supabase, danceClass.venueBusinessId).catch(() => null) : Promise.resolve(null),
    findRefundWindowHours(supabase, businessId),
  ]);

  return (
    <ClassForm
      businessId={businessId}
      businessType={business.type}
      existing={danceClass}
      venueName={venueName}
      rooms={rooms}
      classPeople={classPeople}
      /* the person saving may take the class themselves (11 Oct 2026, both kinds); an artist's class in a studio they own needs no request */
      meId={user.id}
      ownedStudioIds={memberships.filter((m) => (m.memberRole === "owner" || m.memberRole === "manager") && m.business.type === "studio").map((m) => m.business.id)}
      studioPlace={[business.area, business.city].filter(Boolean).join(", ")}
      suggestedStyles={business.styles}
      refundWindowHours={refundWindowHours}
    />
  );
}
