"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askClassPerson, respondToClassAsk, setClassPersonPay, setClassPersonPowers, stepDownFromClass, withdrawClassAsk } from "@/repositories/classPeople";
import { findAssistantPool } from "@/repositories/profiles";

/** Step 11 people actions. Consent is the whole point: the studio ASKS (only
 *  its own team, the people who run it) and the person asked is the only one who
 *  can answer — both enforced in the RPCs, not here. */

export interface ClassPersonActionResult {
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
  classPersonId: z.string().uuid(),
  accept: z.boolean(),
});

const classPersonIdSchema = z.object({ classPersonId: z.string().uuid() });

const powersSchema = z.object({
  classPersonId: z.string().uuid(),
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
  /* Discover's Classes shelf — `/classes` was its second copy until 5 Oct 2026 */
  revalidatePath("/discover");
  revalidatePath("/");
}

export async function askClassPersonAction(input: {
  classId: string;
  userId: string;
  kind: "artist" | "assistant";
  canAttendance?: boolean;
  canRefunds?: boolean;
}): Promise<ClassPersonActionResult> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    /* ⚠ AN ASSISTANT COMES FROM YOUR TEAM OR YOUR CREWS (4 Oct 2026, the user:
       "only people from your own team members or crew members. no one else").
       The picker offers only that list; this is the same list asked again on the
       server, so a hand-made request cannot ask anybody else through the app —
       and since 20261004180000 `ask_class_person` refuses it too, for every door. */
    if (parsed.data.kind === "assistant") {
      const { data: cls } = await supabase.from("classes").select("business_id").eq("id", parsed.data.classId).maybeSingle();
      const businessId = (cls as { business_id: string } | null)?.business_id;
      if (!businessId) return { error: "Class not found" };
      const pool = await findAssistantPool(supabase, businessId);
      if (!pool.some((p) => p.id === parsed.data.userId)) {
        return { error: "Only people on your team or in your crews can be asked to assist." };
      }
    }
    await askClassPerson(supabase, parsed.data);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not ask them" };
  }
}

export async function respondToClassAskAction(input: {
  classPersonId: string;
  accept: boolean;
}): Promise<ClassPersonActionResult> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid response" };
  }
  const supabase = await requireUser();
  try {
    await respondToClassAsk(supabase, parsed.data.classPersonId, parsed.data.accept);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
}

export async function withdrawClassAskAction(input: { classPersonId: string }): Promise<ClassPersonActionResult> {
  const parsed = classPersonIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await withdrawClassAsk(supabase, parsed.data.classPersonId);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not take them off" };
  }
}

const stepDownSchema = z.object({
  classPersonId: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

/** STEP DOWN (11 Oct 2026, D4) — only the person themself, only before the class
 *  starts; both re-checked by `step_down_from_class`. */
export async function stepDownFromClassAction(input: { classPersonId: string; reason?: string }): Promise<ClassPersonActionResult> {
  const parsed = stepDownSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await stepDownFromClass(supabase, parsed.data.classPersonId, parsed.data.reason ? parsed.data.reason : null);
    revalidatePeopleSurfaces();
    revalidatePath("/my-classes");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not step down" };
  }
}

const paySchema = z.object({
  classPersonId: z.string().uuid(),
  payPerSessionInr: z.number().int().min(0).max(1_000_000),
});

/** WHAT A SESSION PAYS THIS PERSON ON THIS CLASS (11 Oct 2026, D2) — the
 *  OWNER's number; `set_class_person_pay` refuses anybody else. */
export async function setClassPersonPayAction(input: { classPersonId: string; payPerSessionInr: number }): Promise<ClassPersonActionResult> {
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a whole rupee amount, 0 or more" };
  }
  const supabase = await requireUser();
  try {
    await setClassPersonPay(supabase, parsed.data.classPersonId, parsed.data.payPerSessionInr);
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not set the rate" };
  }
}

export async function setClassPersonPowersAction(input: {
  classPersonId: string;
  canAttendance: boolean;
  canRefunds: boolean;
}): Promise<ClassPersonActionResult> {
  const parsed = powersSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await setClassPersonPowers(
      supabase,
      parsed.data.classPersonId,
      parsed.data.canAttendance,
      parsed.data.canRefunds
    );
    revalidatePeopleSurfaces();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change the job" };
  }
}
