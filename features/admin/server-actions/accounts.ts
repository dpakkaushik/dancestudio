"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { suspendAccount, unsuspendAccount } from "@/repositories/adminPanel";

/** Suspension — the reversible sanction that belongs before a delete
 *  (10 Sep 2026). ⚠ Rule 9: both RPCs check `is_platform_admin()` themselves,
 *  refuse another admin and the caller's own account, unlist every studio the
 *  account owns, tell the account why in words it reads back, and write a row
 *  to the audit log. Nothing here can be done quietly. */

const suspendSchema = z.object({
  accountId: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why in a sentence — the account reads it").max(300),
});

const liftSchema = z.object({
  accountId: z.string().uuid(),
  note: z.string().trim().max(300).nullable().optional(),
});

const refresh = () => {
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit");
  revalidatePath("/admin/verifications");
  revalidatePath("/discover");
};

export async function suspendAccountAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await suspendAccount(supabase, parsed.data.accountId, parsed.data.reason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not suspend that account" };
  }
  refresh();
  return { error: null };
}

export async function unsuspendAccountAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = liftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await unsuspendAccount(supabase, parsed.data.accountId, parsed.data.note ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not lift that suspension" };
  }
  refresh();
  return { error: null };
}
