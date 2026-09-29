import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RefundsLedger } from "@/features/settings/components/RefundsLedger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRefundsByTenant } from "@/repositories/refunds";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

export const metadata: Metadata = { title: "Refunds — DanceOS" };

/** /business/{id}/refunds — the business's refund ledger (S_refunds 16621). Every
 *  member reads it (Step 9's RLS); WHO MAY SETTLE is the owner, or a confirmed
 *  classPerson holding the refunds job — the RPCs decide per class, so the buttons are
 *  drawn for the owner and every refusal comes back in the RPC's own words.
 *  `?class=` scopes it to one class, the way deleting a published class lands
 *  here in the prototype (15102). */
export default async function TenantRefundsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ class?: string }> }) {
  const [{ businessId }, { class: focus }] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  /* ⚠ the seat has to RUN the business (28 Sep 2026) — this admitted ANY role,
     so somebody's refund and the reason they asked for it were team-wide reading */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) redirect("/business");
  const role = seat.memberRole;
  const rows = await findRefundsByTenant(supabase, businessId);
  return <RefundsLedger rows={rows} side="tenant" canSettle={role === "owner"} focusClassId={focus && /^[0-9a-f-]{36}$/i.test(focus) ? focus : null} />;
}
