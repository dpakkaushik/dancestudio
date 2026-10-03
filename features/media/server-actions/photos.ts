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

export async function setBusinessPhotoAction(input: { businessId: string; path: string | null }): Promise<PhotoActionResult> {
  const parsed = z.object({ businessId: z.string().uuid(), path }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("set_business_profile_photo", { p_business_id: parsed.data.businessId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/studio/${parsed.data.businessId}`);
  revalidatePath(`/artist/${parsed.data.businessId}`);
  revalidatePath("/discover");
  return { error: null, path: (data as string | null) ?? null };
}

/** AN UPLOADED POSTER (27 Sep 2026) — the same shape as every door above: the
 *  file is already in `posters/{business}/…`, written with the person's own
 *  session under a policy that asked `is_business_member`, and the RPC here
 *  re-checks the folder AND narrows to an owner or a trainer, because the front
 *  desk does not change what a class looks like. `null` takes the picture down
 *  and the drawn sleeve comes back. */
export async function setPosterAction(input: { kind: "class" | "event"; id: string; path: string | null }): Promise<PhotoActionResult> {
  const parsed = z.object({ kind: z.enum(["class", "event"]), id: z.string().uuid(), path }).safeParse(input);
  if (!parsed.success) return { error: "Invalid poster" };
  const supabase = await requireUser();
  const { error } =
    parsed.data.kind === "class"
      ? await supabase.rpc("set_class_poster", { p_class_id: parsed.data.id, p_path: parsed.data.path })
      : await supabase.rpc("set_event_poster", { p_event_id: parsed.data.id, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/discover");
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/e/[slug]", "page");
  return { error: null, path: parsed.data.path };
}

/** AN ASSET'S PICTURE (3 Oct 2026) — the poster door's shape: the file is
 *  already in `assets/{business}/…`, written under an owner-only policy, and
 *  `set_asset_photo` re-checks the owner AND the folder. Null takes it off. */
export async function setAssetPhotoAction(input: { assetId: string; businessId: string; path: string | null }): Promise<PhotoActionResult> {
  const parsed = z.object({ assetId: z.string().uuid(), businessId: z.string().uuid(), path }).safeParse(input);
  if (!parsed.success) return { error: "Invalid photo" };
  const supabase = await requireUser();
  const { error } = await supabase.rpc("set_asset_photo", { p_asset_id: parsed.data.assetId, p_path: parsed.data.path });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/business/${parsed.data.businessId}/assets`);
  return { error: null, path: parsed.data.path };
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
