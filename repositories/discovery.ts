import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantType } from "@/types/tenant";

export interface NearbyTenant {
  id: string;
  /** filled in by the caller from the businesses it just listed (parity slice 2) */
  photoPath?: string | null;
  /** likewise — DanceOS's own tick, drawn beside the name when it is set (D7) */
  verifiedAt?: string | null;
  /** likewise — where it is, for the map view (11 Sep 2026) */
  lat?: number | null;
  lng?: number | null;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  distanceKm: number;
  /** WHETHER THE DISTANCE MEANS ANYTHING (11 Sep 2026). False while the
   *  business has never opened the location picker, in which case its lat/lng
   *  is still its city's centroid and the number is the city measuring itself.
   *  A card can then stay quiet instead of printing a confident lie. */
  located: boolean;
}

interface NearbyRow {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  distance_km: number;
  located?: boolean;
}

/** Tenants within a radius, nearest first — the caller's RLS decides visibility
 *  (anonymous and strangers see listed businesses only). */
export async function findNearbyTenants(
  supabase: SupabaseClient,
  input: { lat: number; lng: number; radiusKm?: number; type?: TenantType; limit?: number; offset?: number }
): Promise<NearbyTenant[]> {
  /* `p_limit` IS ONLY SENT WHEN ASKED FOR (11 Sep 2026). It arrives with
     migration 20260913120000, and PostgREST resolves an RPC by its exact
     argument NAMES against a cached signature — so sending an argument the
     deployed function does not have yet is not ignored, it is a 404 on the
     whole call, and Discover's main shelf would go blank until the migration
     landed. Omitted, the call matches the old signature and the new one alike,
     and the new one's own default is the 50 the old one hard-coded. */
  const args: Record<string, unknown> = {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm ?? 25,
    p_type: input.type ?? null,
  };
  if (input.limit !== undefined) {
    args.p_limit = input.limit;
  }
  /* the same care for `p_offset` (18 Sep 2026, `20260918171000`): only sent when a
     page past the first is asked for, so the first page never depends on it */
  if (input.offset) {
    args.p_offset = input.offset;
  }
  const { data, error } = await supabase.rpc("nearby_businesses", args);

  if (error) {
    throw new Error(`discovery.nearby failed: ${error.message}`);
  }
  return (data as NearbyRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    area: r.area,
    city: r.city,
    distanceKm: r.distance_km,
    /* absent until migration 20260913120000 lands, and absent means "we cannot
       say", which is the same answer as false here */
    located: Boolean(r.located),
  }));
}

/** AN ARTIST ON DISCOVER IS A PERSON (18 Sep 2026, the user: "should only come as
 *  their profile as artist, no separate page required"). The Artists tab lists
 *  the people in a city who hold a live Artist plan — their name, face, styles
 *  and tick — opening their profile. `discover_artists` is SECURITY INVOKER: the
 *  policy that lets a stranger read an artist's profile is what fills this for a
 *  stranger too (`20260918175000_an_artist_is_their_profile.sql`). */
export interface DiscoverArtist {
  id: string;
  name: string;
  city: string | null;
  photoPath: string | null;
  styles: string[];
  verifiedAt: string | null;
}

export async function findDiscoverArtists(supabase: SupabaseClient, input: { city: string | null; limit?: number; offset?: number }): Promise<DiscoverArtist[]> {
  const { data, error } = await supabase.rpc("discover_artists", {
    p_city: input.city,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) {
    throw new Error(`discovery.artists failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ id: string; full_name: string; city: string | null; photo_path: string | null; styles: string[] | null; verified_at: string | null }>).map((r) => ({
    id: r.id,
    name: r.full_name,
    city: r.city,
    photoPath: r.photo_path,
    styles: Array.isArray(r.styles) ? r.styles : [],
    verifiedAt: r.verified_at,
  }));
}

/** WHAT A CARD KNOWS ABOUT A BUSINESS THAT THE MAP DOES NOT — the face it has
 *  put up, and whether DanceOS has verified it. The nearby RPC answers with
 *  place and distance only, so both are read in ONE second query rather than
 *  one per fact — under the same "anyone reads listed businesses" policy the
 *  public page uses. A business with no photo simply has none here; a business
 *  nobody has verified carries a null `verifiedAt`, which is not a tick. */
export interface TenantCardFacts {
  photoPath: string | null;
  verifiedAt: string | null;
  /** where it is — for Discover's map view (11 Sep 2026); the centroid until the owner places it */
  lat: number | null;
  lng: number | null;
}

export async function findTenantCardFacts(supabase: SupabaseClient, tenantIds: string[]): Promise<Map<string, TenantCardFacts>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, TenantCardFacts>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase.from("businesses").select("id, profile_photo_path, verified_at, lat, lng").in("id", ids).is("deleted_at", null).limit(ids.length);
  if (error) {
    throw new Error(`discovery.cardFacts failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ id: string; profile_photo_path: string | null; verified_at: string | null; lat: number | null; lng: number | null }>).forEach((r) => {
    out.set(r.id, { photoPath: r.profile_photo_path ?? null, verifiedAt: r.verified_at ?? null, lat: r.lat ?? null, lng: r.lng ?? null });
  });
  return out;
}
