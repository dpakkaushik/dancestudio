import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { BusinessesDesk } from "@/features/admin/components/BusinessesDesk";
import { BUSINESS_TABS, onBusinessTab, type BusinessTab } from "@/features/admin/components/businesses-tabs";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminBusinesses, findAdminDashboard } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Businesses — DanceOS admin" };

/** /admin/businesses — every studio and artist page as a DESK (11 Sep 2026):
 *  the figures, a tab per kind and per visibility with its count, a search, one
 *  page — and the switch that takes ONE of them off Discover without touching
 *  the rest of its organization. */
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const { supabase, badges } = await requireAdmin();
  const params = await searchParams;
  const term = params.q?.trim().slice(0, 80) ?? "";
  const tab: BusinessTab = BUSINESS_TABS.includes(params.tab as BusinessTab) ? (params.tab as BusinessTab) : "all";
  const page = pageOf(params.page);

  const [pulse, all] = await Promise.all([findAdminDashboard(supabase), findAdminBusinesses(supabase, { q: term || null, limit: 500 })]);
  const matching = all.filter((b) => onBusinessTab(b, tab));

  return (
    <AdminShell badges={badges}>
      <BusinessesDesk
        businesses={sliceForPage(matching, page, PAGE_SIZE)}
        q={term}
        tab={tab}
        counts={{
          all: pulse.businesses.studios + pulse.businesses.artistPages,
          studios: pulse.businesses.studios,
          artists: pulse.businesses.artistPages,
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
