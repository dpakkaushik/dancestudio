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
  /** the ROW's id, for the doors that make one (16 Sep 2026) — a header picture
   *  added inside an Edit sheet has to be removable in that same sheet, and
   *  removing takes an id */
  id?: string | null;
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
  const { data, error } = await supabase.rpc("set_my_profile_photo", { p_path: parsed.data });
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
  const { data, error } = await supabase.rpc("set_business_profile_photo", { p_business_id: parsed.data.tenantId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/studio/${parsed.data.tenantId}`);
  revalidatePath(`/artist/${parsed.data.tenantId}`);
  revalidatePath("/discover");
  return { error: null, path: (data as string | null) ?? null };
}

/** AN ARTIST'S GALLERY (14 Sep 2026). The same shape as the three doors above:
 *  the file is already in `gallery/{user}/…` when this runs, and the RPC checks
 *  the folder, the ceiling of ten, and records the row. Removing returns the
 *  path so the browser can take the object out of the bucket too — the one
 *  photo flow here that does not leave an orphan behind. */
export async function addMyGalleryPhotoAction(input: { path: string }): Promise<PhotoActionResult> {
  const parsed = z.string().trim().min(1).max(300).safeParse(input.path);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("add_my_header_photo", { p_path: parsed.data });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/person/[userId]", "page");
  return { error: null, path: parsed.data, id: (data as string | null) ?? null };
}

export async function removeMyGalleryPhotoAction(input: { id: string }): Promise<PhotoActionResult> {
  const parsed = z.string().uuid().safeParse(input.id);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("remove_my_header_photo", { p_id: parsed.data });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/person/[userId]", "page");
  return { error: null, path: (data as string | null) ?? null };
}

/** A CREW'S HEADER (19 Sep 2026): the same two doors a person's header has, for
 *  the crew's leader — the file is already in `crews/{crew}/…`, the RPC checks
 *  the folder, the leader and the ceiling of five, and records the row;
 *  removing returns the path so the browser takes the object out too. */
export async function addCrewHeaderPhotoAction(input: { crewId: string; path: string }): Promise<PhotoActionResult> {
  const parsed = z.object({ crewId: z.string().uuid(), path: z.string().trim().min(1).max(300) }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("add_crew_header_photo", { p_crew_id: parsed.data.crewId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/crew/${parsed.data.crewId}`);
  revalidatePath(`/crews/${parsed.data.crewId}/manage`);
  return { error: null, path: parsed.data.path, id: (data as string | null) ?? null };
}

export async function removeCrewHeaderPhotoAction(input: { id: string; crewId?: string }): Promise<PhotoActionResult> {
  const parsed = z.object({ id: z.string().uuid(), crewId: z.string().uuid().optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("remove_crew_header_photo", { p_id: parsed.data.id });
  if (error) {
    return { error: error.message };
  }
  if (parsed.data.crewId) {
    revalidatePath(`/crew/${parsed.data.crewId}`);
    revalidatePath(`/crews/${parsed.data.crewId}/manage`);
  }
  revalidatePath("/crew/[crewId]", "page");
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
