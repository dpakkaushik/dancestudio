"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Recording a photo (parity slice 2). The FILE does not come through here — the
 *  browser uploads it straight to Storage with its own session, where the
 *  path-scoped policy decides, so a 5 MB image never travels through a server
 *  action. What comes through here is the PATH, and the RPC checks the same
 *  authority the storage policy did plus that the path sits in the folder that
 *  authority owns. Null clears the photo. */

export interface PhotoActionResult {
  error: string | null;
  path?: string | null;
}

const path = z.string().trim().min(1).max(300).nullable();

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

export async function setMyAvatarAction(input: { path: string | null }): Promise<PhotoActionResult> {
  const parsed = path.safeParse(input.path);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("set_my_avatar", { p_path: parsed.data });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/profile");
  revalidatePath("/stats");
  revalidatePath("/person/[userId]", "page");
  return { error: null, path: (data as string | null) ?? null };
}

export async function setTenantPhotoAction(input: { tenantId: string; path: string | null }): Promise<PhotoActionResult> {
  const parsed = z.object({ tenantId: z.string().uuid(), path }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("set_tenant_photo", { p_tenant_id: parsed.data.tenantId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/studio/${parsed.data.tenantId}`);
  revalidatePath(`/artist/${parsed.data.tenantId}`);
  revalidatePath("/discover");
  return { error: null, path: (data as string | null) ?? null };
}

export async function setCrewPhotoAction(input: { crewId: string; path: string | null }): Promise<PhotoActionResult> {
  const parsed = z.object({ crewId: z.string().uuid(), path }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("set_crew_photo", { p_crew_id: parsed.data.crewId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/crew/${parsed.data.crewId}`);
  revalidatePath(`/crews/${parsed.data.crewId}/manage`);
  revalidatePath("/crews");
  revalidatePath("/discover");
  return { error: null, path: (data as string | null) ?? null };
}
