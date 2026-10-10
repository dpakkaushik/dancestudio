"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { restoreAccount, suspendAccount, unsuspendAccount } from "@/repositories/adminPanel";

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

/** PUT BACK AN ACCOUNT THAT LEFT (10 Oct 2026, the user: "Restore button").
 *  ⚠ Rule 9 (auth). `admin_restore_account` decides — a platform admin's alone,
 *  only an account that left through "Delete my account" — and un-deletes the
 *  profile and the artist page the same act closed. THEN the sign-in ban is
 *  lifted with the service role, because a ban lives on the auth account and no
 *  SQL door reaches it. ⚠ If the unban fails the profile is back and the person
 *  still cannot sign in; a second press finds "has not left", so this lifts the
 *  ban on that path too — after asking `is_platform_admin()` as the caller,
 *  since the service role would answer anybody. */
const restoreSchema = z.object({
  accountId: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why in a sentence — they read it").max(300),
});

export async function restoreAccountAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await restoreAccount(supabase, parsed.data.accountId, parsed.data.reason);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not restore that account";
    if (!/has not left/.test(msg)) return { error: msg };
    /* already restored — the ban may be what is left; only an admin may lift it */
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin !== true) return { error: msg };
  }
  try {
    const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(parsed.data.accountId, { ban_duration: "none" });
    if (error) throw new Error(error.message);
  } catch (e) {
    refresh();
    return {
      error: `Their profile is back, but sign-in is still blocked: ${e instanceof Error ? e.message : "the ban could not be lifted"} — press Restore again`,
    };
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
