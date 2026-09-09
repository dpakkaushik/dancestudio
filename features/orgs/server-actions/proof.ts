"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addProofPhoto, removeProofPhoto } from "@/repositories/orgStanding";

/** R16 (9 Sep 2026): recording and withdrawing one verification photo.
 *
 *  The FILE never comes through here. The browser puts it straight into the
 *  organization's own folder in the private bucket with its own session, and
 *  only the resulting PATH is sent — exactly the shape the avatar upload has,
 *  for the same reason: a 5 MB image should not travel through a server action.
 *  The RPC checks the folder is the caller's own, so a forged path is refused
 *  even though the browser chose it. */

const addSchema = z.object({ path: z.string().min(8).max(400) });
const removeSchema = z.object({ id: z.string().uuid() });

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/business");
  revalidatePath("/admin/verifications");
};

export async function addProofPhotoAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That photo could not be recorded" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await addProofPhoto(supabase, parsed.data.path);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add that photo" };
  }
  refresh();
  return { error: null };
}

export async function removeProofPhotoAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That photo could not be removed" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await removeProofPhoto(supabase, parsed.data.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove that photo" };
  }
  refresh();
  return { error: null };
}
