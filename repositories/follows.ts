import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowState, FollowedTenant, TenantFollower } from "@/types/follow";
import type { TenantType } from "@/types/tenant";

/** Step 15 reads and the one write. Rows are private (the follower's own, and
 *  the followed business's members'); the COUNT is public through the
 *  aggregate-only `follower_counts`. Every "mine" query says `follower_id =
 *  auth.uid()` out loud — RLS is a ceiling, not a scope: a studio member reads
 *  their tenant's follows too, and would otherwise see them as their own. */

const MAX_LIST = 500;

interface CountRow {
  tenant_id: string;
  followers: number;
}

interface MyFollowRow {
  id: string;
  tenant_id: string;
  created_at: string;
  tenants: { type: TenantType; name: string; area: string | null; city: string | null } | null;
}

interface FollowerRow {
  id: string;
  follower_id: string;
  created_at: string;
  profiles: { full_name: string; role: "dancer" | "trainer" | "studio"; city: string | null; avatar_path: string | null } | null;
}

/** Live follower counts — a number, never a name. Listed businesses answer for
 *  everybody; an unlisted one only for its own members (the function decides). */
export async function findFollowerCounts(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<Map<string, number>> {
  const ids = [...new Set(tenantIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase.rpc("follower_counts", { p_tenant_ids: ids });
  if (error) {
    throw new Error(`follows.counts failed: ${error.message}`);
  }
  const map = new Map<string, number>();
  ((data ?? []) as CountRow[]).forEach((r) => map.set(r.tenant_id, Number(r.followers)));
  return map;
}

/** Whether the signed-in person follows this business right now. */
export async function isFollowingTenant(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .limit(1);
  if (error) {
    throw new Error(`follows.isFollowing failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/** The businesses the signed-in person follows, newest first. */
export async function findMyFollowing(supabase: SupabaseClient): Promise<FollowedTenant[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data, error } = await supabase
    .from("follows")
    .select("id, tenant_id, created_at, tenants (type, name, area, city)")
    .eq("follower_id", user.id)
    .not("tenant_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.findMine failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as MyFollowRow[])
    .filter((r) => r.tenants)
    .map((r) => ({
      followId: r.id,
      tenantId: r.tenant_id,
      tenantType: r.tenants!.type,
      tenantName: r.tenants!.name,
      tenantArea: r.tenants!.area,
      tenantCity: r.tenants!.city,
      followedAt: r.created_at,
    }));
}

/** Who follows this business — RLS admits its members and nobody else. The
 *  embed names its FK: since person-follows landed, `follows` has TWO foreign
 *  keys into `profiles` (follower and followee) and an unqualified `profiles(...)`
 *  is ambiguous — PostgREST answers 300 Multiple Choices. */
export async function findTenantFollowers(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantFollower[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("id, follower_id, created_at, profiles!follows_follower_id_fkey (full_name, role, city, avatar_path)")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.findFollowers failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as FollowerRow[]).map((r) => ({
    followId: r.id,
    userId: r.follower_id,
    name: r.profiles?.full_name ?? "Someone",
    role: r.profiles?.role ?? "dancer",
    city: r.profiles?.city ?? null,
    avatarPath: r.profiles?.avatar_path ?? null,
    followedAt: r.created_at,
  }));
}

/** One person in a person's Followers / Following sheet (S_profiletab 11335). */
export interface PersonFollowRow {
  followId: string;
  userId: string;
  name: string;
  role: "dancer" | "trainer" | "studio";
  city: string | null;
  avatarPath: string | null;
  followedAt: string;
}

/** The people who follow the signed-in person — their own to read (the
 *  person-pages policy "people read their own followers"). `followee_id = me`
 *  is said out loud: the same table holds follows of businesses this person
 *  may be a member of, and RLS is a ceiling, not a scope. */
export async function findMyPersonFollowers(supabase: SupabaseClient): Promise<PersonFollowRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("id, follower_id, created_at, profiles!follows_follower_id_fkey (full_name, role, city, avatar_path)")
    .eq("followee_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.myFollowers failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<{ id: string; follower_id: string; created_at: string; profiles: { full_name: string; role: "dancer" | "trainer" | "studio"; city: string | null; avatar_path: string | null } | null }>)
    .filter((r) => r.profiles)
    .map((r) => ({ followId: r.id, userId: r.follower_id, name: r.profiles!.full_name, role: r.profiles!.role, city: r.profiles!.city, avatarPath: r.profiles!.avatar_path, followedAt: r.created_at }));
}

/** The PEOPLE the signed-in person follows (the businesses are findMyFollowing). */
export async function findMyFollowedPeople(supabase: SupabaseClient): Promise<PersonFollowRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("id, followee_id, created_at, profiles!follows_followee_id_fkey (full_name, role, city, avatar_path)")
    .eq("follower_id", user.id)
    .not("followee_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.myFollowedPeople failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<{ id: string; followee_id: string; created_at: string; profiles: { full_name: string; role: "dancer" | "trainer" | "studio"; city: string | null; avatar_path: string | null } | null }>)
    .filter((r) => r.profiles)
    .map((r) => ({ followId: r.id, userId: r.followee_id, name: r.profiles!.full_name, role: r.profiles!.role, city: r.profiles!.city, avatarPath: r.profiles!.avatar_path, followedAt: r.created_at }));
}

/** Follow or unfollow — the RPC is idempotent and refuses an unlisted business
 *  or one the caller belongs to. */
export async function setFollow(supabase: SupabaseClient, tenantId: string, on: boolean): Promise<FollowState> {
  const { data, error } = await supabase.rpc("set_follow", { p_tenant_id: tenantId, p_on: on });
  if (error) {
    throw new Error(error.message);
  }
  const out = data as { following: boolean; followers: number };
  return { following: out.following, followers: Number(out.followers) };
}
