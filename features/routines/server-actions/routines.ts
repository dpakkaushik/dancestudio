"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addClassRoutine, deleteRoutine, removeClassRoutine, saveRoutine } from "@/repositories/routines";

/** THE ROUTINES DESK'S WRITES (19 Sep 2026). Zod checks the shape; every rule
 *  that matters — whose routine it is, whether a link is a web address, whether
 *  an MP3 path sits in the caller's own folder, and who may put a routine on a
 *  class — is the RPC's, re-checked server-side there. */

export type RoutineActionResult = { error: string | null; routineId?: string };

const LEVELS = ["all", "beginner", "intermediate", "professional"] as const;
const link = z.string().trim().max(500).nullable();

const saveSchema = z.object({
  routineId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Name the routine").max(80),
  style: z.string().trim().min(1, "Pick a dance style").max(40),
  level: z.enum(LEVELS),
  songTitle: z.string().trim().max(120).nullable(),
  songUrl: link,
  songIsFile: z.boolean(),
  videoUrl: link,
  status: z.enum(["live", "draft"]),
});

async function me() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return supabase;
}

export async function saveRoutineAction(input: z.input<typeof saveSchema>): Promise<RoutineActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const supabase = await me();
  try {
    const row = await saveRoutine(supabase, { ...parsed.data, routineId: parsed.data.routineId ?? null });
    revalidatePath("/routines");
    revalidatePath(`/routines/${row.id}`);
    return { error: null, routineId: row.id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the routine" };
  }
}

export async function deleteRoutineAction(input: { routineId: string }): Promise<RoutineActionResult> {
  const parsed = z.object({ routineId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    await deleteRoutine(supabase, parsed.data.routineId);
    revalidatePath("/routines");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not delete the routine" };
  }
}

const onClass = z.object({ classId: z.string().uuid(), routineId: z.string().uuid(), shareSlug: z.string().max(140).optional() });

export async function addClassRoutineAction(input: z.input<typeof onClass>): Promise<RoutineActionResult> {
  const parsed = onClass.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    /* ⚠ A ROUTINE OF THE CLASS'S OWN STYLE (4 Oct 2026, the user: "add a routine
       should only add routines of the same dance style"). The picker offers only
       those; this asks again on the server so a hand-made request cannot put a
       Kathak routine on a Hip-Hop class through the app — and since
       20261004180000 `add_class_routine` refuses it too, in the same words. */
    const [cls, routine] = await Promise.all([
      supabase.from("classes").select("style").eq("id", parsed.data.classId).maybeSingle(),
      supabase.from("routines").select("style").eq("id", parsed.data.routineId).maybeSingle(),
    ]);
    const classStyle = (cls.data as { style: string } | null)?.style;
    const routineStyle = (routine.data as { style: string } | null)?.style;
    if (!classStyle || !routineStyle) return { error: "Could not add the routine" };
    if (classStyle !== routineStyle) return { error: `Only a ${classStyle} routine can go on a ${classStyle} class.` };
    await addClassRoutine(supabase, parsed.data.classId, parsed.data.routineId);
    if (parsed.data.shareSlug) revalidatePath(`/c/${parsed.data.shareSlug}`);
    revalidatePath("/routines");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not add the routine" };
  }
}

export async function removeClassRoutineAction(input: z.input<typeof onClass>): Promise<RoutineActionResult> {
  const parsed = onClass.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await me();
  try {
    await removeClassRoutine(supabase, parsed.data.classId, parsed.data.routineId);
    if (parsed.data.shareSlug) revalidatePath(`/c/${parsed.data.shareSlug}`);
    revalidatePath("/routines");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove the routine" };
  }
}
