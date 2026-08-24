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

interface MembershipRow {
  tenants: TenantRow | null;
}

export type MemberRole = "owner" | "trainer" | "staff";

/** The signed-in user's role on one tenant, or null when they are not a member.
 *  tenant_members RLS is own-rows-only, so this can never see anyone else's seat. */
export async function findMyMembershipRole(
  supabase: SupabaseClient,
  tenantId: string
): Promise<MemberRole | null> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("member_role")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`tenants.myRole failed: ${error.message}`);
  }
  return (data?.member_role as MemberRole | undefined) ?? null;
}

/** Tenants the signed-in user belongs to.
 *  RLS policies OR together — since discovery made listed tenants publicly
 *  readable, selecting from `tenants` directly returns EVERY listed tenant.
 *  Membership is the query's spine instead: tenant_members RLS is own-rows-only,
 *  so only the caller's businesses can ever come back. */
export async function findMyTenants(supabase: SupabaseClient): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select(`created_at, tenants (${TENANT_COLUMNS})`)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`tenants.findMine failed: ${error.message}`);
  }
  return (data as unknown as MembershipRow[])
    .map((row) => row.tenants)
    .filter((tenant): tenant is TenantRow => tenant !== null)
    .map(toTenant);
}
