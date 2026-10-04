import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enquiry, EnquiryEnding, EnquiryQuote, EnquiryStatus, EnquiryTypeKey, QuoteKind, QuoteStatus } from "@/types/enquiry";
import type { BusinessType } from "@/types/business";

/** Step 18 reads and the RPC wrappers. Both ends of an enquiry read it under
 *  RLS — the sender and the business's members — and every "mine" query says
 *  whose rows it wants out loud (RLS is a ceiling, not a scope: a member who
 *  also sent an enquiry to another studio reads both sets). */

const MAX_LIST = 300;

interface ItemRow {
  sort: number;
  name: string;
  qty: number;
  unit_inr: number;
  line_inr: number;
  deleted_at: string | null;
}

interface QuoteRow {
  id: string;
  n: number;
  kind: QuoteKind;
  cost_inr: number;
  advance_pct: number;
  advance_inr: number;
  status: QuoteStatus;
  advance_paid_at: string | null;
  full_paid_at: string | null;
  balance_paid_inr: number | null;
  revision_asked_at: string | null;
  valid_until: string | null;
  note: string | null;
  answer_reason: string | null;
  answered_at: string | null;
  revises: string | null;
  created_at: string;
  deleted_at: string | null;
  enquiry_quote_items: ItemRow[] | null;
}

interface EndingRow {
  id: string;
  outcome: EnquiryEnding["outcome"];
  side: EnquiryEnding["side"];
  refund_inr: number;
  reason: string;
  status: EnquiryEnding["status"];
  counter_of: string | null;
  answer_reason: string | null;
  refund_online_inr: number | null;
  refund_hand_inr: number | null;
  created_at: string;
  answered_at: string | null;
  deleted_at: string | null;
}

interface EnquiryRow {
  id: string;
  business_id: string | null;
  crew_id: string | null;
  from_user_id: string;
  type_key: EnquiryTypeKey;
  fields: unknown;
  dates: string[] | null;
  where_text: string | null;
  message: string;
  mobile: string | null;
  status: EnquiryStatus;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  complete_asked_side: "sender" | "business" | null;
  complete_asked_at: string | null;
  created_at: string;
  businesses: { name: string; type: BusinessType; phone: string | null; profile_photo_path: string | null } | null;
  crews: { name: string; photo: string | null } | null;
  profiles: { full_name: string; profile_photo_path: string | null } | null;
  enquiry_quotes: QuoteRow[] | null;
  enquiry_endings: EndingRow[] | null;
}

/* an enquiry names a business OR a crew (18 Sep 2026): both embeds ride along and
   exactly one comes back non-null */
const ENQUIRY_SELECT =
  "id, business_id, crew_id, from_user_id, type_key, fields, dates, where_text, message, mobile, status, closed_at, closed_by, close_reason, complete_asked_side, complete_asked_at, created_at, businesses (name, type, phone, profile_photo_path), crews (name, photo), profiles (full_name, profile_photo_path), enquiry_quotes (id, n, kind, cost_inr, advance_pct, advance_inr, status, advance_paid_at, full_paid_at, balance_paid_inr, revision_asked_at, valid_until, note, answer_reason, answered_at, revises, created_at, deleted_at, enquiry_quote_items (sort, name, qty, unit_inr, line_inr, deleted_at)), enquiry_endings (id, outcome, side, refund_inr, reason, status, counter_of, answer_reason, refund_online_inr, refund_hand_inr, created_at, answered_at, deleted_at)";

const toQuote = (q: QuoteRow): EnquiryQuote => ({
  id: q.id,
  n: q.n,
  kind: q.kind ?? "quote",
  costInr: q.cost_inr,
  advancePct: q.advance_pct,
  advanceInr: q.advance_inr,
  status: q.status,
  advancePaidAt: q.advance_paid_at,
  fullPaidAt: q.full_paid_at,
  balancePaidInr: q.balance_paid_inr ?? null,
  revisionAskedAt: q.revision_asked_at,
  validUntil: q.valid_until ?? null,
  note: q.note ?? null,
  answerReason: q.answer_reason ?? null,
  answeredAt: q.answered_at ?? null,
  revises: q.revises ?? null,
  items: (q.enquiry_quote_items ?? [])
    .filter((i) => !i.deleted_at)
    .map((i) => ({ sort: i.sort, name: i.name, qty: i.qty, unitInr: i.unit_inr, lineInr: i.line_inr }))
    .sort((a, b) => a.sort - b.sort),
  createdAt: q.created_at,
});

