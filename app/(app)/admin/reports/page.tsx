import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { ReportsQueue } from "@/features/admin/components/ReportsQueue";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminReports } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Reports — DanceOS admin" };

const STATUSES = ["open", "actioned", "dismissed", "all"];

/** /admin/reports — what people have said is wrong. The filter is the URL, so
 *  a filtered queue has an address one admin can send another. */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const { status } = await searchParams;
  const filter = status && STATUSES.includes(status) ? status : "open";
  const reports = await findAdminReports(supabase, { status: filter, limit: 200 });
  return (
    <AdminShell badges={badges}>
      <ReportsQueue reports={reports} status={filter} nowIso={nowIso} />
    </AdminShell>
  );
}
