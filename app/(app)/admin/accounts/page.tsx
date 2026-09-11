import type { Metadata } from "next";
import { AccountsDesk } from "@/features/admin/components/AccountsDesk";
import { ACCOUNT_TABS, onAccountTab, type AccountTab } from "@/features/admin/components/accounts-tabs";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminAccounts, findAdminDashboard } from "@/repositories/adminPanel";
import { findAdminOrgStanding } from "@/repositories/orgStanding";

export const metadata: Metadata = { title: "Accounts — DanceOS admin" };

/** /admin/accounts — every live account as a DESK (11 Sep 2026): the figures
 *  from the one dashboard aggregate, a tab per kind with its count, a search by
 *  name, email or city, and one page. Per account: write to it, or suspend it
 *  with a reason it reads back — and for an organization, set up or end the
 *  subscription that lets it open studios (R14, 9 Sep 2026). */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const term = params.q?.trim().slice(0, 80) ?? "";
  const tab: AccountTab = ACCOUNT_TABS.includes(params.tab as AccountTab) ? (params.tab as AccountTab) : "all";
  const page = pageOf(params.page);

  const [pulse, all] = await Promise.all([findAdminDashboard(supabase), findAdminAccounts(supabase, { q: term || null, limit: 500 })]);
  const matching = all.filter((a) => onAccountTab(a, tab));
  const accounts = sliceForPage(matching, page, PAGE_SIZE);

  /* one call for every organization on THIS PAGE, not one per row */
  const standingMap = await findAdminOrgStanding(
    supabase,
    accounts.filter((a) => a.role === "org").map((a) => a.id)
  ).catch(() => new Map());

  return (
    <AdminShell badges={badges}>
      <AccountsDesk
        accounts={accounts}
        standing={Object.fromEntries(standingMap)}
        q={term}
        tab={tab}
        counts={{
          all: pulse.accounts.users + pulse.accounts.orgs + pulse.accounts.suspended,
          users: pulse.accounts.users,
          orgs: pulse.accounts.orgs,
          suspended: pulse.accounts.suspended,
          artists: pulse.accounts.artists,
          verifiedOrgs: pulse.accounts.verifiedOrgs,
        }}
        page={page}
        total={matching.length}
        nowIso={nowIso}
      />
    </AdminShell>
  );
}
