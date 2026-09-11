import type { AdminAccount } from "@/repositories/adminPanel";

/** The Accounts desk's tabs and their rule — a plain module, because the page
 *  (a server component) decides which accounts are on the tab and the desk (a
 *  client component) draws the tab, and a value exported from a client file is
 *  not a value on the server (11 Sep 2026). */
export type AccountTab = "all" | "users" | "orgs" | "suspended";
export const ACCOUNT_TABS: ReadonlyArray<AccountTab> = ["all", "users", "orgs", "suspended"];

export interface AccountCounts {
  all: number;
  users: number;
  orgs: number;
  suspended: number;
  /** people on the Artist plan — a figure, not a tab */
  artists: number;
  /** organizations wearing the tick */
  verifiedOrgs: number;
}

/** the tab an account belongs on — one place, so the counts and the list agree */
export const onAccountTab = (a: AdminAccount, tab: AccountTab): boolean =>
  tab === "all" ? true : tab === "suspended" ? Boolean(a.suspendedAt) : tab === "orgs" ? a.role === "org" : a.role !== "org";
