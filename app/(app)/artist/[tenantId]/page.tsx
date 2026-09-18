import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistPageOwner } from "@/repositories/publicOrganization";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /artist/{pageId} — A ROUTE IS A PROMISE (Rule 14), so it keeps opening; what
 *  it opens onto changed on 18 Sep 2026: the ARTIST'S PROFILE. The user: "there
 *  is no need for a separate artist page … should only come as their profile as
 *  artist." The artist page is the business behind an artist's classes, team,
 *  students and earnings; their public face is /person/{id}, readable signed out
 *  once their plan is live (`20260918175000_an_artist_is_their_profile.sql`).
 *  The page's SCHEDULE keeps its own address one level down. */
export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const owner = await findArtistPageOwner(supabase, tenantId);
  if (!owner) {
    notFound();
  }
  redirect(`/person/${owner}`);
}
