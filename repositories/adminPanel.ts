import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRole } from "@/types/profile";

/** The admin panel's reads beyond the verification queue (10 Sep 2026): the
 *  dashboard's pulse, the audit log, and the account list every other admin
 *  screen needs to name somebody. Every function here goes through a
 *  SECURITY DEFINER RPC that checks `is_platform_admin()` itself — an
 *  admin-only account has no profile to join to, so the app cannot do the
 *  scoping with a plain query. */

export interface AdminDashboard {
  waiting: { verifications: number; threads: number; reports: number; pastDue: number; refunds: number; stuckWebhooks: number };
  accounts: { users: number; orgs: number; artists: number; verifiedOrgs: number; suspended: number; admins: number; newThisWeek: number };
  businesses: { studios: number; artistPages: number; listed: number; unlisted: number; subscribedStudios: number; rooms: number };
  /** the recurring plans, the way a billing desk counts them (10 Sep 2026) */
  subscriptions: { active: number; renewing: number; granted: number; canceling: number; pastDue: number; mrrInr: number };
  activity: { classesLive: number; eventsLive: number; crews: number; bookingsWeek: number; eventBookingsWeek: number; enquiriesOpen: number };
  money: { capturedWeekInr: number; capturedAllInr: number; plansAllInr: number; refundedAllInr: number; payoutsPending: number; ordersUnpaid: number };
}

interface RawDashboard {
  waiting: { verifications: number; threads: number; reports: number; past_due: number; refunds: number; stuck_webhooks: number };
  accounts: { users: number; orgs: number; artists: number; verified_orgs: number; suspended: number; admins: number; new_this_week: number };
  businesses: { studios: number; artist_pages: number; listed: number; unlisted: number; subscribed_studios: number; rooms: number };
  subscriptions: { active: number; renewing: number; granted: number; canceling: number; past_due: number; mrr_inr: number };
  activity: { classes_live: number; events_live: number; crews: number; bookings_week: number; event_bookings_week: number; enquiries_open: number };
  money: { captured_week_inr: number; captured_all_inr: number; plans_all_inr: number; refunded_all_inr: number; payouts_pending: number; orders_unpaid: number };
}

const n = (v: unknown) => Number(v ?? 0);

