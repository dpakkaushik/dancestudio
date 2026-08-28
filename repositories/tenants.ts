import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant, TenantType } from "@/types/tenant";

interface TenantRow {
  photo_path?: string | null;
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
}

const TENANT_COLUMNS = "id, type, name, area, city, photo_path";

const toTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  type: row.type,
  name: row.name,
  area: row.area,
  city: row.city,
  photoPath: row.photo_path ?? null,
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
 *
 *  Says `user_id = auth.uid()` OUT LOUD, and must keep doing so. This query once
 *  leaned on tenant_members being own-rows-only under RLS — then Step 11 let a
 *  tenant's members read each other, so on any studio with two people it started
 *  matching several rows and maybeSingle() threw ("multiple (or no) rows
 *  returned"), taking the public class page down with it. Same lesson as
 *  findMyTenants below: RLS is a ceiling, not a scoping mechanism. */
export async function findMyMembershipRole(
  supabase: SupabaseClient,
  tenantId: string
): Promise<MemberRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("tenant_members")
    .select("member_role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
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
 *  Membership is the query's spine instead — and the spine says whose rows it
 *  wants OUT LOUD: since Step 11 a tenant's members can read each other, so
 *  leaning on the policy to mean "mine" would list one row per teammate. RLS is
 *  a ceiling, not a scoping mechanism. */
export async function findMyTenants(supabase: SupabaseClient): Promise<Tenant[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("tenant_members")
    .select(`created_at, tenants (${TENANT_COLUMNS})`)
    .eq("user_id", user.id)
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

export interface TeamMember {
  userId: string;
  name: string;
  role: MemberRole;
  city: string | null;
}

/** The tenant's own people — the pool the class form's artist and assistant
 *  pickers offer (prototype dosTeachPool / dosAssistPool). Staff invites arrive
 *  with Step 12, so today this is whoever the studio already has.
 *
 *  Two queries on purpose: tenant_members.user_id references auth.users, not
 *  profiles, so PostgREST has no relationship to embed the name through. */
export async function findTenantTeam(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("user_id, member_role")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`tenants.team failed: ${error.message}`);
  }
  const rows = data as Array<{ user_id: string; member_role: MemberRole }>;
  if (rows.length === 0) {
    return [];
  }

  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, city")
    .in(
      "id",
      rows.map((r) => r.user_id)
    )
    .is("deleted_at", null);

  if (peopleError) {
    throw new Error(`tenants.teamProfiles failed: ${peopleError.message}`);
  }
  const byId = new Map(
    (people as Array<{ id: string; full_name: string; city: string | null }>).map((p) => [p.id, p])
  );

  return rows.map((row) => ({
    userId: row.user_id,
    name: byId.get(row.user_id)?.full_name ?? "Teammate",
    role: row.member_role,
    city: byId.get(row.user_id)?.city ?? null,
  }));
}
