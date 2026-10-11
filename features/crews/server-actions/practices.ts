"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelCrewPractice, checkInPractice, saveCrewPractice, undoPracticeCheckIn } from "@/repositories/crewPractices";

/** THE PRACTICE WRITES (27 Sep 2026). Every rule is in the database — only the
 *  leader arranges or cancels or runs the register, a practice ends after it
 *  starts, and creating one TELLS every confirmed member (since 11 Oct 2026,
 *  `20261018090000`: a practice is a notice, nobody answers) — so these validate
 *  SHAPE and pass through. There is no second copy of any of those checks here
 *  to drift from the database's.
 *
 *  ⚠ THE CREW ID IS NOT AN AUTHORITY, it is a pointer: `save_crew_practice` calls
 *  `is_crew_leader` on it, so a forged id is refused by the database in its own
 *  words. That is the same rule `?as=` keeps on the Discover gate and the
 *  enquiries desk, one write further on. */

export interface PracticeActionResult {
  error: string | null;
  practiceId?: string;
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

/** ⚠ EVERY SCREEN A PRACTICE SHOWS ON: the crew's desk, the crew's calendar,
 *  every member's own calendar and the Practice tile's screen. A write that
 *  revalidated only the desk would leave the others saying yesterday's thing. */
function revalidatePractice(crewId?: string) {
  revalidatePath("/calendar");
  revalidatePath("/practice");
  if (crewId) {
    revalidatePath(`/crews/${crewId}/manage/practice`);
    revalidatePath(`/crews/${crewId}/manage/calendar`);
    revalidatePath(`/crews/${crewId}/manage`);
  }
}

const saveInput = z.object({
  crewId: z.string().uuid(),
  practiceId: z.string().uuid().nullable().optional(),
  /* the form posts an IST wall-clock date and time; the action turns them into
     the instant the database stores, exactly as the class form does */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick an end time"),
  place: z.string().trim().min(1, "Say where").max(120, "That is too long for one line"),
  note: z.string().trim().max(280, "Keep the note under 280 characters").nullable().optional(),
});

/** ⚠ IST, STATED RATHER THAN INFERRED (+05:30). The server runs in UTC and the
 *  people in it dance in India, so a naive `new Date("2026-09-30T19:00")` would
 *  store a practice five and a half hours out — which is exactly what the class
 *  form's own comment has warned about since Step 3. */
const istInstant = (date: string, time: string) => `${date}T${time}:00+05:30`;

export async function saveCrewPracticeAction(raw: unknown): Promise<PracticeActionResult> {
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const { crewId, practiceId, date, startTime, endTime, place, note } = parsed.data;
  const supabase = await requireUser();
  try {
    const id = await saveCrewPractice(supabase, {
      crewId,
      startsAt: istInstant(date, startTime),
      endsAt: istInstant(date, endTime),
      place,
      note: note && note.length ? note : null,
      practiceId: practiceId ?? null,
    });
    revalidatePractice(crewId);
    return { error: null, practiceId: id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That could not be saved" };
  }
}

const idInput = z.object({ practiceId: z.string().uuid(), crewId: z.string().uuid().optional() });

export async function cancelCrewPracticeAction(raw: unknown): Promise<PracticeActionResult> {
  const parsed = idInput.safeParse(raw);
  if (!parsed.success) return { error: "That practice could not be found" };
  const supabase = await requireUser();
  try {
    await cancelCrewPractice(supabase, parsed.data.practiceId);
    revalidatePractice(parsed.data.crewId);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That could not be called off" };
  }
}

const registerInput = z.object({ practiceId: z.string().uuid(), userId: z.string().uuid(), present: z.boolean(), crewId: z.string().uuid().optional() });

/** The register, both ways — check in, and undo. ⚠ Undoing SOFT-deletes rather
 *  than erasing, which is the database's doing and is why this is one action with
 *  a boolean rather than two: the two halves are one decision about one person. */
export async function setPracticeAttendanceAction(raw: unknown): Promise<PracticeActionResult> {
  const parsed = registerInput.safeParse(raw);
  if (!parsed.success) return { error: "That person could not be found" };
  const { practiceId, userId, present, crewId } = parsed.data;
  const supabase = await requireUser();
  try {
    if (present) await checkInPractice(supabase, practiceId, userId);
    else await undoPracticeCheckIn(supabase, practiceId, userId);
    revalidatePractice(crewId);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The register could not be changed" };
  }
}
