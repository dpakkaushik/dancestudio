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
