import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRole } from "@/types/profile";

/** The admin panel's reads beyond the verification queue (10 Sep 2026): the
 *  dashboard's pulse, the audit log, and the account list every other admin
 *  screen needs to name somebody. Every function here goes through a
 *  SECURITY DEFINER RPC that checks `is_platform_admin()` itself — an
 *  admin-only account has no profile to join to, so the app cannot do the
 *  scoping with a plain query. */

export interface AdminDashboard {
  waiting: { verifications: number; threads: number; refunds: number; stuckWebhooks: number };
  accounts: { users: number; orgs: number; artists: number; verifiedOrgs: number; suspended: number; admins: number; newThisWeek: number };
  businesses: { studios: number; artistPages: number; listed: number; unlisted: number; rooms: number };
  activity: { classesLive: number; eventsLive: number; crews: number; bookingsWeek: number; eventBookingsWeek: number; enquiriesOpen: number };
  money: { capturedWeekInr: number; capturedAllInr: number; refundedAllInr: number; payoutsPending: number; ordersUnpaid: number };
}

interface RawDashboard {
  waiting: { verifications: number; threads: number; refunds: number; stuck_webhooks: number };
  accounts: { users: number; orgs: number; artists: number; verified_orgs: number; suspended: number; admins: number; new_this_week: number };
  businesses: { studios: number; artist_pages: number; listed: number; unlisted: number; rooms: number };
  activity: { classes_live: number; events_live: number; crews: number; bookings_week: number; event_bookings_week: number; enquiries_open: number };
  money: { captured_week_inr: number; captured_all_inr: number; refunded_all_inr: number; payouts_pending: number; orders_unpaid: number };
}

const n = (v: unknown) => Number(v ?? 0);

export async function findAdminDashboard(supabase: SupabaseClient): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) {
    throw new Error(`admin.dashboard failed: ${error.message}`);
  }
  const d = data as RawDashboard;
  return {
    waiting: { verifications: n(d.waiting.verifications), threads: n(d.waiting.threads), refunds: n(d.waiting.refunds), stuckWebhooks: n(d.waiting.stuck_webhooks) },
    accounts: { users: n(d.accounts.users), orgs: n(d.accounts.orgs), artists: n(d.accounts.artists), verifiedOrgs: n(d.accounts.verified_orgs), suspended: n(d.accounts.suspended), admins: n(d.accounts.admins), newThisWeek: n(d.accounts.new_this_week) },
    businesses: { studios: n(d.businesses.studios), artistPages: n(d.businesses.artist_pages), listed: n(d.businesses.listed), unlisted: n(d.businesses.unlisted), rooms: n(d.businesses.rooms) },
    activity: { classesLive: n(d.activity.classes_live), eventsLive: n(d.activity.events_live), crews: n(d.activity.crews), bookingsWeek: n(d.activity.bookings_week), eventBookingsWeek: n(d.activity.event_bookings_week), enquiriesOpen: n(d.activity.enquiries_open) },
    money: { capturedWeekInr: n(d.money.captured_week_inr), capturedAllInr: n(d.money.captured_all_inr), refundedAllInr: n(d.money.refunded_all_inr), payoutsPending: n(d.money.payouts_pending), ordersUnpaid: n(d.money.orders_unpaid) },
  };
}

export interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string | null;
  action: string;
  subjectKind: "profile" | "tenant" | "request" | "thread";
  subjectId: string | null;
  subjectLabel: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export async function findAdminAuditLog(
  supabase: SupabaseClient,
  input: { limit?: number; action?: string | null } = {}
): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_limit: input.limit ?? 100,
    p_action: input.action ?? null,
  });
  if (error) {
    throw new Error(`admin.audit failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string; actor_id: string; actor_email: string | null; action: string;
    subject_kind: AuditEntry["subjectKind"]; subject_id: string | null; subject_label: string | null;
    reason: string | null; detail: Record<string, unknown>; created_at: string;
  }>).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    action: r.action,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    subjectLabel: r.subject_label,
    reason: r.reason,
    detail: r.detail ?? {},
    createdAt: r.created_at,
  }));
}

export interface AdminAccount {
  id: string;
  email: string | null;
  fullName: string;
  role: ProfileRole;
  city: string | null;
  avatarPath: string | null;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  isAdmin: boolean;
  hasPlan: boolean;
  owns: number;
  createdAt: string;
  lastSignInAt: string | null;
}

export async function findAdminAccounts(
  supabase: SupabaseClient,
  input: { q?: string | null; limit?: number } = {}
): Promise<AdminAccount[]> {
  const { data, error } = await supabase.rpc("admin_accounts", {
    p_q: input.q ?? null,
    p_limit: input.limit ?? 50,
  });
  if (error) {
    throw new Error(`admin.accounts failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string; email: string | null; full_name: string; role: ProfileRole; city: string | null;
    avatar_path: string | null; verified_at: string | null; suspended_at: string | null;
    suspended_reason: string | null; is_admin: boolean; has_plan: boolean; owns: number;
    created_at: string; last_sign_in_at: string | null;
  }>).map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    city: r.city,
    avatarPath: r.avatar_path,
    verifiedAt: r.verified_at,
    suspendedAt: r.suspended_at,
    suspendedReason: r.suspended_reason,
    isAdmin: r.is_admin,
    hasPlan: r.has_plan,
    owns: Number(r.owns ?? 0),
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
  }));
}

export async function suspendAccount(supabase: SupabaseClient, accountId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_suspend_account", { p_account_id: accountId, p_reason: reason });
  if (error) {
    throw new Error(error.message);
  }
}

export async function unsuspendAccount(supabase: SupabaseClient, accountId: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc("admin_unsuspend_account", { p_account_id: accountId, p_note: note ?? null });
  if (error) {
    throw new Error(error.message);
  }
}
