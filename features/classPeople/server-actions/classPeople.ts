"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askClassPerson, respondToClassAsk, setClassPersonPowers, withdrawClassAsk } from "@/repositories/classPeople";
import { findAssistantPool } from "@/repositories/profiles";

/** Step 11 people actions. Consent is the whole point: the studio ASKS (only
 *  its own team, owner/trainer only) and the person asked is the only one who
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
