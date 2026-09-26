import type { AdminAccount } from "@/repositories/adminPanel";

/** The Accounts desk's tabs and their rule — a plain module, because the page
 *  (a server component) decides which accounts are on the tab and the desk (a
 *  client component) draws the tab, and a value exported from a client file is
 *  not a value on the server (11 Sep 2026).
 *
 *  ⚠ NO "organizations" TAB SINCE 26 Sep 2026: the organization LOGIN is
 *  retired, so `profiles.role` is `user` for everybody and a tab keyed on it
 *  would be empty for ever. An organization is a BUSINESS now and is listed on
 *  the Businesses desk beside the studios. What is worth a tab here is the
 *  Artist plan, which is a fact about a PERSON. An old `?tab=orgs` bookmark
 *  degrades to All. */
export type AccountTab = "all" | "artists" | "suspended";
export const ACCOUNT_TABS: ReadonlyArray<AccountTab> = ["all", "artists", "suspended"];

export interface AccountCounts {
  all: number;
  /** people on the Artist plan */
  artists: number;
  suspended: number;
}

/** the tab an account belongs on — one place, so the counts and the list agree */
export const onAccountTab = (a: AdminAccount, tab: AccountTab): boolean =>
  tab === "all" ? true : tab === "suspended" ? Boolean(a.suspendedAt) : a.hasPlan;