const toEnding = (x: EndingRow): EnquiryEnding => ({
  id: x.id,
  outcome: x.outcome,
  side: x.side,
  refundInr: x.refund_inr,
  reason: x.reason,
  status: x.status,
  counterOf: x.counter_of,
  answerReason: x.answer_reason,
  refundOnlineInr: x.refund_online_inr,
  refundHandInr: x.refund_hand_inr,
  createdAt: x.created_at,
  answeredAt: x.answered_at,
});

const toFields = (raw: unknown): Array<[string, string]> =>
  Array.isArray(raw)
    ? raw
        .filter((p): p is [unknown, unknown] => Array.isArray(p) && p.length >= 2)
        .map(([k, v]) => [String(k), String(v)] as [string, string])
    : [];

const toEnquiry = (r: EnquiryRow): Enquiry => ({
  id: r.id,
  businessId: r.business_id ?? "",
  /* who was asked, in words: a crew's enquiry carries the crew's name where a
     business's carries the business's, so every desk prints one field */
  businessName: r.crew_id ? (r.crews?.name ?? "A crew") : (r.businesses?.name ?? "A business"),
  businessType: r.businesses?.type ?? "studio",
  /* under the policy that already let this join read the name — the same number
     the business's public page prints, not a private one (I4). A crew has none. */
  businessPhone: r.businesses?.phone ?? null,
  crewId: r.crew_id,
  fromUserId: r.from_user_id,
  fromName: r.profiles?.full_name ?? "Someone",
  fromPhotoPath: r.profiles?.profile_photo_path ?? null,
  toPhotoPath: r.crew_id ? (r.crews?.photo ?? null) : (r.businesses?.profile_photo_path ?? null),
  typeKey: r.type_key,
  fields: toFields(r.fields),
  dates: r.dates ?? [],
  whereText: r.where_text,
  message: r.message,
  mobile: r.mobile,
  status: r.status,
  closedAt: r.closed_at,
  closedBy: r.closed_by,
  closeReason: r.close_reason ?? null,
  completeAskedSide: r.complete_asked_side ?? null,
  completeAskedAt: r.complete_asked_at ?? null,
  createdAt: r.created_at,
  quotes: (r.enquiry_quotes ?? [])
    .filter((q) => !q.deleted_at)
    .map(toQuote)
    .sort((a, b) => a.n - b.n),
  endings: (r.enquiry_endings ?? [])
    .filter((x) => !x.deleted_at)
    .map(toEnding)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
});

/** Enquiries that came IN to the businesses I belong to. */
export async function findReceivedEnquiries(supabase: SupabaseClient, businessIds: string[]): Promise<Enquiry[]> {
  if (businessIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_SELECT)
    .in("business_id", businessIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`enquiries.findReceived failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as EnquiryRow[]).map(toEnquiry);
}

/* ⚠ `findReceivedEnquiriesForCrews` is gone (4 Oct 2026, the user: "remove
   enquiries for crew") — a crew takes none, and `send_enquiry` refuses one */

/** Enquiries I SENT — the other end of the same desk. */
export async function findSentEnquiries(supabase: SupabaseClient, userId: string): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_SELECT)
    .eq("from_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`enquiries.findSent failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as EnquiryRow[]).map(toEnquiry);
}

/** One enquiry, as the caller may see it — null when RLS says no. */
export async function findEnquiryById(supabase: SupabaseClient, enquiryId: string): Promise<Enquiry | null> {
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_SELECT)
    .eq("id", enquiryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`enquiries.findById failed: ${error.message}`);
  }
  return data ? toEnquiry(data as unknown as EnquiryRow) : null;
}

