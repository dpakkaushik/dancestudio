import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PAGE_SIZE, pageOf } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { VerificationDesk, type VerificationTab } from "@/features/admin/components/VerificationDesk";
import { countVerification, findVerificationRequestsPage, findVerifiedStudiosPage } from "@/repositories/admin";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findAdminSubscriptions } from "@/repositories/subscriptions";
import type { ProofPhoto } from "@/lib/media/proof";

export const metadata: Metadata = { title: "Verification queue — DanceOS" };

/* ⚠ "All orgs" LEFT THIS DESK ON 11 Sep 2026 (the user: "org no more needs
   admin verification at all"). A tab listing organizations belonged here only
   while an admin could verify one; now it would be a directory with no lever,
   and the Accounts desk is already the place every account is looked up. */
const TABS: ReadonlyArray<VerificationTab> = ["pending", "approved", "rejected"];

/** /admin/verifications — the queue as a DESK (11 Sep 2026): figures, four
 *  tabs, a search, and ONE PAGE of whichever list is open. Everything is the
 *  URL — `?tab=&q=&page=` — so a view has an address. The guard, and the counts
 *  the nav wears, live in `requireAdmin`: a stranger gets a 404, not a 403. */
export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const tab: VerificationTab = TABS.includes(params.tab as VerificationTab) ? (params.tab as VerificationTab) : "pending";
  const q = params.q?.trim().slice(0, 80) ?? "";
  const page = pageOf(params.page);

  const [counts, listed] = await Promise.all([
    countVerification(supabase),
    tab === "approved"
      ? /* the badge is on STUDIOS (11 Sep 2026): Approved lists the ones wearing it */
        findVerifiedStudiosPage(supabase, { q: q || null, page, pageSize: PAGE_SIZE })
      : findVerificationRequestsPage(supabase, { status: tab, q: q || null, page, pageSize: PAGE_SIZE }),
  ]);

  const requests = tab === "approved" ? [] : (listed.rows as Awaited<ReturnType<typeof findVerificationRequestsPage>>["rows"]);
  const studios = tab === "approved" ? (listed.rows as Awaited<ReturnType<typeof findVerifiedStudiosPage>>["rows"]) : [];

  /* the evidence for THIS PAGE of the queue only, signed for this admin's own
     session (R16) — one batch of signatures per organization, not one per photo,
     and never for organizations the admin is not looking at */
  const proof: Record<string, ProofPhoto[]> = {};
  if (tab === "pending") {
    await Promise.all(
      requests.map(async (r) => {
        /* every request is a studio's now — the reads ask for business_id, so a
           legacy organization row cannot reach this page at all */
        if (r.tenantId) {
          proof[r.tenantId] = await findStudioProofPhotos(supabase, r.tenantId).catch(() => []);
        }
      })
    );
  }

  /* ⚠ WHAT EACH WAITING STUDIO IS ALREADY PAYING (27 Sep 2026). Since
     `20260927100000` the mandate comes BEFORE the review — the user's own order
     — so every studio in this queue may be being charged for something that is
     not on Discover, and rejecting it does not stop that. The desk needs the
     fact to say so. Read only on the Pending tab, and only when there is
     something waiting: one RPC for the whole page rather than one per card. */
  const mandates: Record<string, { subscriptionId: string; priceInr: number; granted: boolean }> = {};
  if (tab === "pending" && requests.length > 0) {
    const ids = new Set(requests.map((r) => r.tenantId).filter(Boolean) as string[]);
    for (const status of ["active", "past_due"] as const) {
      const live = await findAdminSubscriptions(supabase, { status, limit: 500 }).catch(() => []);
      for (const s of live) {
        if (s.tenantId && ids.has(s.tenantId) && !mandates[s.tenantId]) {
          mandates[s.tenantId] = { subscriptionId: s.id, priceInr: s.priceInr, granted: s.granted };
        }
      }
    }
  }

  return (
    <AdminShell badges={badges}>
      <VerificationDesk tab={tab} q={q} page={page} counts={counts} requests={requests} studios={studios} total={listed.total} proof={proof} mandates={mandates} nowIso={nowIso} />
    </AdminShell>
  );
}
