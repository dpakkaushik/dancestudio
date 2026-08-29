import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InvoicesScreen } from "@/features/settings/components/InvoicesScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantInvoices } from "@/repositories/invoices";
import { findMyTenants } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Invoices — DanceOS" };

/** /business/{id}/invoices — what the business collected (members, by RLS) */
export default async function TenantInvoicesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) redirect("/business");
  const rows = await findTenantInvoices(supabase, tenantId);
  return <InvoicesScreen rows={rows} side="tenant" />;
}
