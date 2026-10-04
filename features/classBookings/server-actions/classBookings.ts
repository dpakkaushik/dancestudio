"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelClassBooking, bookClassSession } from "@/repositories/classBookings";

export interface EnrollActionState {
  error: string | null;
  /** Set after a successful booking or cancel. ⚠ No "waitlisted" since 4 Oct
   *  2026 — a full class is refused, so a booking either lands or says why. */
  outcome: "enrolled" | "cancelled" | null;
}

const enrollSchema = z.object({ sessionId: z.string().uuid() });
const cancelSchema = z.object({ classBookingId: z.string().uuid() });

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

export async function enrollAction(
  _prev: EnrollActionState,
  formData: FormData
): Promise<EnrollActionState> {
  const parsed = enrollSchema.safeParse({ sessionId: formData.get("sessionId") });
  if (!parsed.success) {
    return { error: "Invalid session", outcome: null };
  }

  const supabase = await requireUser();
  try {
    const status = await bookClassSession(supabase, parsed.data.sessionId);
    revalidatePath("/classes");
    revalidatePath("/my-classes");
    revalidatePath("/discover");
    revalidatePath("/");
    revalidatePath("/c/[slug]", "page");
    /* the database refuses a full class since `20261004160000`; until that is
       applied it could still answer anything but a seat, and that is not one */
    if (status !== "enrolled") {
      return { error: "This class is full", outcome: null };
    }
    return { error: null, outcome: "enrolled" };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not book the spot",
      outcome: null,
    };
  }
}

export async function cancelClassBookingAction(
  _prev: EnrollActionState,
  formData: FormData
): Promise<EnrollActionState> {
  const parsed = cancelSchema.safeParse({ classBookingId: formData.get("classBookingId") });
  if (!parsed.success) {
    return { error: "Invalid booking", outcome: null };
  }

  const supabase = await requireUser();
  try {
    await cancelClassBooking(supabase, parsed.data.classBookingId);
    revalidatePath("/classes");
    revalidatePath("/my-classes");
    revalidatePath("/discover");
    revalidatePath("/");
    revalidatePath("/c/[slug]", "page");
    return { error: null, outcome: "cancelled" };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not cancel",
      outcome: null,
    };
  }
}
