import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { BusinessesDesk } from "@/features/admin/components/BusinessesDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminBusinesses } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Businesses — DanceOS admin" };

/** /admin/businesses — every studio and artist page, and the switch that takes
 *  ONE of them off Discover without touching the rest of its organization. */
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, badges } = await requireAdmin();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const businesses = await findAdminBusinesses(supabase, { q: term || null, limit: 100 });
  return (
    <AdminShell badges={badges}>
      <BusinessesDesk businesses={businesses} q={term} />
    </AdminShell>
  );
}
