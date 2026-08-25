"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLead, softDeleteLead, updateLead } from "@/repositories/leads";

/** Step 12 lead actions. Authorization is RLS (any member of the tenant — staff
 *  answer the phone, so staff work the desk); what a lead may say is validated
 *  here. Leads are private business records with no public policy at all. */

export interface LeadActionResult {
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1, "Who is it?").max(120),
  mobile: z.string().trim().max(20).optional().nullable(),
  interest: z.string().trim().max(160).optional().nullable(),
  source: z.enum(["walk_in", "enquiry", "referral", "social"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

const updateSchema = z.object({
  tenantId: z.string().uuid(),
  leadId: z.string().uuid(),
  status: z.enum(["new", "quoted", "trial_booked", "converted", "lost"]).optional(),
  trialClassId: z.string().uuid().nullable().optional(),
  trialOn: z.string().regex(DATE_RE, "Pick a date").nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const deleteSchema = z.object({ tenantId: z.string().uuid(), leadId: z.string().uuid() });

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

const revalidateDesk = (tenantId: string) => revalidatePath(`/business/${tenantId}/students`);

export async function createLeadAction(input: {
  tenantId: string;
  name: string;
  mobile?: string | null;
  interest?: string | null;
  source: string;
  note?: string | null;
}): Promise<LeadActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lead" };
  }
  const supabase = await requireUser();
  try {
    await createLead(supabase, {
      tenantId: parsed.data.tenantId,
      name: parsed.data.name,
      mobile: parsed.data.mobile?.trim() || null,
      interest: parsed.data.interest?.trim() || null,
      source: parsed.data.source,
      note: parsed.data.note?.trim() || null,
    });
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not add the lead" };
  }
}

export async function updateLeadAction(input: {
  tenantId: string;
  leadId: string;
  status?: string;
  trialClassId?: string | null;
  trialOn?: string | null;
  note?: string | null;
}): Promise<LeadActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid change" };
  }
  const supabase = await requireUser();
  const { leadId, tenantId, ...patch } = parsed.data;
  try {
    await updateLead(supabase, leadId, patch);
    revalidateDesk(tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the lead" };
  }
}

export async function deleteLeadAction(input: {
  tenantId: string;
  leadId: string;
}): Promise<LeadActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid lead" };
  }
  const supabase = await requireUser();
  try {
    await softDeleteLead(supabase, parsed.data.leadId);
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove the lead" };
  }
}
