"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimPerson, respondToClaim, setClaimPowers, withdrawClaim } from "@/repositories/claims";

/** Step 11 people actions. Consent is the whole point: the studio ASKS (only
 *  its own team, owner/trainer only) and the person asked is the only one who
 *  can answer — both enforced in the RPCs, not here. */

export interface ClaimActionResult {
  error: string | null;
}

const askSchema = z.object({
  classId: z.string().uuid(),
  userId: z.string().uuid(),
  kind: z.enum(["artist", "assistant"]),
  canAttendance: z.boolean().optional(),
  canRefunds: z.boolean().optional(),
});

const respondSchema = z.object({
  claimId: z.string().uuid(),
  accept: z.boolean(),
});

const claimIdSchema = z.object({ claimId: z.string().uuid() });

const powersSchema = z.object({
  claimId: z.string().uuid(),
  canAttendance: z.boolean(),
  canRefunds: z.boolean(),
});

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

function revalidatePeopleSurfaces() {
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/classes");
  revalidatePath("/");
}

export async function claimPersonAction(input: {
  classId: string;
  userId: string;
  kind: "artist" | "assistant";
  canAttendance?: boolean;
  canRefunds?: boolean;
}): Promise<ClaimActionResult> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await claimPerson(supabase, parsed.data);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not ask them" };
  }
}

export async function respondToClaimAction(input: {
  claimId: string;
  accept: boolean;
}): Promise<ClaimActionResult> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid response" };
  }
  const supabase = await requireUser();
  try {
    await respondToClaim(supabase, parsed.data.claimId, parsed.data.accept);
    revalidatePeopleSurfaces();
    revalidatePath("/profile");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
}

export async function withdrawClaimAction(input: { claimId: string }): Promise<ClaimActionResult> {
  const parsed = claimIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await withdrawClaim(supabase, parsed.data.claimId);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not take them off" };
  }
}

export async function setClaimPowersAction(input: {
  claimId: string;
  canAttendance: boolean;
  canRefunds: boolean;
}): Promise<ClaimActionResult> {
  const parsed = powersSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await setClaimPowers(
      supabase,
      parsed.data.claimId,
      parsed.data.canAttendance,
      parsed.data.canRefunds
    );
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change the job" };
  }
}
