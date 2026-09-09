"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideReport, setTenantVisibility } from "@/repositories/adminPanel";

/** Phase 2's two admin decisions (10 Sep 2026). ⚠ Rule 9: both RPCs check
 *  `is_platform_admin()` themselves, tell the person affected in words they
 *  read back, and write to the audit log.
 *
 *  Taking ONE business off Discover is the switch that was missing: until now
 *  the only lever was revoking a whole organization's verification, which
 *  unlists every studio it runs in order to deal with one. */

const visibilitySchema = z
  .object({
    tenantId: z.string().uuid(),
    visibility: z.enum(["listed", "unlisted"]),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.visibility === "listed" || (v.reason ?? "").trim().length >= 3, {
    message: "Say why in a sentence — the owner reads it",
    path: ["reason"],
  });

const reportSchema = z.object({
  reportId: z.string().uuid(),
  actioned: z.boolean(),
  note: z.string().trim().max(500).nullable().optional(),
});

const refresh = () => {
  revalidatePath("/admin");
  revalidatePath("/admin/businesses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/audit");
  revalidatePath("/discover");
};

export async function setTenantVisibilityAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await setTenantVisibility(supabase, parsed.data.tenantId, parsed.data.visibility, parsed.data.reason ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change that" };
  }
  refresh();
  return { error: null };
}

export async function decideReportAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await decideReport(supabase, parsed.data.reportId, parsed.data.actioned, parsed.data.note ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that report" };
  }
  refresh();
  return { error: null };
}
