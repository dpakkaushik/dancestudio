"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportContent } from "@/repositories/adminPanel";

/** Reporting, the user's side (10 Sep 2026). Anybody signed in may say that
 *  one thing is wrong with one other thing, and the reasons are a closed list
 *  so the queue can be read at a glance.
 *
 *  The RPC refuses yourself, a suspended caller, a subject that is not there,
 *  and a second open report on the same thing — each in a sentence this action
 *  passes straight through, because "you have already reported this, an admin
 *  is looking at it" is the honest answer and not an error to hide. */

const schema = z.object({
  subjectKind: z.enum(["tenant", "profile", "crew", "event", "class"]),
  subjectId: z.string().uuid(),
  reason: z.enum(["impersonation", "not_a_real_business", "stolen_content", "offensive", "spam", "unsafe", "other"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function reportContentAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a reason" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await reportContent(supabase, {
      subjectKind: parsed.data.subjectKind,
      subjectId: parsed.data.subjectId,
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send that" };
  }
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { error: null };
}
