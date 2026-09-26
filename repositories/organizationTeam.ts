import type { SupabaseClient } from "@supabase/supabase-js";

/** AN ORGANIZATION'S TEAM (push 2, 19 Sep 2026 — the user: "You add a user or
 *  artist in Team section for organization to label them as owner").
 *  `organization_members`: the people an organization names, each ASKED and
 *  CONFIRMED like every roster in this app; `owner | event_team | member` are
 *  LABELS for the public page (Event team may run its events, R40).
 *
 *  ⚠ HUNG OFF THE BUSINESS SINCE 26 Sep 2026: `org_id` references `businesses`
 *  now, not `profiles` — the organization login was retired and an organization
 *  is a business a person opens. So every read here takes the ORGANIZATION'S
 *  ID rather than reading `auth.uid()` as "the organization", and the owner's
 *  read is admitted by their owner seat (`is_business_owner(org_id)`). The
 *  `studio_owner` label is GONE with it: an organization runs no studios. Every
 *  write is an RPC; `user_id` embeds through its named key (the 28 Aug lesson). */

export type OrgTeamRole = "owner" | "event_team" | "member";
/** what the ask may offer — the same three, since there is no seat label any more */
export type OrgAskRole = OrgTeamRole;
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
  status: OrgTeamStatus;
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

/** One organization's own desk: asked and confirmed rows, owners first. RLS
 *  admits the organization's OWNER and each person to their own row, so a
 *  teammate reading this sees only themselves — and the desk is owner-only. */
export async function findMyOrganizationTeam(supabase: SupabaseClient, orgId: string): Promise<OrgTeamMember[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select(COLUMNS)
    .eq("org_id", orgId)
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

/** The asks waiting on the signed-in PERSON. The organization is a business
 *  now, so its name embeds through `businesses`. */
export async function findMyPendingOrganizationAsks(supabase: SupabaseClient, statuses: OrgTeamStatus[] = ["asked"]): Promise<MyOrgTeamAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, org_id, role, status, created_at, org:businesses!organization_members_org_id_fkey (name)")
    .eq("user_id", me)
    /* answered asks too, when the Inbox wants them (19 Sep 2026) */
    .in("status", statuses)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`organizationTeam.myAsks failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<{ id: string; org_id: string; role: OrgTeamRole; status: OrgTeamStatus; created_at: string; org: { name: string } | null }>).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org?.name ?? "An organization",
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** The asks these ORGANIZATIONS are still waiting on (the desk's SENT side, and
 *  the owner's Inbox). Takes the list of the caller's OWNED organizations;
 *  `org_id in (…)` is said out loud — RLS is a ceiling, not a scope. */
export async function findAskedByOrganizations(supabase: SupabaseClient, orgIds: string[], statuses: OrgTeamStatus[] = ["asked"]): Promise<OrgTeamMember[]> {
  const ids = [...new Set(orgIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select(COLUMNS)
    .in("org_id", ids)
    .in("status", statuses)
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

/** the OWNER of `orgId` asks somebody onto its team — the RPC re-checks the seat */
export const askOrganizationMember = (supabase: SupabaseClient, orgId: string, userId: string, role: OrgAskRole) =>
  rpcVoid(supabase, "ask_organization_member", { p_org_id: orgId, p_user_id: userId, p_role: role });
export const respondToOrganizationAsk = (supabase: SupabaseClient, memberId: string, accept: boolean) =>
  rpcVoid(supabase, "respond_to_organization_ask", { p_member_id: memberId, p_accept: accept });
export const withdrawOrganizationAsk = (supabase: SupabaseClient, memberId: string) =>
  rpcVoid(supabase, "withdraw_organization_ask", { p_member_id: memberId });
export const removeOrganizationMember = (supabase: SupabaseClient, memberId: string) =>
  rpcVoid(supabase, "remove_organization_member", { p_member_id: memberId });
/** ⚠ `p_business_id` is sent null on purpose: the RPC keeps the argument and
 *  refuses any value, because an organization runs no studios (26 Sep 2026). */
export const setOrganizationMemberRole = (supabase: SupabaseClient, memberId: string, role: OrgTeamRole) =>
  rpcVoid(supabase, "set_organization_member_role", { p_member_id: memberId, p_role: role, p_business_id: null });
