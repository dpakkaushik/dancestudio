import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRoomsByBusiness } from "@/repositories/rooms";
import { findMyMemberships } from "@/repositories/businesses";

/** Add class. THE OWNER ALONE (18 Sep 2026, the user: "an artist should not
 *  create form on behalf of a studio"; asked who creates and edits: "Owner
 *  alone") — the RPC refuses anybody else, and so does this page, in the same
 *  breath. A studio's form offers its rooms; an artist's offers a studio to ask
 *  or a place of their own.
 *
 *  ⚠ NO DOOR — nothing in the app links here, confirmed by a sweep on 28 Sep
 *  2026. Since C54 (22 Sep) the register opens this same form as a SHEET at
 *  `?new=1` on its own URL. The route stays under Rule 14 and still renders the
 *  form full page; `shoot-tiles.js` asserts both ends. Do not delete it. */
export default async function NewClassPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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

  /* ⚠ ONE READ, NOT TWO (20 Sep 2026): `findDiscoverCities` was here to centre
     the class form's map picker, and the picker is gone — an artist teaching
     somewhere that is not on DanceOS pastes that place's Google Maps link now,
     which is both more accurate and a round trip cheaper. */
  const rooms = business.type === "studio" ? await findRoomsByBusiness(supabase, businessId) : [];

  return (
    <ClassForm
      businessId={businessId}
      businessType={business.type}
      rooms={rooms}
      isOwner
      /* 26 Sep 2026: the owner may take their own class; an artist's class in a studio they own needs no request */
      meId={business.type === "studio" ? user.id : null}
      ownedStudioIds={memberships.filter((m) => m.memberRole === "owner" && m.business.type === "studio").map((m) => m.business.id)}
      studioPlace={[business.area, business.city].filter(Boolean).join(", ")}
    />
  );
}
