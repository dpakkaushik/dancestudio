import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentsScreen } from "@/features/settings/components/PaymentsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantInvoices, methodUsesOf } from "@/repositories/invoices";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Payments & verification — DanceOS" };

/** /business/{id}/payments — Payments & verification (S_payments 16531): how
 *  students paid, the ACCEPTED FROM STUDENTS switches (the owner's to flip,
 *  through the one owner-only door), and the Verification tab reading
 *  `verified_at`. Members read it; the switches move for the owner alone. */
export default async function TenantPaymentsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [role, tenants] = await Promise.all([findMyMembershipRole(supabase, tenantId), findMyTenants(supabase)]);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!role || !tenant) redirect("/business");
  const rows = await findTenantInvoices(supabase, tenantId);
  return <PaymentsScreen side="tenant" methods={methodUsesOf(rows)} tenant={tenant} canEdit={role === "owner"} />;
}
