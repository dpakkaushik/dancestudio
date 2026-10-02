"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LIMITS, withinLimit } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  answerEnquiryQuote,
  closeEnquiry,
  recordEnquiryPayment,
  sendEnquiry,
  sendEnquiryQuote,
  setEnquiryStatus,
} from "@/repositories/enquiries";

/** ⚠ money-adjacent. Step 18's writes. The RPCs decide who may do what — the
 *  sender sends and answers, the business's members quote, move and record —
 *  so the actions only validate the shape and pass it on. */

export interface EnquiryActionResult {
  error: string | null;
  enquiryId?: string;
}

const TYPE_KEYS = ["celebration", "corporate", "judge", "private", "collab"] as const;
/* the hand moves left to the business since 3 Oct 2026 — closing is its own door */
const STAGES = ["new", "in_talks"] as const;
const OUTCOMES = ["completed", "lost", "cancelled"] as const;

/* an enquiry goes to a BUSINESS or to a CREW (18 Sep 2026) — exactly one, here
   as in the table's CHECK and the RPC */
const sendSchema = z
  .object({
    businessId: z.string().uuid().nullable(),
    crewId: z.string().uuid().nullable().optional(),
    typeKey: z.enum(TYPE_KEYS),
    fields: z.array(z.tuple([z.string().max(80), z.string().max(200)])).max(20),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a date")).min(1).max(20),
    whereText: z.string().trim().max(200).nullable(),
    message: z.string().trim().min(1).max(1500),
    mobile: z.string().trim().max(20).nullable(),
  })
  .refine((v) => Boolean(v.businessId) !== Boolean(v.crewId), { message: "an enquiry goes to a business or to a crew" });

const statusSchema = z.object({ enquiryId: z.string().uuid(), status: z.enum(STAGES) });
const quoteSchema = z.object({
  enquiryId: z.string().uuid(),
  costInr: z.number().int().min(1).max(100_000_000),
  advancePct: z.number().int().min(0).max(100),
});
const answerSchema = z.object({ quoteId: z.string().uuid(), accept: z.boolean() });
const paymentSchema = z.object({ quoteId: z.string().uuid(), part: z.enum(["advance", "balance", "full"]) });

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

export async function setEnquiryStatusAction(input: { enquiryId: string; status: string }): Promise<EnquiryActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid stage" };
  }
  const supabase = await requireUser();
  try {
    await setEnquiryStatus(supabase, parsed.data.enquiryId, parsed.data.status);
    revalidateInbox(parsed.data.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not move that enquiry" };
  }
}

const closeSchema = z.object({ enquiryId: z.string().uuid(), outcome: z.enum(OUTCOMES) });

/** Close an enquiry from either end (3 Oct 2026). */
export async function closeEnquiryAction(input: { enquiryId: string; outcome: string }): Promise<EnquiryActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await closeEnquiry(supabase, parsed.data.enquiryId, parsed.data.outcome);
    revalidateInbox(parsed.data.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not close that enquiry" };
  }
}

export async function sendQuoteAction(input: { enquiryId: string; costInr: number; advancePct: number }): Promise<EnquiryActionResult> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "The cost must be a whole positive amount and the advance a percentage" };
  }
  const supabase = await requireUser();
  try {
    await sendEnquiryQuote(supabase, parsed.data.enquiryId, parsed.data.costInr, parsed.data.advancePct);
    revalidateInbox(parsed.data.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not send that quote" };
  }
}

export async function answerQuoteAction(input: { quoteId: string; accept: boolean; enquiryId: string }): Promise<EnquiryActionResult> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await answerEnquiryQuote(supabase, parsed.data.quoteId, parsed.data.accept);
    revalidateInbox(input.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer that quote" };
  }
}

export async function recordEnquiryPaymentAction(input: {
  quoteId: string;
  part: "advance" | "balance" | "full";
  enquiryId: string;
}): Promise<EnquiryActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await recordEnquiryPayment(supabase, parsed.data.quoteId, parsed.data.part);
    revalidateInbox(input.enquiryId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not record that" };
  }
}
