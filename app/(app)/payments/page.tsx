import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentsScreen } from "@/features/settings/components/PaymentsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyInvoices, methodUsesOf } from "@/repositories/invoices";

export const metadata: Metadata = { title: "Payments — DanceOS" };

/** /payments — a person's Payments (S_payments 16531, the dancer's dress: no
 *  Verification tab). YOUR METHODS is how they actually paid, off their own
 *  payments (`user_id = auth.uid()` out loud). */
export default async function PaymentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rows = await findMyInvoices(supabase);
  return <PaymentsScreen side="mine" methods={methodUsesOf(rows)} />;
}