export async function sendEnquiry(
  supabase: SupabaseClient,
  input: {
    /** the business asked — a studio or an artist page. ⚠ Never a crew since
     *  4 Oct 2026: `send_enquiry` refuses `p_crew_id`, so it is not sent */
    businessId: string;
    typeKey: EnquiryTypeKey;
    fields: Array<[string, string]>;
    dates: string[];
    whereText: string | null;
    message: string;
    mobile: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("send_enquiry", {
    p_business_id: input.businessId,
    p_type_key: input.typeKey,
    p_fields: input.fields,
    p_dates: input.dates,
    p_where: input.whereText,
    p_message: input.message,
    p_mobile: input.mobile,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

/** a line as the composer sends it */
export interface QuoteLineInput {
  name: string;
  qty: number;
  unitInr: number;
}

const toLines = (items: QuoteLineInput[] | null) =>
  items && items.length ? items.map((i) => ({ name: i.name, qty: i.qty, unit_inr: i.unitInr })) : null;

async function rpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/** step 2 — the business accepts the enquiry, or declines it with a reason */
export async function respondToEnquiry(supabase: SupabaseClient, enquiryId: string, accept: boolean, reason: string | null): Promise<void> {
  await rpc(supabase, "respond_to_enquiry", { p_enquiry_id: enquiryId, p_accept: accept, p_reason: reason });
}

/** step 3 — a quote: lines or one total, the advance, the last day it stands */
export async function sendEnquiryQuote(
  supabase: SupabaseClient,
  input: { enquiryId: string; items: QuoteLineInput[] | null; lumpInr: number | null; advancePct: number; validUntil: string | null; note: string | null }
): Promise<void> {
  await rpc(supabase, "send_enquiry_quote", {
    p_enquiry_id: input.enquiryId,
    p_items: toLines(input.items),
    p_lump_inr: input.items && input.items.length ? null : input.lumpInr,
    p_advance_pct: input.advancePct,
    p_valid_until: input.validUntil,
    p_note: input.note,
  });
}

/** step 5 — something added to a project already on (negative = a reduction) */
export async function sendEnquiryAddition(
  supabase: SupabaseClient,
  input: { enquiryId: string; items: QuoteLineInput[] | null; lumpInr: number | null; note: string | null; revises: string | null }
): Promise<void> {
  await rpc(supabase, "send_enquiry_addition", {
    p_enquiry_id: input.enquiryId,
    p_items: toLines(input.items),
    p_lump_inr: input.items && input.items.length ? null : input.lumpInr,
    p_note: input.note,
    p_revises: input.revises,
  });
}

export async function cancelEnquiryAddition(supabase: SupabaseClient, quoteId: string): Promise<void> {
  await rpc(supabase, "cancel_enquiry_addition", { p_quote_id: quoteId });
}

/** step 4 — the sender: a quote is accepted or a revision asked; an addition accepted or declined */
export async function answerEnquiryQuote(
  supabase: SupabaseClient,
  quoteId: string,
  answer: "accept" | "revise" | "decline",
  reason: string | null
): Promise<void> {
  await rpc(supabase, "answer_enquiry_quote", { p_quote_id: quoteId, p_answer: answer, p_reason: reason });
}

/** step 6 — either side marks it complete; the other's mark closes it */
export async function markEnquiryComplete(supabase: SupabaseClient, enquiryId: string): Promise<void> {
  await rpc(supabase, "mark_enquiry_complete", { p_enquiry_id: enquiryId });
}

export async function declineEnquiryCompletion(supabase: SupabaseClient, enquiryId: string, reason: string | null): Promise<void> {
  await rpc(supabase, "decline_enquiry_completion", { p_enquiry_id: enquiryId, p_reason: reason });
}

/** withdraw (the sender) or call off (the business); after money, a refund proposal */
export async function endEnquiry(supabase: SupabaseClient, enquiryId: string, reason: string, refundInr: number | null): Promise<{ closed: boolean }> {
  const out = (await rpc(supabase, "end_enquiry", { p_enquiry_id: enquiryId, p_reason: reason, p_refund_inr: refundInr })) as { closed?: boolean } | null;
  return { closed: Boolean(out?.closed) };
}

export async function answerEnquiryEnding(
  supabase: SupabaseClient,
  endingId: string,
  answer: "accept" | "counter" | "refuse",
  refundInr: number | null,
  reason: string | null
): Promise<{ closed: boolean; refundOnlineInr: number }> {
  const out = (await rpc(supabase, "answer_enquiry_ending", {
    p_ending_id: endingId,
    p_answer: answer,
    p_refund_inr: refundInr,
    p_reason: reason,
  })) as { closed?: boolean; refund_online_inr?: number } | null;
  return { closed: Boolean(out?.closed), refundOnlineInr: out?.refund_online_inr ?? 0 };
}

export async function retractEnquiryEnding(supabase: SupabaseClient, endingId: string): Promise<void> {
  await rpc(supabase, "retract_enquiry_ending", { p_ending_id: endingId });
}

/** money received outside DanceOS — the business records it */
export async function recordEnquiryPayment(
  supabase: SupabaseClient,
  quoteId: string,
  part: "advance" | "balance" | "full" | "addition"
): Promise<void> {
  await rpc(supabase, "record_enquiry_payment", { p_quote_id: quoteId, p_part: part });
}

/** ⚠ status words still used to type a few legacy reads */
export type { EnquiryStatus };
