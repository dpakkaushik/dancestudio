"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isRazorpayConfigured, refundRazorpayPayment } from "@/lib/razorpay/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  attachSettledRefundReference,
  decideRefund,
  settleRefundOffline,
} from "@/repositories/refunds";

/** ⚠ Money. The studio's answer to a refund request (prototype S_class
 *  12247-12262: Approve · Decline · Mark refunded · Reopen).
 *
 *  Approving is the only one that touches the rail, and it does so the way
 *  cancelBookingAction already does: the row moves to 'pending' first, then the
 *  API call fires. If the call fails, or no keys are configured, the row stays
 *  'pending' and stays on the queue — ledgered rather than lost. Razorpay's
 *  refund.processed webhook is what finally closes it (Step 9's rails), so this
 *  action never claims the money has landed. */

export interface RefundActionResult {
  message: string | null;
  error: string | null;
}

const decideSchema = z.object({
  refundId: z.string().uuid(),
  decision: z.enum(["approve", "decline", "reopen"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const offlineSchema = z.object({
  refundId: z.string().uuid(),
  note: z.string().trim().max(500).optional().nullable(),
});

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return supabase;
}

function revalidateRefundSurfaces() {
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/my-classes");
  revalidatePath("/");
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export async function decideRefundAction(input: {
  refundId: string;
  decision: "approve" | "decline" | "reopen";
  note?: string | null;
}): Promise<RefundActionResult> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) {
    return { message: null, error: "Invalid decision" };
  }
  const supabase = await requireUser();
  try {
    const decided = await decideRefund(
      supabase,
      parsed.data.refundId,
      parsed.data.decision,
      parsed.data.note
    );
    revalidateRefundSurfaces();

    if (parsed.data.decision === "decline") {
      return { message: "Declined — they can see the decision", error: null };
    }
    if (parsed.data.decision === "reopen") {
      return { message: "Reopened — it is back on the queue", error: null };
    }

    // approved: the money is due, so send it
    if (!decided.razorpayPaymentId || decided.alreadyAttached) {
      return { message: `Approved — ${rupees(decided.amountInr)} is queued`, error: null };
    }
    if (!isRazorpayConfigured()) {
      return {
        message: `Approved — ${rupees(decided.amountInr)} is queued (payments aren't switched on yet)`,
        error: null,
      };
    }
    try {
      const rzp = await refundRazorpayPayment(decided.razorpayPaymentId);
      await attachSettledRefundReference(supabase, decided.id, rzp.id);
      return { message: `Approved — ${rupees(decided.amountInr)} is on its way back`, error: null };
    } catch {
      // the row is already 'pending' and still on the queue, which is the point
      return { message: `Approved — ${rupees(decided.amountInr)} is queued`, error: null };
    }
  } catch (error: unknown) {
    return {
      message: null,
      error: error instanceof Error ? error.message : "Could not settle that refund",
    };
  }
}

export async function settleRefundOfflineAction(input: {
  refundId: string;
  note?: string | null;
}): Promise<RefundActionResult> {
  const parsed = offlineSchema.safeParse(input);
  if (!parsed.success) {
    return { message: null, error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await settleRefundOffline(supabase, parsed.data.refundId, parsed.data.note);
    revalidateRefundSurfaces();
    return { message: "Marked refunded — settled by hand, not through the rail", error: null };
  } catch (error: unknown) {
    return {
      message: null,
      error: error instanceof Error ? error.message : "Could not mark that refunded",
    };
  }
}
