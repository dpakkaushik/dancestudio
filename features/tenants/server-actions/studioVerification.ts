"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeProofPhoto } from "@/repositories/orgStanding";
import { addStudioProofPhoto, requestStudioVerification } from "@/repositories/studioVerification";

/** A STUDIO SHOWS DANCEOS ITS SPACE, AND ASKS (11 Sep 2026).
 *
 *  The same shape the organization's proof had, because it is the same act one
 *  level down: the FILE never travels through a server action. The browser puts
 *  it straight into the organization's own folder in the private bucket with
 *  its own session, and only the PATH is sent. The RPC checks that the folder
 *  is the caller's own and that the studio is theirs, so a forged path or
 *  somebody else's studio id is refused even though the browser chose both. */

const addSchema = z.object({ tenantId: z.string().uuid(), path: z.string().min(8).max(400) });
const removeSchema = z.object({ id: z.string().uuid() });
const askSchema = z.object({ tenantId: z.string().uuid() });

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/business");
  revalidatePath("/admin/verifications");
};

export async function addStudioProofPhotoAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That photo could not be recorded" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await addStudioProofPhoto(supabase, parsed.data.tenantId, parsed.data.path);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add that photo" };
  }
  refresh();
  return { error: null };
}

/** Removing is the organization's existing door — the row is the same table and
 *  the RPC already checks it belongs to the caller. */
export async function removeStudioProofPhotoAction(input: unknown): Promise<{ error: string | null }> {
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

export async function requestStudioVerificationAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That studio could not be sent for review" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await requestStudioVerification(supabase, parsed.data.tenantId);
  } catch (e) {
    /* the database's refusals are written to be read — "add at least 5 photos
       of this studio (3 so far)" is the whole instruction */
    return { error: e instanceof Error ? e.message : "Could not ask for a review" };
  }
  refresh();
  return { error: null };
}
