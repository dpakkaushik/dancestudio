"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideStudioVerification } from "@/repositories/studioVerification";

/** THE ANSWER, ABOUT A STUDIO (11 Sep 2026). Approving is the BADGE only —
 *  `tenants.verified_at` — and the studio still subscribes to reach Discover,
 *  which is the order the user asked for. Rejecting carries the reason the
 *  owner reads. The RPC re-checks `is_platform_admin()` itself. */
const studioSchema = z.object({
  tenantId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(300, "A note is at most 300 characters").optional().nullable(),
});

export async function decideStudioVerificationAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = studioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check that request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await decideStudioVerification(supabase, {
      tenantId: parsed.data.tenantId,
      approve: parsed.data.approve,
      note: parsed.data.note ?? null,
    });
    revalidatePath("/admin/verifications");
    revalidatePath("/discover");
    revalidatePath("/business");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not record that decision" };
  }
}

