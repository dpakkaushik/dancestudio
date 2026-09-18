import type { SupabaseClient } from "@supabase/supabase-js";
import { HEADER_MAX_CREW, HEADER_MAX_ORG, photoUrl } from "@/lib/media/photo";
import { PROOF_BUCKET, PROOF_URL_SECONDS } from "@/lib/media/proof";

/** One picture in a header rail, ready to draw. */
export interface HeaderPhoto {
  id: string;
  path: string;
  /** a plain public URL, a signed one, or null when neither could be made */
  url: string | null;
  /** a signed URL into the private bucket must skip the image optimizer */
  signed: boolean;
}

/** A PERSON'S HEADER PICTURES (15 Sep 2026; the artist gallery of 14 Sep) —
 *  the pictures that swipe across the top of their pages above the profile
 *  disc, in the order they were added. Public content in the public bucket, so
 *  a URL is a plain string and never expires.
 *
 *  `max` is what the page may SHOW: a user's header is one picture, an artist's
 *  five and an organization's ten (19 Sep 2026), and a plan that lapsed with
 *  five stored still draws one — the rest wait, undeleted, for the plan to come
 *  back. An artist who held ten before the cap came down still holds them; the
 *  page shows five and the Edit sheet lets them take the rest down.
 *
 *  Degrades to empty rather than throwing: a Home that 500s over a picture rail
 *  would be worse than one that shows the disc alone. */
export async function findPersonHeaderPhotos(supabase: SupabaseClient, userId: string, max = HEADER_MAX_ORG): Promise<HeaderPhoto[]> {
  const { data, error } = await supabase
    .from("profile_header_photos")
    .select("id, path, sort, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, max));
  if (error) {
    return [];
  }
  return ((data ?? []) as Array<{ id: string; path: string }>).map((r) => ({ id: r.id, path: r.path, url: photoUrl(r.path), signed: false }));
}

/** A BUSINESS'S HEADER PICTURES, for whoever may read its page: a studio's are
 *  the photos of its space it showed DanceOS (the private bucket — signed here,
 *  under the storage policy that admits a listed studio's objects to anyone);
 *  an artist page's are its owner's own header pictures (the public bucket).
 *  One RPC decides which and whether the caller may see them at all, so the
 *  page never has to know whose folder anything is in. */
export async function findTenantHeaderPhotos(supabase: SupabaseClient, tenantId: string): Promise<HeaderPhoto[]> {
  const { data, error } = await supabase.rpc("business_header_photos", { p_business_id: tenantId });
  if (error) {
    return [];
  }
  const rows = (data ?? []) as Array<{ id: string; path: string; bucket: string }>;
  const proof = rows.filter((r) => r.bucket === PROOF_BUCKET);
  const urlByPath = new Map<string, string>();
  if (proof.length) {
    const signed = await supabase.storage.from(PROOF_BUCKET).createSignedUrls(
      proof.map((r) => r.path),
      PROOF_URL_SECONDS
    );
    if (!signed.error) {
      (signed.data ?? []).forEach((s) => {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      });
    }
  }
  return rows.map((r) =>
    r.bucket === PROOF_BUCKET
      ? { id: r.id, path: r.path, url: urlByPath.get(r.path) ?? null, signed: true }
      : { id: r.id, path: r.path, url: photoUrl(r.path), signed: false }
  );
}

/** A CREW'S HEADER PICTURES (19 Sep 2026, the user: "Artist and Crews — 5"):
 *  up to five, in the crew's own folder of the public bucket, readable by
 *  anyone (a crew is public), added and removed by its leader through the Edit
 *  sheet. Degrades to empty like the person's read. */
export async function findCrewHeaderPhotos(supabase: SupabaseClient, crewId: string, max = HEADER_MAX_CREW): Promise<HeaderPhoto[]> {
  const { data, error } = await supabase
    .from("crew_header_photos")
    .select("id, path, sort, created_at")
    .eq("crew_id", crewId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, max));
  if (error) {
    return [];
  }
  return ((data ?? []) as Array<{ id: string; path: string }>).map((r) => ({ id: r.id, path: r.path, url: photoUrl(r.path), signed: false }));
}
