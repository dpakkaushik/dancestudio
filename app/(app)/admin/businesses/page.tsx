import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { BusinessesDesk } from "@/features/admin/components/BusinessesDesk";
import { BUSINESS_TABS, onBusinessTab, type BusinessTab } from "@/features/admin/components/businesses-tabs";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminBusinesses, findAdminDashboard } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Businesses — DanceOS admin" };

/** /admin/businesses — every studio, artist page and (since 26 Sep 2026)
 *  organization as a DESK (11 Sep 2026): the figures, a tab per kind and per
 *  visibility with its count, a search, one page — and the switch that takes
 *  ONE of them off Discover without touching the rest an owner runs. */
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const { supabase, badges } = await requireAdmin();
  const params = await searchParams;
  const term = params.q?.trim().slice(0, 80) ?? "";
  const tab: BusinessTab = BUSINESS_TABS.includes(params.tab as BusinessTab) ? (params.tab as BusinessTab) : "all";
  const page = pageOf(params.page);

  const [pulse, all, unfiltered] = await Promise.all([
    findAdminDashboard(supabase),
    findAdminBusinesses(supabase, { q: term || null, limit: 500 }),
    /* ⚠ `admin_dashboard` does not count organizations (it predates them as
       businesses), so their figure is counted off the whole list — a second
       read only while a search term narrows the first */
    term ? findAdminBusinesses(supabase, { limit: 500 }).catch(() => null) : null,
  ]);
  const matching = all.filter((b) => onBusinessTab(b, tab));
  const organizations = (unfiltered ?? all).filter((b) => b.type === "org").length;

  return (
    <AdminShell badges={badges}>
      <BusinessesDesk
        businesses={sliceForPage(matching, page, PAGE_SIZE)}
        q={term}
        tab={tab}
        counts={{
          all: pulse.businesses.studios + pulse.businesses.artistPages + organizations,
          studios: pulse.businesses.studios,
          artists: pulse.businesses.artistPages,
          organizations,
          listed: pulse.businesses.listed,
          unlisted: pulse.businesses.unlisted,
          subscribedStudios: pulse.businesses.subscribedStudios,
        }}
        page={page}
        total={matching.length}
      />
    </AdminShell>
  );
}
