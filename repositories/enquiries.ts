import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enquiry, EnquiryQuote, EnquiryStatus, EnquiryTypeKey, QuoteStatus } from "@/types/enquiry";
import type { TenantType } from "@/types/tenant";

/** Step 18 reads and the RPC wrappers. Both ends of an enquiry read it under
 *  RLS — the sender and the business's members — and every "mine" query says
 *  whose rows it wants out loud (RLS is a ceiling, not a scope: a member who
 *  also sent an enquiry to another studio reads both sets). */

const MAX_LIST = 300;

interface QuoteRow {
  id: string;
  n: number;
  cost_inr: number;
  advance_pct: number;
  advance_inr: number;
  status: QuoteStatus;
  advance_paid_at: string | null;
  full_paid_at: string | null;
  created_at: string;
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
  created_at: string;
  businesses: { name: string; type: TenantType; phone: string | null } | null;
  crews: { name: string } | null;
  profiles: { full_name: string } | null;
  enquiry_quotes: QuoteRow[] | null;
}

/* an enquiry names a business OR a crew (18 Sep 2026): both embeds ride along and
   exactly one comes back non-null */
const ENQUIRY_SELECT =
  "id, business_id, crew_id, from_user_id, type_key, fields, dates, where_text, message, mobile, status, created_at, businesses (name, type, phone), crews (name), profiles (full_name), enquiry_quotes (id, n, cost_inr, advance_pct, advance_inr, status, advance_paid_at, full_paid_at, created_at, deleted_at)";

const toQuote = (q: QuoteRow): EnquiryQuote => ({
  id: q.id,
  n: q.n,
  costInr: q.cost_inr,
  advancePct: q.advance_pct,
  advanceInr: q.advance_inr,
  status: q.status,
  advancePaidAt: q.advance_paid_at,
  fullPaidAt: q.full_paid_at,
  createdAt: q.created_at,
});

const toFields = (raw: unknown): Array<[string, string]> =>
  Array.isArray(raw)
    ? raw
        .filter((p): p is [unknown, unknown] => Array.isArray(p) && p.length >= 2)
        .map(([k, v]) => [String(k), String(v)] as [string, string])
    : [];

const toEnquiry = (r: EnquiryRow): Enquiry => ({
  id: r.id,
  tenantId: r.business_id ?? "",
  /* who was asked, in words: a crew's enquiry carries the crew's name where a
     business's carries the business's, so every desk prints one field */
  tenantName: r.crew_id ? (r.crews?.name ?? "A crew") : (r.businesses?.name ?? "A business"),
  tenantType: r.businesses?.type ?? "studio",
  /* under the policy that already let this join read the name — the same number
     the business's public page prints, not a private one (I4). A crew has none. */
  tenantPhone: r.businesses?.phone ?? null,
  crewId: r.crew_id,
  fromUserId: r.from_user_id,
  fromName: r.profiles?.full_name ?? "Someone",
  typeKey: r.type_key,
  fields: toFields(r.fields),
  dates: r.dates ?? [],
  whereText: r.where_text,
  message: r.message,
  mobile: r.mobile,
  status: r.status,
  createdAt: r.created_at,
  quotes: (r.enquiry_quotes ?? [])
    .filter((q) => !q.deleted_at)
    .map(toQuote)
    .sort((a, b) => a.n - b.n),
});

/** Enquiries that came IN to the businesses I belong to. */
export async function findReceivedEnquiries(supabase: SupabaseClient, tenantIds: string[]): Promise<Enquiry[]> {
  if (tenantIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_SELECT)
    .in("business_id", tenantIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`enquiries.findReceived failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as EnquiryRow[]).map(toEnquiry);
}

/** Enquiries that came IN to the crews I lead (18 Sep 2026) — the crew's Inbox,
 *  and the leader's own. RLS admits the leader; the ids are said out loud anyway. */
export async function findReceivedEnquiriesForCrews(supabase: SupabaseClient, crewIds: string[]): Promise<Enquiry[]> {
  if (crewIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_SELECT)
    .in("crew_id", crewIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`enquiries.findReceivedForCrews failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as EnquiryRow[]).map(toEnquiry);
}

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
    /** the business asked — or null when the enquiry goes to a crew */
    tenantId: string | null;
    /** the crew asked (18 Sep 2026) — exactly one of the two is set; the RPC keeps the same rule */
    crewId?: string | null;
    typeKey: EnquiryTypeKey;
    fields: Array<[string, string]>;
    dates: string[];
    whereText: string | null;
    message: string;
    mobile: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("send_enquiry", {
    p_business_id: input.tenantId,
    p_type_key: input.typeKey,
    p_fields: input.fields,
    p_dates: input.dates,
    p_where: input.whereText,
    p_message: input.message,
    p_mobile: input.mobile,
    p_crew_id: input.crewId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

export async function setEnquiryStatus(supabase: SupabaseClient, enquiryId: string, status: EnquiryStatus): Promise<void> {
  const { error } = await supabase.rpc("set_enquiry_status", { p_enquiry_id: enquiryId, p_status: status });
  if (error) {
    throw new Error(error.message);
  }
}

export async function sendEnquiryQuote(
  supabase: SupabaseClient,
  enquiryId: string,
  costInr: number,
  advancePct: number
): Promise<void> {
  const { error } = await supabase.rpc("send_enquiry_quote", {
    p_enquiry_id: enquiryId,
    p_cost_inr: costInr,
    p_advance_pct: advancePct,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function answerEnquiryQuote(supabase: SupabaseClient, quoteId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("answer_enquiry_quote", { p_quote_id: quoteId, p_accept: accept });
  if (error) {
    throw new Error(error.message);
  }
}

export async function recordEnquiryPayment(
  supabase: SupabaseClient,
  quoteId: string,
  part: "advance" | "balance" | "full"
): Promise<void> {
  const { error } = await supabase.rpc("record_enquiry_payment", { p_quote_id: quoteId, p_part: part });
  if (error) {
    throw new Error(error.message);
  }
}
