import type { Metadata } from "next";
import { AccountsDesk } from "@/features/admin/components/AccountsDesk";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminAccounts } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Accounts — DanceOS admin" };

/** /admin/accounts — every live account, searchable by name, email or city.
 *  The search term is the URL, so a search has an address. Two actions per
 *  account: write to it, or suspend it with a reason it reads back. */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const accounts = await findAdminAccounts(supabase, { q: term || null, limit: 100 });
  return (
    <AdminShell badges={badges}>
      <AccountsDesk accounts={accounts} q={term} nowIso={nowIso} />
    </AdminShell>
  );
}