export async function findAdminDashboard(supabase: SupabaseClient): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) {
    throw new Error(`admin.dashboard failed: ${error.message}`);
  }
  const d = data as RawDashboard;
  return {
    waiting: { verifications: n(d.waiting.verifications), threads: n(d.waiting.threads), reports: n(d.waiting.reports), pastDue: n(d.waiting.past_due), refunds: n(d.waiting.refunds), stuckWebhooks: n(d.waiting.stuck_webhooks) },
    accounts: { users: n(d.accounts.users), orgs: n(d.accounts.orgs), artists: n(d.accounts.artists), verifiedOrgs: n(d.accounts.verified_orgs), suspended: n(d.accounts.suspended), admins: n(d.accounts.admins), newThisWeek: n(d.accounts.new_this_week) },
    businesses: { studios: n(d.businesses.studios), artistPages: n(d.businesses.artist_pages), listed: n(d.businesses.listed), unlisted: n(d.businesses.unlisted), subscribedStudios: n(d.businesses.subscribed_studios), rooms: n(d.businesses.rooms) },
    subscriptions: { active: n(d.subscriptions?.active), renewing: n(d.subscriptions?.renewing), granted: n(d.subscriptions?.granted), canceling: n(d.subscriptions?.canceling), pastDue: n(d.subscriptions?.past_due), mrrInr: n(d.subscriptions?.mrr_inr) },
    activity: { classesLive: n(d.activity.classes_live), eventsLive: n(d.activity.events_live), crews: n(d.activity.crews), bookingsWeek: n(d.activity.bookings_week), eventBookingsWeek: n(d.activity.event_bookings_week), enquiriesOpen: n(d.activity.enquiries_open) },
    money: { capturedWeekInr: n(d.money.captured_week_inr), capturedAllInr: n(d.money.captured_all_inr), plansAllInr: n(d.money.plans_all_inr), refundedAllInr: n(d.money.refunded_all_inr), payoutsPending: n(d.money.payouts_pending), ordersUnpaid: n(d.money.orders_unpaid) },
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
  /** a studio's own subscription (10 Sep 2026); null on an artist page or none */
  subscriptionId: string | null;
  subStatus: "pending_auth" | "active" | "past_due" | "canceled" | "expired" | null;
  subUntil: string | null;
  subGranted: boolean;
  /** will charge again on its own: active, not granted, not cancelling */
  subRenews: boolean;
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
    subscriptionId: (r.subscription_id as string) ?? null,
    subStatus: (r.sub_status as AdminBusiness["subStatus"]) ?? null,
    subUntil: (r.sub_until as string) ?? null,
    subGranted: Boolean(r.sub_granted),
    subRenews: Boolean(r.sub_renews),
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

/* ── phase 3: the money desk and the communication desk (11 Sep 2026) ─────── */

/** THE DESK EXISTS BEFORE ITS MIGRATION DOES.
 *
 *  Every read below goes through an RPC that arrives in
 *  `20260913110000_admin_money_and_communication.sql`. Until that migration is
 *  pushed the function is simply not there, and PostgREST answers `42883`
 *  (undefined_function) — which, thrown, is a 500 and a stack trace on a screen
 *  an admin opened on purpose. That is the wrong answer to "you have not run
 *  the migration yet": it looks like the app is broken when it is only
 *  unfinished. So the missing function is caught by its own error code and the
 *  desk says so in a sentence. Every other error still throws. */
const UNDEFINED_FUNCTION = "42883";

export interface DeskResult<T> {
  rows: T;
  /** the RPC this desk reads is not in the database yet */
  needsMigration: boolean;
}

const missingFunction = (error: { code?: string } | null): boolean => error?.code === UNDEFINED_FUNCTION;

export interface AdminPayment {
  id: string;
  kind: "order" | "subscription_auth" | "subscription_charge";
  amountInr: number;
  status: string;
  method: string | null;
  provider: string;
  providerPaymentId: string | null;
  createdAt: string;
  payerId: string | null;
  payerName: string;
  payerEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  /** what the money was for, in the app's own words */
  what: string;
  refundedInr: number;
}

export async function findAdminPayments(
  supabase: SupabaseClient,
  input: { q?: string | null; kind?: string | null; status?: string | null; limit?: number } = {}
): Promise<DeskResult<AdminPayment[]>> {
  const { data, error } = await supabase.rpc("admin_payments", {
    p_q: input.q ?? null,
    p_kind: input.kind ?? null,
    p_status: input.status ?? null,
    p_limit: input.limit ?? 100,
  });
  if (error) {
    if (missingFunction(error)) {
      return { rows: [], needsMigration: true };
    }
    throw new Error(`admin.payments failed: ${error.message}`);
  }
  return {
    needsMigration: false,
    rows: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      kind: r.kind as AdminPayment["kind"],
      amountInr: n(r.amount_inr),
      status: r.status as string,
      method: (r.method as string) ?? null,
      provider: (r.provider as string) ?? "cashfree",
      providerPaymentId: (r.provider_payment_id as string) ?? null,
      createdAt: r.created_at as string,
      payerId: (r.payer_id as string) ?? null,
      payerName: (r.payer_name as string) ?? "Someone",
      payerEmail: (r.payer_email as string) ?? null,
      tenantId: (r.tenant_id as string) ?? null,
      tenantName: (r.tenant_name as string) ?? null,
      what: (r.what as string) ?? "",
      refundedInr: n(r.refunded_inr),
    })),
  };
}

export interface AdminRefund {
  id: string;
  amountInr: number;
  status: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  settledOffline: boolean;
  providerRefundId: string | null;
  learnerId: string | null;
  learnerName: string;
  tenantId: string | null;
  tenantName: string | null;
  classTitle: string;
  /** days somebody has been waiting — the number that says which one to chase */
  waitingDays: number;
}

