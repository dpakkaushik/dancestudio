import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RefundsLedger } from "@/features/settings/components/RefundsLedger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyRefunds } from "@/repositories/refunds";

export const metadata: Metadata = { title: "Refunds — DanceOS" };

/** /refunds — my own refund requests and what became of them (S_refunds, read-only side) */
export default async function RefundsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rows = await findMyRefunds(supabase);
  return <RefundsLedger rows={rows} side="mine" />;
}
