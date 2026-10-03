"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAmenity } from "@/lib/constants/amenities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRoom, softDeleteRoom, updateRoom } from "@/repositories/rooms";
import type { Room } from "@/types/room";

/** Step 11 room actions. Authorization is RLS (owner/trainer of the business);
 *  what a room may hold is validated here, and the amenity vocabulary is closed
 *  so "AC" and "air conditioning" can never become two things. */

export interface RoomActionResult {
  error: string | null;
  /** the room as saved — the desk draws it at once (4 Oct 2026) */
  room?: Room;
}

const amenitiesSchema = z
  .array(z.string())
  .max(20)
  .refine((list) => list.every(isAmenity), "That is not one of the amenities");

const createSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the room a name").max(80),
  capacity: z.coerce.number().int().min(1, "A room holds at least one").max(500, "That is too many"),
  /* asked for in the add form since 4 Oct 2026 — absent means none */
  amenities: amenitiesSchema.optional(),
});

const updateSchema = z.object({
  businessId: z.string().uuid(),
  roomId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the room a name").max(80),
  capacity: z.coerce.number().int().min(1, "A room holds at least one").max(500, "That is too many"),
  amenities: amenitiesSchema,
});

const deleteSchema = z.object({
  businessId: z.string().uuid(),
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

/* ⚠⚠ ONLY A DELETION REVALIDATES (4 Oct 2026, the user: "make page quicker for
   opening add room form and it being created. and for edit"). Measured: ANY
   `revalidatePath` inside a server action makes Next re-render the CURRENT page
   into the action's response — the membership read, the rooms, the address —
   so Add and Save took 1.7–3.3 s with the database write itself a fraction of
   it. Every page this touches is dynamic (cookies) and read fresh on the next
   visit, so revalidating bought nothing; the desk draws the room the save hands
   back instead. A deletion still revalidates the desk, because it hands nothing
   back. */
const revalidateRooms = (businessId: string, desk = false) => {
  if (desk) revalidatePath(`/business/${businessId}/rooms`);
  revalidatePath(`/business/${businessId}/classes`);
  revalidatePath("/c/[slug]", "page");
};

export async function createRoomAction(input: {
  businessId: string;
  name: string;
  capacity: number;
  amenities?: string[];
}): Promise<RoomActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid room" };
  }
  const supabase = await requireUser();
  try {
    const room = await createRoom(supabase, { ...parsed.data, amenities: parsed.data.amenities ?? [] });
    /* ⚠ NO REVALIDATION ON A SAVE (4 Oct 2026) — see `revalidateRooms` */
    return { error: null, room };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not add the room" };
  }
}

export async function updateRoomAction(input: {
  businessId: string;
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
    const room = await updateRoom(supabase, parsed.data.roomId, {
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      amenities: parsed.data.amenities,
    });
    return { error: null, room };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the room" };
  }
}

export async function deleteRoomAction(input: {
  businessId: string;
  roomId: string;
}): Promise<RoomActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid room" };
  }
  const supabase = await requireUser();
  try {
    await softDeleteRoom(supabase, parsed.data.roomId);
    revalidateRooms(parsed.data.businessId, true);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove the room" };
  }
}
