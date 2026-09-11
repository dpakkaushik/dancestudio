import type { Metadata } from "next";
import { AdminDesksScreen } from "@/features/admin/components/AdminDesks";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminDashboard } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Admin — DanceOS" };

/** /admin — the panel's front door, and where a platform admin lands at
 *  sign-in (Home sends a profile-less admin here).
 *
 *  It is THE MAP AND NOTHING ELSE since 11 Sep 2026 (the user: "the main screen
 *  will only have a designated block for every part of it"): one line saying
 *  how much work is waiting, then every desk as a block with the number waiting
 *  on it. The figures that used to run down this page are their own desk now,
 *  behind the Dashboard block. */
export default async function AdminHomePage() {
  const { supabase, badges, nowIso } = await requireAdmin();
  const pulse = await findAdminDashboard(supabase);
  return (
    <AdminShell badges={badges}>
      <AdminDesksScreen pulse={pulse} badges={badges} nowIso={nowIso} />
    </AdminShell>
  );
}
