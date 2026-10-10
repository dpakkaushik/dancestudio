import { isCashfreeConfigured } from "@/lib/cashfree/api";
import { fetchCashfreeSubscriptionRefund } from "@/lib/cashfree/subscriptions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** ⚠ MONEY. A FIRST-MONTH REFUND IS "REFUNDED" ONLY WHEN CASHFREE SAYS SO
 *  (10 Oct 2026, the user: "Check with Cashfree").
 *
 *  `admin_record_first_period_refund` files a PENDING `subscription_refunds`
 *  row the moment Cashfree accepts the refund, and the payment stays captured.
 *  This asks Cashfree for every pending one in scope and lands the terminal
 *  answer through `apply_subscription_refund_update` — the service role's
 *  alone, idempotent, so asking twice moves nothing twice. It runs when the
 *  admin's money desk or the payer's invoices are OPENED, which is the moment
 *  the answer matters (the class refunds' `reconcileRailRefunds` rule).
 *
 *  ⚠ THE SCOPE IS STATED: `mine` is the payer's own rows only, `all` is the
 *  admin's desk — and the caller of `all` is a page behind `requireAdmin()`.
 *  The service role is the hand that reads and applies; it never widens what
 *  a page draws, because what is DRAWN is read again with the caller's client.
 *
 *  ⚠ EVERYTHING DEGRADES TO "AS IT WAS": the rail switched off, a call that
 *  fails, an unknown status — each is skipped. A ledger must not 500 over
 *  Cashfree. */

export type SubscriptionRefundScope = { mine: string } | "all";

interface PendingRow {
  id: string;
  provider_refund_id: string;
  subscriptions: { provider_subscription_id: string | null } | null;
}

export async function reconcileSubscriptionRefunds(scope: SubscriptionRefundScope): Promise<number> {
  if (!isCashfreeConfigured()) return 0;
  let rows: PendingRow[];
  const admin = createSupabaseAdminClient();
  try {
    let query = admin
      .from("subscription_refunds")
      .select("id, provider_refund_id, subscriptions (provider_subscription_id)")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50);
    if (scope !== "all") query = query.eq("user_id", scope.mine);
    /* audit-ok: scoped — `user_id` for a payer, every row for the admin's desk */
    const { data, error } = await query;
    if (error) return 0;
    rows = (data ?? []) as unknown as PendingRow[];
  } catch {
    return 0;
  }
  let moved = 0;
  const answers = await Promise.all(
    rows.map(async (r) => {
      const psid = r.subscriptions?.provider_subscription_id;
      if (!psid) return null;
      try {
        return { r, cf: await fetchCashfreeSubscriptionRefund(psid, r.provider_refund_id) };
      } catch {
        return null;
      }
    })
  );
  for (const a of answers) {
    if (!a) continue;
    const s = (a.cf.refund_status ?? "").toUpperCase();
    const succeeded = s === "SUCCESS";
    const failed = s === "FAILED" || s === "CANCELLED" || s === "REJECTED";
    if (!succeeded && !failed) continue;
    const { error } = await admin.rpc("apply_subscription_refund_update", {
      p_provider_refund_id: a.r.provider_refund_id,
      p_succeeded: succeeded,
    });
    if (!error) moved += 1;
  }
  return moved;
}
