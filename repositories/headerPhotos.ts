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

/** THE SAME PICTURES, FOR A WHOLE SHELF (27 Sep 2026, the user: *"Studio Cards
 *  on discover should have swipable photos in top section which are used in
 *  posters … view photo should be same as how it was cut"*).
 *
 *  ⚠ ONE QUERY AND ONE SIGNING CALL FOR THE PAGE, never one per card. Discover's
 *  Studios shelf draws up to fifty of them, so `findTenantHeaderPhotos`'s per-
 *  business RPC would be fifty round trips plus fifty signings — the shape
 *  `findClassArtists` exists to avoid and the reason the class shelf is one read.
 *
 *  ⚠ IT READS THE ROWS DIRECTLY rather than through `business_header_photos`,
 *  and that is safe for exactly the reason the definer exists: `20260915090000`
 *  gave `studio_photos` a SELECT policy admitting anon and authenticated to a
 *  LISTED studio's rows (or its own team's), and `20260915100000` gave anon the
 *  table GRANT that policy needed to do anything at all. So the ceiling here is
 *  the same ceiling the RPC enforces, kept by the database rather than restated.
 *  ⚠ STUDIOS ONLY: an artist page's header is its OWNER's `profile_header_photos`
 *  in the public bucket, and the Studios shelf is `type = 'studio'` by the search
 *  it comes from — a caller with anything else gets nothing rather than a wrong
 *  folder.
 *
 *  A signing failure is an empty list for that studio, never a throw: a shelf
 *  that 500s over a picture is worse than a card with none. */
export async function findStudioHeaderPhotosMany(supabase: SupabaseClient, businessIds: string[], perBusiness = 6): Promise<Map<string, HeaderPhoto[]>> {
  const ids = [...new Set(businessIds)];
  const out = new Map<string, HeaderPhoto[]>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase
    .from("studio_photos")
    .select("id, path, business_id, sort, created_at")
    .in("business_id", ids)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    /* a hard ceiling on the whole read, not a page: the cap below is what each
       card actually draws, and this only stops one studio with a hundred rows
       from deciding how big the response is */
    .limit(ids.length * Math.max(1, perBusiness) + 50);
  if (error) {
    return out;
  }
  const rows = (data ?? []) as Array<{ id: string; path: string; business_id: string }>;
  const kept: Array<{ id: string; path: string; businessId: string }> = [];
  rows.forEach((r) => {
    const already = out.get(r.business_id)?.length ?? 0;
    if (already >= perBusiness) return;
    out.set(r.business_id, [...(out.get(r.business_id) ?? []), { id: r.id, path: r.path, url: null, signed: true }]);
    kept.push({ id: r.id, path: r.path, businessId: r.business_id });
  });
  if (kept.length === 0) {
    return out;
  }
  const signed = await supabase.storage.from(PROOF_BUCKET).createSignedUrls(
    kept.map((r) => r.path),
    PROOF_URL_SECONDS
  );
  if (signed.error) {
    out.clear();
    return out;
  }
  const urlByPath = new Map<string, string>();
  (signed.data ?? []).forEach((s) => {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  });
  out.forEach((list, key) => {
    out.set(
      key,
      list.map((p) => ({ ...p, url: urlByPath.get(p.path) ?? null })).filter((p) => p.url !== null)
    );
  });
  return out;
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
