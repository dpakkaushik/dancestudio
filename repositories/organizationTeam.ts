import type { SupabaseClient } from "@supabase/supabase-js";

/** AN ORGANIZATION'S TEAM (push 2, 19 Sep 2026 — the user: "You add a user or
 *  artist in Team section for organization to label them as owner").
 *  `organization_members`: the people an organization account names, each
 *  ASKED and CONFIRMED like every roster in this app; `owner | member` are
 *  LABELS for the public page, not powers. Every "mine" read says whose rows it
 *  wants out loud (`org_id = me`, `user_id = me`) — RLS is a ceiling, not a
 *  scope. Every write is an RPC. Two foreign keys point at `profiles`, so every
 *  embed names its key (the 28 Aug lesson). */

export type OrgTeamRole = "owner" | "member";
export type OrgTeamStatus = "asked" | "confirmed" | "rejected";

export interface OrgTeamMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgTeamRole;
  status: OrgTeamStatus;
  sort: number;
  createdAt: string;
  name: string;
  city: string | null;
  avatarPath: string | null;
}

/** an ask waiting for the signed-in person — the Requests desk's RECEIVED side */
export interface MyOrgTeamAsk {
  id: string;
  orgId: string;
  orgName: string;
  role: OrgTeamRole;
  createdAt: string;
}

interface Row {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgTeamRole;
  status: OrgTeamStatus;
  sort: number;
  created_at: string;
  person: { full_name: string; city: string | null; profile_photo_path: string | null } | null;
}

const COLUMNS = "id, org_id, user_id, role, status, sort, created_at, person:profiles!organization_members_user_id_fkey (full_name, city, profile_photo_path)";

const toMember = (r: Row): OrgTeamMember => ({
  id: r.id,
  orgId: r.org_id,
  userId: r.user_id,
  role: r.role,
  status: r.status,
  sort: r.sort,
  createdAt: r.created_at,
  name: r.person?.full_name ?? "Someone",
  city: r.person?.city ?? null,
  avatarPath: r.person?.profile_photo_path ?? null,
});

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The organization's own desk: asked and confirmed rows, owners first. */
export async function findMyOrganizationTeam(supabase: SupabaseClient): Promise<OrgTeamMember[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select(COLUMNS)
    .eq("org_id", me)
    .in("status", ["asked", "confirmed"])
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    throw new Error(`organizationTeam.mine failed: ${error.message}`);
  }
  const rows = ((data ?? []) as unknown as Row[]).map(toMember);
  return [...rows.filter((r) => r.role === "owner"), ...rows.filter((r) => r.role !== "owner")];
}

/** The asks waiting on the signed-in PERSON. */
export async function findMyPendingOrganizationAsks(supabase: SupabaseClient): Promise<MyOrgTeamAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, org_id, role, created_at, org:profiles!organization_members_org_id_fkey (full_name)")
    .eq("user_id", me)
    .eq("status", "asked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`organizationTeam.myAsks failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<{ id: string; org_id: string; role: OrgTeamRole; created_at: string; org: { full_name: string } | null }>).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org?.full_name ?? "An organization",
    role: r.role,
    createdAt: r.created_at,
  }));
}

/** The asks the signed-in ORGANIZATION is still waiting on (the desk's SENT side). */
export async function findAskedByMyOrganization(supabase: SupabaseClient): Promise<OrgTeamMember[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select(COLUMNS)
    .eq("org_id", me)
    .eq("status", "asked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`organizationTeam.asked failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Row[]).map(toMember);
}

const rpcVoid = async (supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<void> => {
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
};

export const askOrganizationMember = (supabase: SupabaseClient, userId: string, role: OrgTeamRole) =>
  rpcVoid(supabase, "ask_organization_member", { p_user_id: userId, p_role: role });
export const respondToOrganizationAsk = (supabase: SupabaseClient, memberId: string, accept: boolean) =>
  rpcVoid(supabase, "respond_to_organization_ask", { p_member_id: memberId, p_accept: accept });
export const withdrawOrganizationAsk = (supabase: SupabaseClient, memberId: string) =>
  rpcVoid(supabase, "withdraw_organization_ask", { p_member_id: memberId });
export const removeOrganizationMember = (supabase: SupabaseClient, memberId: string) =>
  rpcVoid(supabase, "remove_organization_member", { p_member_id: memberId });
export const setOrganizationMemberRole = (supabase: SupabaseClient, memberId: string, role: OrgTeamRole) =>
  rpcVoid(supabase, "set_organization_member_role", { p_member_id: memberId, p_role: role });
