import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { PlansDesk } from "@/features/admin/components/PlansDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminPlanCatalog } from "@/repositories/plans";

export const metadata: Metadata = { title: "Plans — DanceOS admin" };

/** /admin/plans — the price list (10 Sep 2026). What DanceOS charges a user for
 *  the Artist plan and an organization for each studio, editable here and
 *  nowhere else; every change is audited with the old and new number. */
export default async function AdminPlansPage() {
  const { supabase, badges } = await requireAdmin();
  const plans = await findAdminPlanCatalog(supabase);
  return (
    <AdminShell badges={badges}>
      <PlansDesk plans={plans} />
    </AdminShell>
  );
}
