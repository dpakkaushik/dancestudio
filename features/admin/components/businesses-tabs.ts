import type { AdminBusiness } from "@/repositories/adminPanel";

/** The Businesses desk's tabs and their rule — a plain module, for the same
 *  reason as accounts-tabs.ts: the page filters, the desk draws, and only a
 *  file without a directive is a value on both sides (11 Sep 2026).
 *
 *  ⚠ The `organizations` tab (26 Sep 2026) went with organizations on 29 Sep.
 *  The 20 rows still on production until the sweep runs are not hidden — they
 *  fall under ALL, which is what an admin desk is for: it shows what the
 *  database holds, not what the app can still make. */
export type BusinessTab = "all" | "studios" | "artists" | "public" | "private";
export const BUSINESS_TABS: ReadonlyArray<BusinessTab> = ["all", "studios", "artists", "public", "private"];

export interface BusinessCounts {
  all: number;
  studios: number;
  artists: number;
  listed: number;
  unlisted: number;
  subscribedStudios: number;
}

/** the tab a business belongs on — one place, so the counts and the list agree */
export const onBusinessTab = (b: AdminBusiness, tab: BusinessTab): boolean =>
  tab === "all"
    ? true
    : tab === "studios"
      ? b.type === "studio"
      : tab === "artists"
        ? b.type === "artist_page"
        : tab === "public"
          ? b.visibility === "listed"
          : b.visibility === "unlisted";
