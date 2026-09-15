import { redirect } from "next/navigation";
import { StudioMediaDesk } from "@/features/tenants/components/StudioMediaDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findMyMemberships } from "@/repositories/tenants";

/** /business/{tenantId}/media — THE MEDIA DESK (15 Sep 2026): a studio's
 *  profile picture and its header pictures, for its team. Only a studio has
 *  one — an artist page's pictures are the artist's own, on the Profile tab. */
export default async function StudioMediaPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // membership is the spine — findMyMemberships says user_id = auth.uid() out loud
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/business");
  }
  const { tenant, memberRole } = membership;
  if (tenant.type !== "studio") {
    redirect(tenant.type === "org" ? `/business/${tenantId}/events` : `/business/${tenantId}/classes`);
  }

  const isOwner = memberRole === "owner";
  const photos = await findStudioProofPhotos(supabase, tenantId);

  return (
    <StudioMediaDesk
      tenant={tenant}
      ownerId={isOwner ? user.id : null}
      canEditPhoto={isOwner || memberRole === "trainer"}
      photos={photos}
    />
  );
}
