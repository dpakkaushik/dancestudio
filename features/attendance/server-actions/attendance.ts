"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkIn, giveSpot, removeFromWaitlist, undoCheckIn } from "@/repositories/attendance";

/** Step 10 register actions — thin Zod-validated wrappers; authorization
 *  (owner/trainer of the tenant, the clock's check-in window, capacity under
 *  the class lock) lives in the RPCs. */

const idSchema = z.object({ enrollmentId: z.string().uuid() });

export interface RegisterActionResult {
  error: string | null;
}

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

function revalidateRegisterSurfaces() {
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/classes");
  revalidatePath("/my-classes");
  revalidatePath("/");
}

type RegisterOp = (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  enrollmentId: string
) => Promise<void>;

async function runRegisterOp(op: RegisterOp, input: { enrollmentId: string }): Promise<RegisterActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid booking" };
  }
  const supabase = await requireUser();
  try {
    await op(supabase, parsed.data.enrollmentId);
    revalidateRegisterSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not update the register" };
  }
}

export async function checkInAction(input: { enrollmentId: string }): Promise<RegisterActionResult> {
  return runRegisterOp(checkIn, input);
}

export async function undoCheckInAction(input: { enrollmentId: string }): Promise<RegisterActionResult> {
  return runRegisterOp(undoCheckIn, input);
}

export async function giveSpotAction(input: { enrollmentId: string }): Promise<RegisterActionResult> {
  return runRegisterOp(giveSpot, input);
}

export async function removeFromWaitlistAction(input: {
  enrollmentId: string;
}): Promise<RegisterActionResult> {
  return runRegisterOp(removeFromWaitlist, input);
}
