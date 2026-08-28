import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantType } from "@/types/tenant";

export interface NearbyTenant {
  id: string;
  /** filled in by the caller from the tenants it just listed (parity slice 2) */
  photoPath?: string | null;
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

/** The photo each business has put on its profile, by id. The nearby RPC
 *  answers with place and distance only, so the faces the cards wear are read
 *  in one second query — under the same "anyone reads listed tenants" policy
 *  the public page uses. A business with no photo is simply absent from the map. */
export async function findTenantPhotoPaths(supabase: SupabaseClient, tenantIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, string>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase.from("tenants").select("id, photo_path").in("id", ids).is("deleted_at", null).limit(ids.length);
  if (error) {
    throw new Error(`discovery.photos failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ id: string; photo_path: string | null }>).forEach((r) => {
    if (r.photo_path) out.set(r.id, r.photo_path);
  });
  return out;
}
