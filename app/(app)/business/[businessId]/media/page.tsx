import { redirect } from "next/navigation";
import { StudioMediaDesk } from "@/features/tenants/components/StudioMediaDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";

/** /business/{businessId}/media — THE MEDIA DESK (15 Sep 2026): a studio's
 *  profile picture and its header pictures, for its team. Only a studio has
 *  one — an artist page's pictures are the artist's own, on the Profile tab.
 *
 *  ⚠ NO DOOR — nothing in the app links here, confirmed by a sweep on 28 Sep
 *  2026. The Media TILE came off every grid on 21 Sep (C48) because the disc's
 *  ⊕ and the posters' ⊕ ARE the editor now, on the home itself. The route
 *  stays under Rule 14 (a link handed out is a promise, and the installed TWA
 *  reopens on the last URL it showed), and `shoot-hero.js` drives it BY URL so
 *  it cannot rot behind the removed tile. Do not delete it as "unused". */
export default async function StudioMediaPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // membership is the spine — findMyMemberships says user_id = auth.uid() out loud
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.business.id === businessId);
  /* ⚠ and the seat has to RUN the business (28 Sep 2026) */
  if (!membership || !runsTheBusiness(membership.memberRole)) {
    redirect("/business");
  }
  const { business, memberRole } = membership;
  if (business.type !== "studio") {
    /* ⚠ the hosting row's arm went with events (29 Sep 2026) */
    redirect(`/business/${businessId}/classes`);
  }

  const isOwner = memberRole === "owner";
  const photos = await findStudioProofPhotos(supabase, businessId);

  return (
    <StudioMediaDesk
      business={business}
      ownerId={isOwner ? user.id : null}
      /* `set_business_profile_photo` admits an owner or a trainer; a trainer no
         longer reaches this page, so whoever does may edit (28 Sep 2026) */
      canEditPhoto={runsTheBusiness(memberRole)}
      photos={photos}
    />
  );
}
