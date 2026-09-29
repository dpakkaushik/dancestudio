import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InvoicesScreen } from "@/features/settings/components/InvoicesScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantInvoices } from "@/repositories/invoices";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

export const metadata: Metadata = { title: "Invoices — DanceOS" };

/** /business/{id}/invoices — what the business collected (members, by RLS) */
export default async function TenantInvoicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  /* ⚠ THE SEAT HAS TO RUN THE BUSINESS (28 Sep 2026). This read "members, by
     RLS" — so a visiting teacher who had accepted one class could open a
     studio's whole invoice ledger by typing the address. */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) redirect("/business");
  const rows = await findTenantInvoices(supabase, businessId);
  return <InvoicesScreen rows={rows} side="tenant" />;
}
