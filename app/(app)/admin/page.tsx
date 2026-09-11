import type { Metadata } from "next";
import { AdminDashboardScreen } from "@/features/admin/components/AdminDashboard";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminDashboard } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Admin — DanceOS" };

/** /admin — the panel's front door, and where a platform admin lands at
 *  sign-in (Home sends a profile-less admin here). What is waiting on them
 *  first; the platform's shape after that. */
export default async function AdminHomePage() {
  const { supabase, badges, nowIso } = await requireAdmin();
  const pulse = await findAdminDashboard(supabase);
  return (
    <AdminShell badges={badges}>
      <AdminDashboardScreen pulse={pulse} badges={badges} nowIso={nowIso} />
    </AdminShell>
  );
}
