import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import type { Lead, LeadSource, LeadStatus, StudentStats } from "@/types/lead";

/** Leads are a private business record — no public policy exists, so every read
 *  here is already fenced to the caller's own studio. Plain RLS-guarded writes:
 *  a pipeline stage has no cross-row invariant to serialise. */

interface LeadRow {
  id: string;
  business_id: string;
  name: string;
  mobile: string | null;
  interest: string | null;
  source: LeadSource;
  status: LeadStatus;
  trial_class_id: string | null;
  trial_on: string | null;
  note: string | null;
  created_at: string;
  user_id: string | null;
  classes: { style: string; level: string } | null;
  profiles: { profile_photo_path: string | null } | null;
}

const LEAD_COLUMNS =
  "id, business_id, name, mobile, interest, source, status, trial_class_id, trial_on, note, created_at, user_id, classes (style, level), profiles!leads_user_id_fkey (profile_photo_path)";

const toLead = (row: LeadRow): Lead => ({
  id: row.id,
  tenantId: row.business_id,
  name: row.name,
  mobile: row.mobile,
  interest: row.interest,
  source: row.source,
  status: row.status,
  trialClassId: row.trial_class_id,
  trialClassTitle: row.classes ? dosClassLabel(row.classes.style, row.classes.level) : null,
  trialOn: row.trial_on,
  note: row.note,
  createdAt: row.created_at,
  userId: row.user_id ?? null,
  avatarPath: row.profiles?.profile_photo_path ?? null,
});

/** The desk, newest first. Cursor pagination arrives if a studio ever outgrows
 *  200 open leads; until then the whole desk is one screen. */
export async function findLeadsByTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("business_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`leads.findByTenant failed: ${error.message}`);
  }
  return (data as unknown as LeadRow[]).map(toLead);
}

/** WHAT EACH STUDENT HAS ACTUALLY DONE HERE (19 Sep 2026). Two aggregate reads
 *  for the whole desk rather than one pair per row, under the policies Steps 4
 *  and 10 already set: a business's members read its bookings and its register.
 *  ⚠ ATTENDED IS CHECK-INS, not bookings — Step 25's rule, said on the screen. */
export async function findStudentStats(
  supabase: SupabaseClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, StudentStats>> {
  const out = new Map<string, StudentStats>();
  if (userIds.length === 0) return out;
  const ids = [...new Set(userIds)].slice(0, 200);
  const [booked, attended] = await Promise.all([
    supabase.from("class_bookings").select("user_id").eq("business_id", tenantId).in("user_id", ids).is("deleted_at", null).limit(4000),
    supabase.from("attendance").select("user_id").eq("business_id", tenantId).in("user_id", ids).is("deleted_at", null).limit(4000),
  ]);
  const bump = (rows: unknown, key: "booked" | "attended") => {
    for (const r of ((rows ?? []) as Array<{ user_id: string }>)) {
      const cur = out.get(r.user_id) ?? { booked: 0, attended: 0 };
      cur[key] += 1;
      out.set(r.user_id, cur);
    }
  };
  bump(booked.data, "booked");
  bump(attended.data, "attended");
  return out;
}

export interface CreateLeadInput {
  tenantId: string;
  name: string;
  mobile: string | null;
  interest: string | null;
  source: LeadSource;
  note: string | null;
  /** the person this row IS, when they were picked from the people search */
  userId?: string | null;
}

export async function createLead(
  supabase: SupabaseClient,
  input: CreateLeadInput
): Promise<void> {
  const { error } = await supabase.from("leads").insert({
    business_id: input.tenantId,
    name: input.name,
    mobile: input.mobile,
    interest: input.interest,
    source: input.source,
    note: input.note,
    user_id: input.userId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export interface UpdateLeadInput {
  status?: LeadStatus;
  trialClassId?: string | null;
  trialOn?: string | null;
  note?: string | null;
  convertedUserId?: string | null;
}

export async function updateLead(
  supabase: SupabaseClient,
  leadId: string,
  patch: UpdateLeadInput
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.trialClassId !== undefined) row.trial_class_id = patch.trialClassId;
  if (patch.trialOn !== undefined) row.trial_on = patch.trialOn;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.convertedUserId !== undefined) row.converted_user_id = patch.convertedUserId;

  const { data, error } = await supabase
    .from("leads")
    .update(row)
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("Lead not found or not yours to change");
  }
}

/** Soft delete — a lead who asked you not to keep their details still leaves a
 *  row, so the funnel's history stays honest. */
export async function softDeleteLead(supabase: SupabaseClient, leadId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("deleted_at", null);
  if (error) {
    throw new Error(error.message);
  }
}
