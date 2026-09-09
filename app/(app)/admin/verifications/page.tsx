import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { VerificationQueue } from "@/features/admin/components/VerificationQueue";
import { findOrganizations, findVerificationQueue } from "@/repositories/admin";
import { findProofPhotosFor } from "@/repositories/orgStanding";
import type { ProofPhoto } from "@/lib/media/proof";

export const metadata: Metadata = { title: "Verification queue — DanceOS" };

/** /admin/verifications — the queue, now inside the admin panel's own nav
 *  (10 Sep 2026). The guard, and the counts the nav wears, live in
 *  `requireAdmin`: a stranger gets a 404, not a 403. */
export default async function VerificationsPage() {
  const { supabase, badges, nowIso } = await requireAdmin();
  const [queue, orgs] = await Promise.all([findVerificationQueue(supabase), findOrganizations(supabase)]);
  /* the evidence for everything in the queue, signed for THIS admin's session
     (R16) — one batch of signatures per organization, not one per photo */
  const proof: Record<string, ProofPhoto[]> = {};
  await Promise.all(
    queue.map(async (q) => {
      proof[q.orgId] = await findProofPhotosFor(supabase, q.orgId).catch(() => []);
    })
  );
  return (
    <AdminShell badges={badges}>
      <VerificationQueue queue={queue} orgs={orgs} proof={proof} nowIso={nowIso} />
    </AdminShell>
  );
}
