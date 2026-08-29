import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InvoicesScreen } from "@/features/settings/components/InvoicesScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyInvoices } from "@/repositories/invoices";

export const metadata: Metadata = { title: "Invoices — DanceOS" };

/** /invoices — my own payments, as the prototype's S_invoices lists them */
export default async function InvoicesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rows = await findMyInvoices(supabase);
  return <InvoicesScreen rows={rows} side="mine" />;
}
