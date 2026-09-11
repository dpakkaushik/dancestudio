"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeProofPhoto } from "@/repositories/orgStanding";

/** R16 (9 Sep 2026): withdrawing one verification photo.
 *
 *  ADDING one goes through `addStudioProofPhotoAction` — a photo belongs to a
 *  STUDIO since 11 Sep 2026, and an organization is asked for none. Removal is
 *  shared: the row is the same table, and the RPC already checks it is the
 *  caller's own.
 *
 *  The FILE never comes through here. The browser puts it straight into the
 *  organization's own folder in the private bucket with its own session, and
 *  only the resulting PATH is sent — exactly the shape the avatar upload has,
 *  for the same reason: a 5 MB image should not travel through a server action.
 *  The RPC checks the folder is the caller's own, so a forged path is refused
 *  even though the browser chose it. */

const removeSchema = z.object({ id: z.string().uuid() });

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/business");
  revalidatePath("/admin/verifications");
};

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
