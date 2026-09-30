import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCashfreeRefund, isCashfreeConfigured, refundCashfreePayment, rupeesToPaise } from "@/lib/cashfree/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyRefundUpdate } from "@/repositories/payments";
import { attachSettledRefundReference, findRailPendingRefunds, findUnsentRefunds, type RailRefund, type RefundRailScope } from "@/repositories/refunds";

/** ⚠ MONEY. THE TWO HALVES OF A REFUND THE APP HAD ONLY ONE OF (30 Sep 2026).
 *
 *  A refund row is a PROMISE until Cashfree has been asked to move the money,
 *  and it is a promise KEPT only once Cashfree says it did. This app wrote the
 *  row and, on two of its three paths, did neither of the other things:
 *
 *  ── 1 · SENDING ────────────────────────────────────────────────────────────
 *  `cancel_class_bookings_for_class` (calling a class off) files one `pending`
 *  refund per paid seat — automatic, whatever the clock says — and nothing then
 *  called the rail. The learner's own cancel does (`cancelBookingAction`) and an
 *  approved request does (`decideRefundAction`); the third door wrote the ledger
 *  and stopped. So every refund a call-off filed sat "PROCESSING · awaiting the
 *  rail" for ever, and the only exit the desk offered was "Mark refunded at the
 *  desk" — the studio paying back by hand money the rail was never asked for.
 *  `sendUnsentRefunds` is the missing call, and the delete action makes it.
 *
 *  ── 2 · HEARING ────────────────────────────────────────────────────────────
 *  REFUND_STATUS_WEBHOOK is what closes a `pending` row, and it is registered on
 *  a Cashfree dashboard sub-tab the user owns (NEXT TO DO #8). Until that is
 *  done — and on any day the webhook is late — a refund Cashfree has already
 *  paid still reads "processing" here. `reconcileRailRefunds` asks Cashfree
 *  directly for every pending row that carries a rail reference, and lands the
 *  answer through `apply_refund_update`, the webhook's OWN idempotent applier,
 *  so a webhook that arrives afterwards is a no-op and the two can never
 *  disagree. It runs when a ledger is OPENED, which is the moment the answer
 *  matters and the only moment anybody is looking.
 *
 *  ⚠ THE ADMIN CLIENT IS USED FOR ONE THING: `apply_refund_update` is granted to
 *  the service role alone (it is the webhook's), and the rows it is applied to
 *  are the ones the CALLER's own RLS-scoped read handed back a moment earlier.
 *  A person reconciles their own refunds; a studio's team its studio's. Nobody
 *  reaches a row this way that they could not already see.
 *
 *  ⚠ EVERYTHING HERE DEGRADES TO "THE LEDGER IS AS IT WAS". A rail that is not
 *  configured, a call that fails, a row with no order on the rail — each is
 *  skipped and counted, never thrown: the pages that call this are the ones
 *  somebody is trying to read, and a Cashfree outage must not 500 a ledger. */

export interface RailSendResult {
  /** refunds now with Cashfree, reference attached */
  sent: number;
  /** rows that could not be sent: no order on the rail, another provider, or
   *  the rail switched off — the desk shows them and offers the desk settlement */
  skipped: number;
  /** the rail refused or errored; the row stays `pending` and unsent, so the
   *  desk's "Send through Cashfree" can try again */
  failed: number;
}

const canSend = (r: RailRefund): r is RailRefund & { providerOrderId: string } =>
  r.provider === "cashfree" && r.providerOrderId !== null;

/** send ONE unsent refund to the rail and bind the reference — the caller has
 *  to be somebody `attach_settled_refund_reference` admits (the owner, or the
 *  refunds job on that class), which every caller here is */
export async function sendRefundToRail(supabase: SupabaseClient, r: RailRefund, note: string): Promise<"sent" | "skipped" | "failed"> {
  if (!isCashfreeConfigured() || !canSend(r)) return "skipped";
  try {
    const cf = await refundCashfreePayment({ providerOrderId: r.providerOrderId, refundId: r.id, amountInr: r.amountInr, note });
    await attachSettledRefundReference(supabase, r.id, String(cf.cf_refund_id));
    return "sent";
  } catch {
    return "failed";
  }
}

/** every `pending` refund in scope that has never been sent — the call-off's
 *  rows — pushed to the rail one by one. Sequential on purpose: a studio
 *  calling off a class of twenty is twenty refunds, and twenty parallel POSTs
 *  to a payment gateway is how one gets rate-limited into "failed". */
export async function sendUnsentRefunds(supabase: SupabaseClient, scope: RefundRailScope, note: string): Promise<RailSendResult> {
  const out: RailSendResult = { sent: 0, skipped: 0, failed: 0 };
  let rows: RailRefund[];
  try {
    rows = await findUnsentRefunds(supabase, scope);
  } catch {
    return out;
  }
  for (const r of rows) {
    out[await sendRefundToRail(supabase, r, note)] += 1;
  }
  return out;
}

/** ask Cashfree what became of every `pending` refund in scope that is with it,
 *  and land the terminal ones. Returns how many rows moved. */
export async function reconcileRailRefunds(supabase: SupabaseClient, scope: RefundRailScope): Promise<number> {
  if (!isCashfreeConfigured()) return 0;
  let rows: RailRefund[];
  try {
    rows = await findRailPendingRefunds(supabase, scope);
  } catch {
    return 0;
  }
  const askable = rows.filter((r) => canSend(r) && r.providerPaymentId !== null);
  if (askable.length === 0) return 0;

  const admin = createSupabaseAdminClient();
  let moved = 0;
  /* one call per row, in parallel: these are reads, and a ledger of ten open
     refunds should not take ten round trips' worth of wall clock to open */
  const answers = await Promise.all(
    askable.map(async (r) => {
      try {
        return { r, cf: await fetchCashfreeRefund(r.providerOrderId as string, r.id) };
      } catch {
        return null;
      }
    })
  );
  for (const a of answers) {
    if (!a) continue;
    const terminal = a.cf.refund_status === "SUCCESS" || a.cf.refund_status === "CANCELLED";
    if (!terminal) continue;
    try {
      await applyRefundUpdate(admin, {
        providerPaymentId: a.r.providerPaymentId as string,
        providerRefundId: String(a.cf.cf_refund_id),
        amountPaise: rupeesToPaise(a.cf.refund_amount),
        succeeded: a.cf.refund_status === "SUCCESS",
      });
      moved += 1;
    } catch {
      /* the row stays pending; the next open, or the webhook, gets another go */
    }
  }
  return moved;
}
