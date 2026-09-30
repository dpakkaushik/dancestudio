import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RefundsLedger } from "@/features/settings/components/RefundsLedger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyRefunds } from "@/repositories/refunds";
import { reconcileRailRefunds } from "@/services/refundRail";

export const metadata: Metadata = { title: "Refunds — DanceOS" };

/** /refunds — my own refund requests and what became of them (S_refunds, read-only side) */
export default async function RefundsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  /* a refund Cashfree has already paid must not read "processing" here because
     a webhook is late or unregistered — the rail is asked first (30 Sep 2026) */
  await reconcileRailRefunds(supabase, { mine: user.id });
  const rows = await findMyRefunds(supabase);
  return <RefundsLedger rows={rows} side="mine" />;
}
