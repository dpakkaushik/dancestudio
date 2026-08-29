import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantType } from "@/types/tenant";

export interface NearbyTenant {
  id: string;
  /** filled in by the caller from the tenants it just listed (parity slice 2) */
  photoPath?: string | null;
  /** likewise — DanceOS's own tick, drawn beside the name when it is set (D7) */
  verifiedAt?: string | null;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  distanceKm: number;
}

interface NearbyRow {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  distance_km: number;
}

/** Tenants within a radius, nearest first — the caller's RLS decides visibility
 *  (anonymous and strangers see listed tenants only). */
export async function findNearbyTenants(
  supabase: SupabaseClient,
  input: { lat: number; lng: number; radiusKm?: number; type?: TenantType }
): Promise<NearbyTenant[]> {
  const { data, error } = await supabase.rpc("nearby_tenants", {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm ?? 25,
    p_type: input.type ?? null,
  });

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
  }));
}

/** WHAT A CARD KNOWS ABOUT A BUSINESS THAT THE MAP DOES NOT — the face it has
 *  put up, and whether DanceOS has verified it. The nearby RPC answers with
 *  place and distance only, so both are read in ONE second query rather than
 *  one per fact — under the same "anyone reads listed tenants" policy the
 *  public page uses. A business with no photo simply has none here; a business
 *  nobody has verified carries a null `verifiedAt`, which is not a tick. */
export interface TenantCardFacts {
  photoPath: string | null;
  verifiedAt: string | null;
}

export async function findTenantCardFacts(supabase: SupabaseClient, tenantIds: string[]): Promise<Map<string, TenantCardFacts>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, TenantCardFacts>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase.from("tenants").select("id, photo_path, verified_at").in("id", ids).is("deleted_at", null).limit(ids.length);
  if (error) {
    throw new Error(`discovery.cardFacts failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ id: string; photo_path: string | null; verified_at: string | null }>).forEach((r) => {
    out.set(r.id, { photoPath: r.photo_path ?? null, verifiedAt: r.verified_at ?? null });
  });
  return out;
}
