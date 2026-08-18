import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant, TenantType } from "@/types/tenant";

interface TenantRow {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
}

const TENANT_COLUMNS = "id, type, name, area, city";

const toTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  type: row.type,
  name: row.name,
  area: row.area,
  city: row.city,
});

/** Atomic create: tenant + owner membership via the create_tenant_with_owner RPC. */
export async function createTenantWithOwner(
  supabase: SupabaseClient,
  input: { name: string; type: TenantType; area?: string | null; city?: string | null }
): Promise<Tenant> {
  const { data, error } = await supabase.rpc("create_tenant_with_owner", {
    p_name: input.name,
    p_type: input.type,
    p_area: input.area ?? null,
    p_city: input.city ?? null,
  });

  if (error) {
    throw new Error(`tenants.create failed: ${error.message}`);
  }
  return toTenant(data as TenantRow);
}

/** Tenants the signed-in user belongs to — RLS scopes the rows automatically. */
export async function findMyTenants(supabase: SupabaseClient): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`tenants.findMine failed: ${error.message}`);
  }
  return (data as TenantRow[]).map(toTenant);
}
