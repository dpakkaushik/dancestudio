import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { StatsPageBody, type StatsQuery } from "@/features/stats/components/StatsPageBody";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistPageOwner } from "@/repositories/businesses";
import { findPublicBusiness } from "@/repositories/publicProfile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /studio/{id}/stats — the same three columns every profile wears (29 Sep 2026).
 *  Readable signed out for a LISTED studio, the way its page is; an unlisted one
 *  is nobody's to find. An artist page under this address is sent to its owner's
 *  record, since an artist IS their profile (R24).
 *
 *  ⚠ A studio's Record is its own board row — sessions held, hours, people on the
 *  floor — because that is the only per-studio arithmetic the database publishes:
 *  there is no `business_session_history`, so the graphs and the library are the
 *  held migration's, not this push's. */
export default async function StudioStatsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<StatsQuery> }) {
  const { businessId } = await params;
  if (!UUID_RE.test(businessId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const business = await findPublicBusiness(supabase, businessId);
  if (!business) {
    notFound();
  }
  if (business.type !== "studio") {
    const owner = await findArtistPageOwner(supabase, businessId);
    redirect(owner ? `/person/${owner}/stats` : `/studio/${businessId}`);
  }
  return (
    <StatsPageBody
      subject={{
        kind: "studio",
        id: businessId,
        name: business.name,
        photoPath: business.photoPath,
        eyebrow: "Studio",
        accent: gradientOf(business.name)[1],
        backHref: `/studio/${businessId}`,
        segment: "studio",
        city: business.city,
        isArtist: false,
        stats: null,
      }}
      query={await searchParams}
      basePath={`/studio/${businessId}/stats`}
    />
  );
}
