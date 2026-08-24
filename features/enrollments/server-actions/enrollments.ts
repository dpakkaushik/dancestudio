"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelEnrollment, enrollInSession } from "@/repositories/enrollments";

export interface EnrollActionState {
  error: string | null;
  /** Set after a successful enroll: "enrolled" or "waitlisted". */
  outcome: "enrolled" | "waitlisted" | "cancelled" | null;
}

const enrollSchema = z.object({ sessionId: z.string().uuid() });
const cancelSchema = z.object({ enrollmentId: z.string().uuid() });

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
    const status = await enrollInSession(supabase, parsed.data.sessionId);
    revalidatePath("/classes");
    revalidatePath("/my-classes");
    return { error: null, outcome: status === "waitlisted" ? "waitlisted" : "enrolled" };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not book the spot",
      outcome: null,
    };
  }
}

export async function cancelEnrollmentAction(
  _prev: EnrollActionState,
  formData: FormData
): Promise<EnrollActionState> {
  const parsed = cancelSchema.safeParse({ enrollmentId: formData.get("enrollmentId") });
  if (!parsed.success) {
    return { error: "Invalid booking", outcome: null };
  }

  const supabase = await requireUser();
  try {
    await cancelEnrollment(supabase, parsed.data.enrollmentId);
    revalidatePath("/classes");
    revalidatePath("/my-classes");
    return { error: null, outcome: "cancelled" };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not cancel",
      outcome: null,
    };
  }
}
