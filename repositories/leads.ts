import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";

/** Leads are a private business record — no public policy exists, so every read
 *  here is already fenced to the caller's own studio. Plain RLS-guarded writes:
 *  a pipeline stage has no cross-row invariant to serialise. */

interface LeadRow {
  id: string;
  tenant_id: string;
  name: string;
  mobile: string | null;
  interest: string | null;
  source: LeadSource;
  status: LeadStatus;
  trial_class_id: string | null;
  trial_on: string | null;
  note: string | null;
  created_at: string;
  classes: { title: string } | null;
}

const LEAD_COLUMNS =
  "id, tenant_id, name, mobile, interest, source, status, trial_class_id, trial_on, note, created_at, classes (title)";

const toLead = (row: LeadRow): Lead => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  mobile: row.mobile,
  interest: row.interest,
  source: row.source,
  status: row.status,
  trialClassId: row.trial_class_id,
  trialClassTitle: row.classes?.title ?? null,
  trialOn: row.trial_on,
  note: row.note,
  createdAt: row.created_at,
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
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`leads.findByTenant failed: ${error.message}`);
  }
  return (data as unknown as LeadRow[]).map(toLead);
}

export interface CreateLeadInput {
  tenantId: string;
  name: string;
  mobile: string | null;
  interest: string | null;
  source: LeadSource;
  note: string | null;
}

export async function createLead(
  supabase: SupabaseClient,
  input: CreateLeadInput
): Promise<void> {
  const { error } = await supabase.from("leads").insert({
    tenant_id: input.tenantId,
    name: input.name,
    mobile: input.mobile,
    interest: input.interest,
    source: input.source,
    note: input.note,
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
