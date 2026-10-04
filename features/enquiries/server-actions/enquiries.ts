"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LIMITS, withinLimit } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  answerEnquiryEnding,
  answerEnquiryQuote,
  cancelEnquiryAddition,
  declineEnquiryCompletion,
  endEnquiry,
  markEnquiryComplete,
  recordEnquiryPayment,
  respondToEnquiry,
  retractEnquiryEnding,
  sendEnquiry,
  sendEnquiryAddition,
  sendEnquiryQuote,
} from "@/repositories/enquiries";
import { sendEnquiryRefunds } from "@/services/refundRail";

/** ⚠ money-adjacent. Step 18's writes. The RPCs decide who may do what — the
 *  sender sends and answers, the business's members quote, move and record —
 *  so the actions only validate the shape and pass it on. */

export interface EnquiryActionResult {
  error: string | null;
  enquiryId?: string;
}

/* the three kinds that can be SENT since 4 Oct 2026 — the legacy four are read, never written */
const TYPE_KEYS = ["choreographer", "performer", "judge"] as const;

/* an enquiry goes to a BUSINESS — ⚠ never a crew since 4 Oct 2026 (the user:
   "remove enquiries for crew"); `send_enquiry` refuses one in words */
const sendSchema = z.object({
  businessId: z.string().uuid(),
  typeKey: z.enum(TYPE_KEYS),
  fields: z.array(z.tuple([z.string().max(80), z.string().max(200)])).max(20),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a date")).min(1).max(20),
  whereText: z.string().trim().max(200).nullable(),
  message: z.string().trim().min(1).max(1500),
  mobile: z.string().trim().max(20).nullable(),
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

function revalidateInbox(enquiryId?: string) {
  revalidatePath("/inbox");
  if (enquiryId) {
    revalidatePath(`/inbox/enquiries/${enquiryId}`);
  }
  revalidatePath("/inbox/enquiries/[enquiryId]", "page");
}

export async function sendEnquiryAction(input: z.input<typeof sendSchema>): Promise<EnquiryActionResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the enquiry" };
  }
  const supabase = await requireUser();
  /* ten enquiries an hour (18 Sep 2026): a sincere asker, not a script */
  if (!(await withinLimit(supabase, LIMITS.enquiry))) {
    return { error: LIMITS.enquiry.words };
  }
  try {
    const id = await sendEnquiry(supabase, parsed.data);
    revalidateInbox();
    return { error: null, enquiryId: id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not send that enquiry" };
  }
}

/* ═══ THE ENQUIRY'S STEPS (3 Oct 2026) ═══════════════════════════════════════
   Every rule is the RPC's — who may, in which stage, how much. These validate
   the shape and pass it on; a refusal comes back in the database's words. */

const reason = z.string().trim().max(500);
const line = z.object({
  name: z.string().trim().min(1, "every line needs a name").max(80, "a line's name is up to 80 characters"),
  qty: z.number().int().min(1).max(9999),
  unitInr: z.number().int().min(-10_000_000).max(10_000_000).refine((v) => v !== 0, "every line needs a price"),
});
const lines = z.array(line).max(30, "up to 30 lines");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a date");

async function act(op: (s: Awaited<ReturnType<typeof requireUser>>) => Promise<unknown>, enquiryId: string, fallback: string): Promise<EnquiryActionResult> {
  const supabase = await requireUser();
  try {
    await op(supabase);
    revalidateInbox(enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : fallback };
  }
}

const respondSchema = z.object({ enquiryId: z.string().uuid(), accept: z.boolean(), reason: reason.nullable() });
export async function respondToEnquiryAction(input: z.input<typeof respondSchema>): Promise<EnquiryActionResult> {
  const p = respondSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid request" };
  return act((s) => respondToEnquiry(s, p.data.enquiryId, p.data.accept, p.data.reason || null), p.data.enquiryId, "Could not answer that enquiry");
}

const quoteSchema = z.object({
  enquiryId: z.string().uuid(),
  items: lines.nullable(),
  lumpInr: z.number().int().min(1).max(100_000_000).nullable(),
  advancePct: z.number().int().min(0).max(100),
  validUntil: day.nullable(),
  note: z.string().trim().max(300).nullable(),
});
export async function sendQuoteAction(input: z.input<typeof quoteSchema>): Promise<EnquiryActionResult> {
  const p = quoteSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the quote" };
  return act((s) => sendEnquiryQuote(s, { ...p.data, note: p.data.note || null }), p.data.enquiryId, "Could not send that quote");
}

const additionSchema = z.object({
  enquiryId: z.string().uuid(),
  items: lines.nullable(),
  lumpInr: z.number().int().min(-100_000_000).max(100_000_000).nullable(),
  note: z.string().trim().max(300).nullable(),
  revises: z.string().uuid().nullable(),
});
export async function sendAdditionAction(input: z.input<typeof additionSchema>): Promise<EnquiryActionResult> {
  const p = additionSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the addition" };
  return act((s) => sendEnquiryAddition(s, { ...p.data, note: p.data.note || null }), p.data.enquiryId, "Could not send that addition");
}

const quoteRef = z.object({ quoteId: z.string().uuid(), enquiryId: z.string().uuid() });
export async function cancelAdditionAction(input: z.input<typeof quoteRef>): Promise<EnquiryActionResult> {
  const p = quoteRef.safeParse(input);
  if (!p.success) return { error: "Invalid request" };
  return act((s) => cancelEnquiryAddition(s, p.data.quoteId), p.data.enquiryId, "Could not take that back");
}

const answerSchema = z.object({
  quoteId: z.string().uuid(),
  enquiryId: z.string().uuid(),
  answer: z.enum(["accept", "revise", "decline"]),
  reason: reason.nullable(),
});
export async function answerQuoteAction(input: z.input<typeof answerSchema>): Promise<EnquiryActionResult> {
  const p = answerSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid request" };
  return act((s) => answerEnquiryQuote(s, p.data.quoteId, p.data.answer, p.data.reason || null), p.data.enquiryId, "Could not answer that");
}

const enquiryRef = z.object({ enquiryId: z.string().uuid() });
export async function markCompleteAction(input: z.input<typeof enquiryRef>): Promise<EnquiryActionResult> {
  const p = enquiryRef.safeParse(input);
  if (!p.success) return { error: "Invalid request" };
  return act((s) => markEnquiryComplete(s, p.data.enquiryId), p.data.enquiryId, "Could not mark it complete");
}

const notYetSchema = z.object({ enquiryId: z.string().uuid(), reason: reason.nullable() });
export async function declineCompletionAction(input: z.input<typeof notYetSchema>): Promise<EnquiryActionResult> {
  const p = notYetSchema.safeParse(input);
  if (!p.success) return { error: "Invalid request" };
  return act((s) => declineEnquiryCompletion(s, p.data.enquiryId, p.data.reason || null), p.data.enquiryId, "Could not answer that");
}

const endSchema = z.object({
  enquiryId: z.string().uuid(),
  reason: z.string().trim().min(1, "say why").max(500),
  refundInr: z.number().int().min(0).max(100_000_000).nullable(),
});
export async function endEnquiryAction(input: z.input<typeof endSchema>): Promise<EnquiryActionResult & { closed?: boolean }> {
  const p = endSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid request" };
  const supabase = await requireUser();
  try {
    const out = await endEnquiry(supabase, p.data.enquiryId, p.data.reason, p.data.refundInr);
    revalidateInbox(p.data.enquiryId);
    return { error: null, closed: out.closed };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not end that" };
  }
}

const endingSchema = z.object({
  endingId: z.string().uuid(),
  enquiryId: z.string().uuid(),
  answer: z.enum(["accept", "counter", "refuse"]),
  refundInr: z.number().int().min(0).max(100_000_000).nullable(),
  reason: reason.nullable(),
});
/** ⚠ MONEY: accepting terms files the online refund rows; they are SENT here,
 *  straight after, so a refund is never a promise left lying in the ledger */
export async function answerEndingAction(input: z.input<typeof endingSchema>): Promise<EnquiryActionResult> {
  const p = endingSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid request" };
  const supabase = await requireUser();
  try {
    const out = await answerEnquiryEnding(supabase, p.data.endingId, p.data.answer, p.data.refundInr, p.data.reason || null);
    if (out.closed && out.refundOnlineInr > 0) {
      await sendEnquiryRefunds(supabase, p.data.enquiryId, "DanceOS — agreed refund on an enquiry");
    }
    revalidateInbox(p.data.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer those terms" };
  }
}

const endingRef = z.object({ endingId: z.string().uuid(), enquiryId: z.string().uuid() });
export async function retractEndingAction(input: z.input<typeof endingRef>): Promise<EnquiryActionResult> {
  const p = endingRef.safeParse(input);
  if (!p.success) return { error: "Invalid request" };
  return act((s) => retractEnquiryEnding(s, p.data.endingId), p.data.enquiryId, "Could not take those back");
}

const paymentSchema = z.object({ quoteId: z.string().uuid(), enquiryId: z.string().uuid(), part: z.enum(["advance", "balance", "full", "addition"]) });
export async function recordEnquiryPaymentAction(input: z.input<typeof paymentSchema>): Promise<EnquiryActionResult> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return { error: "Invalid request" };
  return act((s) => recordEnquiryPayment(s, p.data.quoteId, p.data.part), p.data.enquiryId, "Could not record that");
}