export async function findAdminRefunds(
  supabase: SupabaseClient,
  input: { status?: string | null; limit?: number } = {}
): Promise<DeskResult<AdminRefund[]>> {
  const { data, error } = await supabase.rpc("admin_refunds", {
    p_status: input.status ?? null,
    p_limit: input.limit ?? 100,
  });
  if (error) {
    if (missingFunction(error)) {
      return { rows: [], needsMigration: true };
    }
    throw new Error(`admin.refunds failed: ${error.message}`);
  }
  return {
    needsMigration: false,
    rows: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      amountInr: n(r.amount_inr),
      status: r.status as string,
      reason: (r.reason as string) ?? null,
      createdAt: r.created_at as string,
      decidedAt: (r.decided_at as string) ?? null,
      decisionNote: (r.decision_note as string) ?? null,
      settledOffline: Boolean(r.settled_offline),
      providerRefundId: (r.provider_refund_id as string) ?? null,
      learnerId: (r.learner_id as string) ?? null,
      learnerName: (r.learner_name as string) ?? "Someone",
      tenantId: (r.tenant_id as string) ?? null,
      tenantName: (r.tenant_name as string) ?? null,
      classTitle: (r.class_title as string) ?? "A class",
      waitingDays: n(r.waiting_days),
    })),
  };
}

export interface AdminPayout {
  id: string;
  amountInr: number;
  status: string;
  method: string;
  providerRef: string | null;
  paidOn: string;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
  personId: string | null;
  personName: string;
}

export async function findAdminPayouts(
  supabase: SupabaseClient,
  input: { status?: string | null; limit?: number } = {}
): Promise<DeskResult<AdminPayout[]>> {
  const { data, error } = await supabase.rpc("admin_payouts", {
    p_status: input.status ?? null,
    p_limit: input.limit ?? 100,
  });
  if (error) {
    if (missingFunction(error)) {
      return { rows: [], needsMigration: true };
    }
    throw new Error(`admin.payouts failed: ${error.message}`);
  }
  return {
    needsMigration: false,
    rows: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      amountInr: n(r.amount_inr),
      status: r.status as string,
      method: (r.method as string) ?? "bank_transfer",
      providerRef: (r.provider_ref as string) ?? null,
      paidOn: r.paid_on as string,
      createdAt: r.created_at as string,
      tenantId: (r.tenant_id as string) ?? null,
      tenantName: (r.tenant_name as string) ?? null,
      personId: (r.person_id as string) ?? null,
      personName: (r.person_name as string) ?? "Someone",
    })),
  };
}

export interface AdminMoneySummary {
  capturedTodayInr: number;
  capturedWeekInr: number;
  capturedAllInr: number;
  platformAllInr: number;
  classesAllInr: number;
  refundedAllInr: number;
  refundsWaiting: number;
  refundsOldestDays: number;
  paymentsFailedWeek: number;
  ordersUnpaid: number;
  payoutsAllInr: number;
  payoutsPending: number;
  webhooksStuck: number;
}

const ZERO_MONEY: AdminMoneySummary = {
  capturedTodayInr: 0, capturedWeekInr: 0, capturedAllInr: 0, platformAllInr: 0, classesAllInr: 0,
  refundedAllInr: 0, refundsWaiting: 0, refundsOldestDays: 0, paymentsFailedWeek: 0,
  ordersUnpaid: 0, payoutsAllInr: 0, payoutsPending: 0, webhooksStuck: 0,
};

