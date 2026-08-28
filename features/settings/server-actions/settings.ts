"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setMyRole } from "@/repositories/profiles";

/** The settings sheet's one write of its own: the Artist tools switch (prototype
 *  8850-8870) flips the same profile between dancing and teaching. Everything
 *  else the sheet does lands on actions other slices already own (notification
 *  prefs, sign-out). */

const schema = z.object({ role: z.enum(["dancer", "trainer"]) });

export async function setMyRoleAction(input: { role: "dancer" | "trainer" }): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await setMyRole(supabase, parsed.data.role);
    revalidatePath("/profile");
    revalidatePath("/");
    revalidatePath(`/person/${user.id}`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not switch that" };
  }
}
