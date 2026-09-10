import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { SubscriptionsDesk } from "@/features/admin/components/SubscriptionsDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminSubscriptions, type SubscriptionStatus } from "@/repositories/subscriptions";

export const metadata: Metadata = { title: "Subscriptions — DanceOS admin" };

const STATUSES: ReadonlyArray<SubscriptionStatus> = ["pending_auth", "active", "past_due", "canceled", "expired"];

/** /admin/subscriptions — every recurring plan, filterable by where it stands
 *  (10 Sep 2026). The billing desk the money section was waiting for. */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as SubscriptionStatus) ? (status as SubscriptionStatus) : "all";
  const rows = await findAdminSubscriptions(supabase, { status: filter === "all" ? null : filter, limit: 200 });
  return (
    <AdminShell badges={badges}>
      <SubscriptionsDesk rows={rows} status={filter} nowIso={nowIso} />
    </AdminShell>
  );
}
