import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { AdminSupportDesk, SUPPORT_TABS, matchesSupport, onSupportTab, type SupportTab } from "@/features/admin/components/AdminSupportDesk";
import { PAGE_SIZE, pageOf, sliceForPage } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findSupportThreads } from "@/repositories/support";

export const metadata: Metadata = { title: "Support — DanceOS admin" };

/** /admin/support — every conversation on the platform as a DESK (11 Sep 2026):
 *  the ones waiting on a reply first, tabs with their counts, a search, one page.
 *  `support_thread_list` answers every thread in one call and pages nothing, so
 *  the page is cut here; the counts are exact for the same reason. */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const tab: SupportTab = SUPPORT_TABS.includes(params.tab as SupportTab) ? (params.tab as SupportTab) : "waiting";
  const q = params.q?.trim().slice(0, 80) ?? "";
  const page = pageOf(params.page);

  const threads = await findSupportThreads(supabase);
  const counts = {
    waiting: threads.filter((t) => onSupportTab(t, "waiting")).length,
    open: threads.filter((t) => onSupportTab(t, "open")).length,
    closed: threads.filter((t) => onSupportTab(t, "closed")).length,
    all: threads.length,
  };
  const matching = threads.filter((t) => onSupportTab(t, tab) && matchesSupport(t, q));

  return (
    <AdminShell badges={badges}>
      <AdminSupportDesk threads={sliceForPage(matching, page, PAGE_SIZE)} page={page} total={matching.length} tab={tab} q={q} counts={counts} nowIso={nowIso} />
    </AdminShell>
  );
}
