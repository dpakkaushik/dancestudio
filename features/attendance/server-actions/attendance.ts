"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addWalkIn,
  bookForPerson,
  checkIn,
  giveSpot,
  removeFromWaitlist,
  removeWalkIn,
  undoCheckIn,
} from "@/repositories/attendance";

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

/** THE DOOR: book somebody in, then check them in, as ONE act (29 Sep 2026).
 *
 *  ⚠ ONE ACT IS THE USER'S OWN WORDING, not a shortcut. Their 28 Sep sentence
 *  was "after confirmation only should check them in OR ADD THEM" — so the scan
 *  sheet's confirm card (the face, the name, the city, Confirm / Not them) IS
 *  the consent step, and a second press asking "really?" would be the same
 *  question twice. The person is at the door and has handed over their own code.
 *
 *  ⚠ AND IT CHECKS THEM IN WITH THE ID THE BOOKING JUST RETURNED rather than
 *  going back for the register — the row cannot be in the page's props yet, and
 *  waiting for it is the 28 Sep stale-prop race.
 *
 *  ⚠ A HALF-DONE DOOR IS REPORTED HONESTLY: if the seat is taken and the
 *  check-in then fails, the seat STANDS and the message says so, because the
 *  booking is the thing that matters and un-booking somebody to tidy up a
 *  failed second step would throw away the real one. */
const doorSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function bookAtTheDoorAction(input: {
  sessionId: string;
  userId: string;
}): Promise<RegisterActionResult> {
  const parsed = doorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid person or session" };
  }
  const supabase = await requireUser();

  let enrollmentId: string;
  try {
    enrollmentId = await bookForPerson(supabase, parsed.data.sessionId, parsed.data.userId);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not book them in" };
  }

  try {
    await checkIn(supabase, enrollmentId);
  } catch (error: unknown) {
    revalidateRegisterSurfaces();
    const why = error instanceof Error ? error.message : "the register would not take it";
    return { error: `They have a seat, but the check-in did not go through — ${why}` };
  }

  revalidateRegisterSurfaces();
  return { error: null };
}

/** THE DOOR, SHAPE 2: a walk-in with no account, recorded by name and checked
 *  in as one act — the same shape as `bookAtTheDoorAction` and for the same
 *  reason. A half-done door is reported honestly: the seat stands if the
 *  check-in then fails, because the seat is the thing that matters. */
const walkInSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export async function addWalkInAction(input: {
  sessionId: string;
  name: string;
}): Promise<RegisterActionResult> {
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Give the walk-in a name" };
  }
  const supabase = await requireUser();

  let enrollmentId: string;
  try {
    enrollmentId = await addWalkIn(supabase, parsed.data.sessionId, parsed.data.name);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not record the walk-in" };
  }

  try {
    await checkIn(supabase, enrollmentId);
  } catch (error: unknown) {
    revalidateRegisterSurfaces();
    const why = error instanceof Error ? error.message : "the register would not take it";
    return { error: `They have a seat, but the check-in did not go through — ${why}` };
  }

  revalidateRegisterSurfaces();
  return { error: null };
}

export async function removeWalkInAction(input: {
  enrollmentId: string;
}): Promise<RegisterActionResult> {
  return runRegisterOp(removeWalkIn, input);
}
