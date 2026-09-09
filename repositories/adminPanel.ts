import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRole } from "@/types/profile";

/** The admin panel's reads beyond the verification queue (10 Sep 2026): the
 *  dashboard's pulse, the audit log, and the account list every other admin
 *  screen needs to name somebody. Every function here goes through a
 *  SECURITY DEFINER RPC that checks `is_platform_admin()` itself — an
 *  admin-only account has no profile to join to, so the app cannot do the
 *  scoping with a plain query. */

export interface AdminDashboard {
  waiting: { verifications: number; threads: number; reports: number; refunds: number; stuckWebhooks: number };
  accounts: { users: number; orgs: number; artists: number; verifiedOrgs: number; suspended: number; admins: number; newThisWeek: number };
  businesses: { studios: number; artistPages: number; listed: number; unlisted: number; rooms: number };
  activity: { classesLive: number; eventsLive: number; crews: number; bookingsWeek: number; eventBookingsWeek: number; enquiriesOpen: number };
  money: { capturedWeekInr: number; capturedAllInr: number; refundedAllInr: number; payoutsPending: number; ordersUnpaid: number };
}

interface RawDashboard {
  waiting: { verifications: number; threads: number; reports: number; refunds: number; stuck_webhooks: number };
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
    waiting: { verifications: n(d.waiting.verifications), threads: n(d.waiting.threads), reports: n(d.waiting.reports), refunds: n(d.waiting.refunds), stuckWebhooks: n(d.waiting.stuck_webhooks) },
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

/* ── phase 2: businesses and moderation (10 Sep 2026) ────────────────────── */

export interface AdminBusiness {
  id: string;
  type: "studio" | "trainer_business";
  name: string;
  city: string | null;
  area: string | null;
  visibility: "listed" | "unlisted";
  photoPath: string | null;
  verifiedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerRole: ProfileRole | null;
  ownerVerified: boolean;
  ownerSuspended: boolean;
  rooms: number;
  classes: number;
  events: number;
  followers: number;
  createdAt: string;
}

export async function findAdminBusinesses(
  supabase: SupabaseClient,
  input: { q?: string | null; limit?: number } = {}
): Promise<AdminBusiness[]> {
  const { data, error } = await supabase.rpc("admin_businesses", { p_q: input.q ?? null, p_limit: input.limit ?? 100 });
  if (error) {
    throw new Error(`admin.businesses failed: ${error.message}`);
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    type: r.type as AdminBusiness["type"],
    name: r.name as string,
    city: (r.city as string) ?? null,
    area: (r.area as string) ?? null,
    visibility: r.visibility as AdminBusiness["visibility"],
    photoPath: (r.photo_path as string) ?? null,
    verifiedAt: (r.verified_at as string) ?? null,
    ownerId: (r.owner_id as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    ownerRole: (r.owner_role as ProfileRole) ?? null,
    ownerVerified: Boolean(r.owner_verified),
    ownerSuspended: Boolean(r.owner_suspended),
    rooms: n(r.rooms),
    classes: n(r.classes),
    events: n(r.events),
    followers: n(r.followers),
    createdAt: r.created_at as string,
  }));
}

export async function setTenantVisibility(
  supabase: SupabaseClient,
  tenantId: string,
  visibility: "listed" | "unlisted",
  reason?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_tenant_visibility", {
    p_tenant_id: tenantId,
    p_visibility: visibility,
    p_reason: reason ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export type ReportSubjectKind = "tenant" | "profile" | "crew" | "event" | "class";
export type ReportReason = "impersonation" | "not_a_real_business" | "stolen_content" | "offensive" | "spam" | "unsafe" | "other";
export type ReportStatus = "open" | "actioned" | "dismissed";

export interface AdminReport {
  id: string;
  reporterId: string;
  reporterName: string;
  subjectKind: ReportSubjectKind;
  subjectId: string;
  subjectLabel: string | null;
  subjectHref: string | null;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  /** how many OTHER people reported the same thing — one complaint or a case */
  others: number;
  createdAt: string;
}

export async function findAdminReports(
  supabase: SupabaseClient,
  input: { status?: string | null; limit?: number } = {}
): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc("admin_reports", {
    p_status: input.status ?? "open",
    p_limit: input.limit ?? 100,
  });
  if (error) {
    throw new Error(`admin.reports failed: ${error.message}`);
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    reporterId: r.reporter_id as string,
    reporterName: r.reporter_name as string,
    subjectKind: r.subject_kind as ReportSubjectKind,
    subjectId: r.subject_id as string,
    subjectLabel: (r.subject_label as string) ?? null,
    subjectHref: (r.subject_href as string) ?? null,
    reason: r.reason as ReportReason,
    note: (r.note as string) ?? null,
    status: r.status as ReportStatus,
    decisionNote: (r.decision_note as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    others: n(r.others),
    createdAt: r.created_at as string,
  }));
}

export async function decideReport(
  supabase: SupabaseClient,
  reportId: string,
  actioned: boolean,
  note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("decide_report", {
    p_report_id: reportId,
    p_actioned: actioned,
    p_note: note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Anybody signed in may report a business, a person, a crew, an event or a
 *  class. The RPC refuses yourself, a suspended caller, and a second open
 *  report on the same thing — each in words the screen can print. */
export async function reportContent(
  supabase: SupabaseClient,
  input: { subjectKind: ReportSubjectKind; subjectId: string; reason: ReportReason; note?: string | null }
): Promise<string> {
  const { data, error } = await supabase.rpc("report_content", {
    p_subject_kind: input.subjectKind,
    p_subject_id: input.subjectId,
    p_reason: input.reason,
    p_note: input.note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}
