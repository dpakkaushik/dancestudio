import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InvitableRole,
  InvitePreview,
  InviteStatus,
  PendingInvite,
  TenantInvite,
} from "@/types/staff";
import type { MemberRole } from "@/repositories/tenants";

/** Step 12b invites. The table is business-private (members read their own desk,
 *  nobody else reads it at all), and every write goes through a security-definer
 *  RPC — that is where "only the owner asks" and "only you answer" live. */

interface InviteRow {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  member_role: InvitableRole;
  code: string;
  status: InviteStatus;
  created_at: string;
}

const INVITE_COLUMNS = "id, business_id, name, email, user_id, member_role, code, status, created_at";

const toInvite = (row: InviteRow): TenantInvite => ({
  id: row.id,
  tenantId: row.business_id,
  name: row.name,
  email: row.email ?? null,
  userId: row.user_id ?? null,
  memberRole: row.member_role,
  code: row.code,
  status: row.status,
  createdAt: row.created_at,
});

/** The asks still outstanding on one studio's desk. Answered ones are kept as
 *  history but the desk shows the live queue. */
export async function findPendingInvites(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantInvite[]> {
  const { data, error } = await supabase
    .from("business_invites")
    .select(INVITE_COLUMNS)
    .eq("business_id", tenantId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`invites.findPending failed: ${error.message}`);
  }
  return (data as InviteRow[]).map(toInvite);
}

export async function inviteToTenant(
  supabase: SupabaseClient,
  input: { tenantId: string; name: string; email: string; role: InvitableRole }
): Promise<TenantInvite> {
  const { data, error } = await supabase.rpc("invite_to_business", {
    p_business_id: input.tenantId,
    p_name: input.name,
    p_email: input.email,
    p_role: input.role,
  });
  if (error) {
    throw new Error(error.message);
  }
  return toInvite(data as InviteRow);
}

/** ASKED BY NAME (19 Sep 2026, the user: "Team should only be able to add team
 *  member by typing name, number, email or scan"). The people picker hands back
 *  a USER ID — a profile carries no address, so an invite has to be able to name
 *  a person. Consent is unchanged: they still accept it themselves. */
export async function invitePersonToTenant(
  supabase: SupabaseClient,
  input: { tenantId: string; userId: string; role: InvitableRole }
): Promise<TenantInvite> {
  const { data, error } = await supabase.rpc("invite_person_to_business", {
    p_business_id: input.tenantId,
    p_user_id: input.userId,
    p_role: input.role,
  });
  if (error) {
    throw new Error(error.message);
  }
  return toInvite(data as InviteRow);
}

export async function revokeInvite(supabase: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_business_invite", { p_invite_id: inviteId });
  if (error) {
    throw new Error(error.message);
  }
}

interface PendingRow {
  invite_id: string;
  business_id: string;
  business_name: string;
  member_role: InvitableRole;
  code: string;
  invited_name: string;
  created_at: string;
}

/** "Is anybody waiting for me?" — matched on the address the caller signs in
 *  with, so an invite reaches its person without a link being passed around. */
export async function findMyPendingInvites(supabase: SupabaseClient): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc("my_pending_invites");
  if (error) {
    throw new Error(`invites.findMine failed: ${error.message}`);
  }
  return (data as PendingRow[]).map((row) => ({
    inviteId: row.invite_id,
    tenantId: row.business_id,
    tenantName: row.business_name,
    memberRole: row.member_role,
    code: row.code,
    invitedName: row.invited_name,
    createdAt: row.created_at,
  }));
}

interface PreviewRow {
  business_id: string;
  business_name: string;
  member_role: InvitableRole;
  invited_name: string;
  status: InviteStatus;
  email_hint: string;
  is_for_me: boolean;
}

/** What /join/{code} may show. Returns null for a code that resolves to
 *  nothing — an unknown link is simply not an invite. */
export async function previewInvite(
  supabase: SupabaseClient,
  code: string
): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("preview_business_invite", { p_code: code });
  if (error) {
    throw new Error(`invites.preview failed: ${error.message}`);
  }
  const rows = data as PreviewRow[];
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  return {
    tenantId: row.business_id,
    tenantName: row.business_name,
    memberRole: row.member_role,
    invitedName: row.invited_name,
    status: row.status,
    emailHint: row.email_hint,
    isForMe: row.is_for_me,
  };
}

export async function acceptInvite(supabase: SupabaseClient, code: string): Promise<void> {
  const { error } = await supabase.rpc("accept_business_invite", { p_code: code });
  if (error) {
    throw new Error(error.message);
  }
}

export async function declineInvite(supabase: SupabaseClient, code: string): Promise<void> {
  const { error } = await supabase.rpc("decline_business_invite", { p_code: code });
  if (error) {
    throw new Error(error.message);
  }
}

/** Owner-only, and the RPC says so. 'owner' is not a settable role. */
/** ⚠ A RELABEL, NOT AN INVITE (20 Sep 2026): this one takes `MemberRole`, which
 *  includes `owner`, because a studio's desk may hand the owner seat to somebody
 *  ALREADY on the team. Every INVITE door beside it still takes `InvitableRole`
 *  and the two invite RPCs still refuse owner — consent first, the seat after. */
export async function setMemberRole(
  supabase: SupabaseClient,
  input: { tenantId: string; userId: string; role: MemberRole }
): Promise<void> {
  const { error } = await supabase.rpc("set_member_role", {
    p_business_id: input.tenantId,
    p_user_id: input.userId,
    p_role: input.role,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Removing somebody closes their class claims in the same act — see the
 *  migration's note on can_run_register_for_class. */
export async function removeMember(
  supabase: SupabaseClient,
  input: { tenantId: string; userId: string }
): Promise<void> {
  const { error } = await supabase.rpc("remove_business_member", {
    p_business_id: input.tenantId,
    p_user_id: input.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export type { MemberRole };
