import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { MoneyDesk, type MoneyTab } from "@/features/admin/components/MoneyDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import {
  findAdminMoneySummary,
  findAdminPayments,
  findAdminPayouts,
  findAdminRefunds,
} from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Money — DanceOS admin" };

const TABS: ReadonlyArray<MoneyTab> = ["payments", "refunds", "payouts"];
const PAYMENT_STATUSES = ["captured", "failed", "refunded"];
const REFUND_STATUSES = ["requested", "pending", "processed", "failed"];
const PAYOUT_STATUSES = ["done", "in_transit", "on_hold", "failed"];

/** /admin/payments — the money segment (11 Sep 2026). Money in, money back,
 *  money on: three tabs on one page, because they are one question asked three
 *  ways, and an admin chasing a refund needs the payment beside it.
 *
 *  Only the tab being shown is read. The summary is one aggregate call and is
 *  always read, because it is the header. */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; q?: string }>;
}) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const tab = TABS.includes(params.tab as MoneyTab) ? (params.tab as MoneyTab) : "payments";

  /* a status word only means something on the tab it belongs to, so a stale one
     in the address is ignored rather than emptying the list (Discover's rule) */
  const allowed = tab === "payments" ? PAYMENT_STATUSES : tab === "refunds" ? REFUND_STATUSES : PAYOUT_STATUSES;
  const status = params.status && allowed.includes(params.status) ? params.status : null;
  const q = params.q?.trim() || null;

  const [summary, payments, refunds, payouts] = await Promise.all([
    findAdminMoneySummary(supabase),
    tab === "payments"
      ? findAdminPayments(supabase, { q, status, limit: 200 })
      : Promise.resolve({ rows: [], needsMigration: false }),
    tab === "refunds"
      ? findAdminRefunds(supabase, { status, limit: 200 })
      : Promise.resolve({ rows: [], needsMigration: false }),
    tab === "payouts"
      ? findAdminPayouts(supabase, { status, limit: 200 })
      : Promise.resolve({ rows: [], needsMigration: false }),
  ]);

  return (
    <AdminShell badges={badges}>
      <MoneyDesk
        tab={tab}
        summary={summary.rows}
        payments={payments.rows}
        refunds={refunds.rows}
        payouts={payouts.rows}
        filter={status ?? "all"}
        needsMigration={summary.needsMigration}
        nowIso={nowIso}
      />
    </AdminShell>
  );
}
