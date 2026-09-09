import type { Metadata } from "next";
import { AccountsDesk } from "@/features/admin/components/AccountsDesk";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminAccounts } from "@/repositories/adminPanel";
import { findAdminOrgStanding } from "@/repositories/orgStanding";

export const metadata: Metadata = { title: "Accounts — DanceOS admin" };

/** /admin/accounts — every live account, searchable by name, email or city.
 *  The search term is the URL, so a search has an address. Per account: write to
 *  it, or suspend it with a reason it reads back — and for an organization, set
 *  up or end the subscription that lets it open studios (R14, 9 Sep 2026). */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const accounts = await findAdminAccounts(supabase, { q: term || null, limit: 100 });
  /* one call for every organization on the page, not one per row */
  const standingMap = await findAdminOrgStanding(
    supabase,
    accounts.filter((a) => a.role === "org").map((a) => a.id)
  ).catch(() => new Map());
  return (
    <AdminShell badges={badges}>
      <AccountsDesk accounts={accounts} standing={Object.fromEntries(standingMap)} q={term} nowIso={nowIso} />
    </AdminShell>
  );
}
