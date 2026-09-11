import type { Metadata } from "next";
import { AdminDashboardScreen } from "@/features/admin/components/AdminDashboard";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminDashboard } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Dashboard — DanceOS admin" };

/** /admin/dashboard — the platform in figures (11 Sep 2026). These used to sit
 *  under the blocks on /admin, which made the front door a scroll and pushed
 *  half the desks below the fold; they are a desk of their own now, reached
 *  from their own block.
 *
 *  One SECURITY DEFINER call answers the whole page — the panel never reads a
 *  person's row to draw a count. */
export default async function AdminDashboardPage() {
  const { supabase, badges, nowIso } = await requireAdmin();
  const pulse = await findAdminDashboard(supabase);
  return (
    <AdminShell badges={badges}>
      <AdminDashboardScreen pulse={pulse} nowIso={nowIso} />
    </AdminShell>
  );
}
