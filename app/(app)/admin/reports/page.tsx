import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { ReportsQueue } from "@/features/admin/components/ReportsQueue";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { countReports, findAdminReports } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Reports — DanceOS admin" };

const STATUSES = ["open", "actioned", "dismissed", "all"];

/** /admin/reports — what people have said is wrong, as a DESK (11 Sep 2026):
 *  the figures, a tab per state with its own count, one page of the list. The
 *  filter is the URL, so a filtered queue has an address one admin can send
 *  another. The RPC pages by limit only, so the page is cut here from the 500
 *  newest — enough for a moderation queue, and the count on the tab is exact
 *  regardless. */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const filter = params.status && STATUSES.includes(params.status) ? params.status : "open";
  const page = pageOf(params.page);
  const [counts, all] = await Promise.all([countReports(supabase), findAdminReports(supabase, { status: filter, limit: 500 })]);
  return (
    <AdminShell badges={badges}>
      <ReportsQueue reports={sliceForPage(all, page, PAGE_SIZE)} status={filter} counts={counts} page={page} total={all.length} nowIso={nowIso} />
    </AdminShell>
  );
}
