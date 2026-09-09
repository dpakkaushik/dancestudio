import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { AuditLog } from "@/features/admin/components/AuditLog";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminAuditLog } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Audit log — DanceOS admin" };

/** /admin/audit — every platform decision, newest first, filterable by action.
 *  The filter is the URL, so a filtered log has an address an admin can send
 *  to another admin. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const { action } = await searchParams;
  const filter = action?.trim() ? action.trim() : null;
  const entries = await findAdminAuditLog(supabase, { limit: 100, action: filter });
  return (
    <AdminShell badges={badges}>
      <AuditLog entries={entries} nowIso={nowIso} filter={filter} />
    </AdminShell>
  );
}