export async function findAdminMoneySummary(supabase: SupabaseClient): Promise<DeskResult<AdminMoneySummary>> {
  const { data, error } = await supabase.rpc("admin_money_summary");
  if (error) {
    if (missingFunction(error)) {
      return { rows: ZERO_MONEY, needsMigration: true };
    }
    throw new Error(`admin.money failed: ${error.message}`);
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    needsMigration: false,
    rows: {
      capturedTodayInr: n(d.captured_today_inr),
      capturedWeekInr: n(d.captured_week_inr),
      capturedAllInr: n(d.captured_all_inr),
      platformAllInr: n(d.platform_all_inr),
      classesAllInr: n(d.classes_all_inr),
      refundedAllInr: n(d.refunded_all_inr),
      refundsWaiting: n(d.refunds_waiting),
      refundsOldestDays: n(d.refunds_oldest_days),
      paymentsFailedWeek: n(d.payments_failed_week),
      ordersUnpaid: n(d.orders_unpaid),
      payoutsAllInr: n(d.payouts_all_inr),
      payoutsPending: n(d.payouts_pending),
      webhooksStuck: n(d.webhooks_stuck),
    },
  };
}

export interface AdminCommunication {
  notifications: {
    today: number;
    week: number;
    all: number;
    unread: number;
    readPct: number;
    byKind: Array<{ kind: string; n: number; readPct: number }>;
  };
  support: { open: number; closed: number; waitingOnUs: number; oldestWaitingDays: number; messagesWeek: number };
  enquiries: { open: number; week: number; all: number };
}

const ZERO_COMMS: AdminCommunication = {
  notifications: { today: 0, week: 0, all: 0, unread: 0, readPct: 0, byKind: [] },
  support: { open: 0, closed: 0, waitingOnUs: 0, oldestWaitingDays: 0, messagesWeek: 0 },
  enquiries: { open: 0, week: 0, all: 0 },
};

export async function findAdminCommunication(supabase: SupabaseClient): Promise<DeskResult<AdminCommunication>> {
  const { data, error } = await supabase.rpc("admin_communication");
  if (error) {
    if (missingFunction(error)) {
      return { rows: ZERO_COMMS, needsMigration: true };
    }
    throw new Error(`admin.communication failed: ${error.message}`);
  }
  const d = (data ?? {}) as {
    notifications?: { today?: number; week?: number; all?: number; unread?: number; read_pct?: number; by_kind?: Array<{ kind: string; n: number; read_pct: number }> };
    support?: { open?: number; closed?: number; waiting_on_us?: number; oldest_waiting_days?: number; messages_week?: number };
    enquiries?: { open?: number; week?: number; all?: number };
  };
  return {
    needsMigration: false,
    rows: {
      notifications: {
        today: n(d.notifications?.today),
        week: n(d.notifications?.week),
        all: n(d.notifications?.all),
        unread: n(d.notifications?.unread),
        readPct: n(d.notifications?.read_pct),
        byKind: (d.notifications?.by_kind ?? []).map((k) => ({ kind: k.kind, n: n(k.n), readPct: n(k.read_pct) })),
      },
      support: {
        open: n(d.support?.open),
        closed: n(d.support?.closed),
        waitingOnUs: n(d.support?.waiting_on_us),
        oldestWaitingDays: n(d.support?.oldest_waiting_days),
        messagesWeek: n(d.support?.messages_week),
      },
      enquiries: { open: n(d.enquiries?.open), week: n(d.enquiries?.week), all: n(d.enquiries?.all) },
    },
  };
}

export interface AdminNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  personId: string | null;
  personName: string;
}

export async function findAdminRecentNotifications(
  supabase: SupabaseClient,
  input: { kind?: string | null; limit?: number } = {}
): Promise<DeskResult<AdminNotification[]>> {
  const { data, error } = await supabase.rpc("admin_recent_notifications", {
    p_kind: input.kind ?? null,
    p_limit: input.limit ?? 50,
  });
  if (error) {
    if (missingFunction(error)) {
      return { rows: [], needsMigration: true };
    }
    throw new Error(`admin.notifications failed: ${error.message}`);
  }
  return {
    needsMigration: false,
    rows: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      title: r.title as string,
      body: (r.body as string) ?? null,
      href: (r.href as string) ?? null,
      readAt: (r.read_at as string) ?? null,
      createdAt: r.created_at as string,
      personId: (r.person_id as string) ?? null,
      personName: (r.person_name as string) ?? "Someone",
    })),
  };
}
