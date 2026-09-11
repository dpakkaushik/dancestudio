import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PAGE_SIZE, pageOf } from "@/features/admin/components/desk-kit";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { VerificationDesk, type VerificationTab } from "@/features/admin/components/VerificationDesk";
import { countVerification, findOrganizationsPage, findVerificationRequestsPage } from "@/repositories/admin";
import { findProofPhotosFor } from "@/repositories/orgStanding";
import type { ProofPhoto } from "@/lib/media/proof";

export const metadata: Metadata = { title: "Verification queue — DanceOS" };

const TABS: ReadonlyArray<VerificationTab> = ["pending", "approved", "rejected", "all"];

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
    tab === "pending" || tab === "rejected"
      ? findVerificationRequestsPage(supabase, { status: tab, q: q || null, page, pageSize: PAGE_SIZE })
      : findOrganizationsPage(supabase, { verified: tab === "approved" ? true : undefined, q: q || null, page, pageSize: PAGE_SIZE }),
  ]);

  const requests = tab === "pending" || tab === "rejected" ? (listed.rows as Awaited<ReturnType<typeof findVerificationRequestsPage>>["rows"]) : [];
  const orgs = tab === "approved" || tab === "all" ? (listed.rows as Awaited<ReturnType<typeof findOrganizationsPage>>["rows"]) : [];

  /* the evidence for THIS PAGE of the queue only, signed for this admin's own
     session (R16) — one batch of signatures per organization, not one per photo,
     and never for organizations the admin is not looking at */
  const proof: Record<string, ProofPhoto[]> = {};
  if (tab === "pending") {
    await Promise.all(
      requests.map(async (r) => {
        proof[r.orgId] = await findProofPhotosFor(supabase, r.orgId).catch(() => []);
      })
    );
  }

  return (
    <AdminShell badges={badges}>
      <VerificationDesk tab={tab} q={q} page={page} counts={counts} requests={requests} orgs={orgs} total={listed.total} proof={proof} nowIso={nowIso} />
    </AdminShell>
  );
}
