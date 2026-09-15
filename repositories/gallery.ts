import type { SupabaseClient } from "@supabase/supabase-js";
import { GALLERY_MAX, photoUrl } from "@/lib/media/photo";

export interface GalleryPhoto {
  id: string;
  path: string;
  url: string | null;
}

/** AN ARTIST'S GALLERY (14 Sep 2026) — the pictures that swipe behind the
 *  profile photo on the artist's Home, in the order they were added. Public
 *  content in the public bucket, so a URL is a plain string and never expires.
 *
 *  Degrades to empty rather than throwing: the table arrives with migration
 *  20260914170000, and a Home that 500s because a migration is a day away would
 *  be worse than one that shows the profile photo alone. */
export async function findGalleryPhotos(supabase: SupabaseClient, userId: string): Promise<GalleryPhoto[]> {
  const { data, error } = await supabase
    .from("profile_photos")
    .select("id, path, sort, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(GALLERY_MAX);
  if (error) {
    return [];
  }
  return ((data ?? []) as Array<{ id: string; path: string }>).map((r) => ({ id: r.id, path: r.path, url: photoUrl(r.path) }));
}
