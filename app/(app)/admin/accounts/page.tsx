import type { Metadata } from "next";
import { AccountsDesk } from "@/features/admin/components/AccountsDesk";
import { ACCOUNT_TABS, onAccountTab, type AccountTab } from "@/features/admin/components/accounts-tabs";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminAccounts, findAdminBusinesses, findAdminDashboard } from "@/repositories/adminPanel";
import { ownerStandingOf } from "@/repositories/orgStanding";

export const metadata: Metadata = { title: "Accounts — DanceOS admin" };

/** /admin/accounts — every live account as a DESK (11 Sep 2026): the figures
 *  from the one dashboard aggregate, a tab per kind with its count, a search by
 *  name, email or city, and one page. Per account: write to it, suspend it
 *  with a reason it reads back, or comp the Artist plan. ⚠ Since 26 Sep 2026
 *  every account is a PERSON: a studio's or an organization's standing is on
 *  the Businesses desk, and what this desk prints beside an owner is a count
 *  of what they run, off the same list. */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const term = params.q?.trim().slice(0, 80) ?? "";
  const tab: AccountTab = ACCOUNT_TABS.includes(params.tab as AccountTab) ? (params.tab as AccountTab) : "all";
  const page = pageOf(params.page);

  const [pulse, all, businesses] = await Promise.all([
    findAdminDashboard(supabase),
    findAdminAccounts(supabase, { q: term || null, limit: 500 }),
    /* every business, so an owner's count is whole whatever the search term was;
       answers empty rather than failing the desk over a figure on a chip */
    findAdminBusinesses(supabase, { limit: 500 }).catch(() => []),
  ]);
  const matching = all.filter((a) => onAccountTab(a, tab));
  const accounts = sliceForPage(matching, page, PAGE_SIZE);
  const standingMap = ownerStandingOf(businesses);

  return (
    <AdminShell badges={badges}>
      <AccountsDesk
        accounts={accounts}
        standing={Object.fromEntries(standingMap)}
        q={term}
        tab={tab}
        counts={{
          /* `admin_dashboard` still counts by the retired role: `orgs` is 0 for
             ever and `users` is everybody, so the two together are still the
             live total */
          all: pulse.accounts.users + pulse.accounts.orgs + pulse.accounts.suspended,
          artists: pulse.accounts.artists,
          suspended: pulse.accounts.suspended,
        }}
        page={page}
        total={matching.length}
        nowIso={nowIso}
      />
    </AdminShell>
  );
}
