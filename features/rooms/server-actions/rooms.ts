"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAmenity } from "@/lib/constants/amenities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRoom, softDeleteRoom, updateRoom } from "@/repositories/rooms";

/** Step 11 room actions. Authorization is RLS (owner/trainer of the tenant);
 *  what a room may hold is validated here, and the amenity vocabulary is closed
 *  so "AC" and "air conditioning" can never become two things. */

export interface RoomActionResult {
  error: string | null;
}

const amenitiesSchema = z
  .array(z.string())
  .max(20)
  .refine((list) => list.every(isAmenity), "That is not one of the amenities");

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the room a name").max(80),
  capacity: z.coerce.number().int().min(1, "A room holds at least one").max(500, "That is too many"),
});

const updateSchema = z.object({
  tenantId: z.string().uuid(),
  roomId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the room a name").max(80),
  capacity: z.coerce.number().int().min(1, "A room holds at least one").max(500, "That is too many"),
  amenities: amenitiesSchema,
});

const deleteSchema = z.object({
  tenantId: z.string().uuid(),
  roomId: z.string().uuid(),
});

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

const revalidateRooms = (tenantId: string) => {
  revalidatePath(`/business/${tenantId}/rooms`);
  revalidatePath(`/business/${tenantId}/classes`);
  revalidatePath("/c/[slug]", "page");
};

export async function createRoomAction(input: {
  tenantId: string;
  name: string;
  capacity: number;
}): Promise<RoomActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid room" };
  }
  const supabase = await requireUser();
  try {
    await createRoom(supabase, { ...parsed.data, amenities: [] });
    revalidateRooms(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not add the room" };
  }
}

export async function updateRoomAction(input: {
  tenantId: string;
  roomId: string;
  name: string;
  capacity: number;
  amenities: string[];
}): Promise<RoomActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid room" };
  }
  const supabase = await requireUser();
  try {
    await updateRoom(supabase, parsed.data.roomId, {
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      amenities: parsed.data.amenities,
    });
    revalidateRooms(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the room" };
  }
}

export async function deleteRoomAction(input: {
  tenantId: string;
  roomId: string;
}): Promise<RoomActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid room" };
  }
  const supabase = await requireUser();
  try {
    await softDeleteRoom(supabase, parsed.data.roomId);
    revalidateRooms(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove the room" };
  }
}
