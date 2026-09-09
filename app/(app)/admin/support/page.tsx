import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { SupportThreads } from "@/features/support/components/SupportThreads";
import { findSupportThreads } from "@/repositories/support";

export const metadata: Metadata = { title: "Support — DanceOS admin" };

/** /admin/support — every conversation on the platform, the ones waiting on a
 *  reply first. An admin cannot open a thread from here (there is nobody named
 *  yet); Accounts has the Write button beside each person. */
export default async function AdminSupportPage() {
  const { supabase, badges, nowIso } = await requireAdmin();
  const threads = await findSupportThreads(supabase);
  return (
    <AdminShell badges={badges}>
      <SupportThreads threads={threads} isAdmin nowIso={nowIso} canOpen={false} />
    </AdminShell>
  );
}
