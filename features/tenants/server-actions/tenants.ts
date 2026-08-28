"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRoom } from "@/repositories/rooms";
import { createTenantWithOwner } from "@/repositories/tenants";

export interface TenantActionState {
  error: string | null;
  created?: boolean;
}

/** The rooms the New-studio sheet collects (prototype 2675-2683): a name and a
 *  capacity each. They ride in as one JSON field because the sheet is a plain
 *  form; the shape is checked here, not trusted. */
const roomSchema = z.object({
  name: z.string().trim().min(1, "Give every room a name").max(80),
  capacity: z.coerce.number().int().min(1, "A room holds at least one").max(500, "That is too many"),
});

const roomsSchema = z.array(roomSchema).max(20, "That is a lot of rooms — add the rest from the Rooms desk");

const createTenantSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(140),
    type: z.enum(["studio", "trainer_business"]),
    area: z.string().trim().max(140).optional(),
    city: z.string().trim().max(120).optional(),
    rooms: roomsSchema,
  })
  .refine((d) => !d.city || (DOS_CITIES as readonly string[]).includes(d.city), {
    message: "Pick a city from the list",
  })
  .refine((d) => d.type !== "studio" || (d.city && d.city.length > 0), {
    message: "A studio needs a city",
  })
  .refine((d) => d.type !== "studio" || (d.area && d.area.length > 0), {
    message: "A studio needs its area",
  })
  .refine((d) => d.type !== "studio" || d.rooms.length > 0, {
    message: "A studio needs at least one room",
  });

/** The rooms field is JSON typed by the sheet; anything unparseable is "no rooms"
 *  and the schema says what is missing. */
const readRooms = (raw: FormDataEntryValue | null): unknown => {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData
): Promise<TenantActionState> {
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    area: (formData.get("area") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
    rooms: readRooms(formData.get("rooms")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let tenantId: string;
  try {
    const tenant = await createTenantWithOwner(supabase, {
      name: parsed.data.name,
      type: parsed.data.type,
      area: parsed.data.area ?? null,
      city: parsed.data.city ?? null,
    });
    tenantId = tenant.id;
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not create the business",
    };
  }

  /* the rooms go in after the RPC has made the caller the owner — Step 11's
     policy lets an owner insert rooms directly, so no second RPC is needed. A
     room that fails does not undo the studio: it exists, and the list behind
     the sheet says so; the message says which room did not make it. */
  for (const room of parsed.data.rooms) {
    try {
      await createRoom(supabase, { tenantId, name: room.name, capacity: room.capacity, amenities: [] });
    } catch (error: unknown) {
      revalidatePath("/business");
      return {
        error: `Studio created, but the room “${room.name}” could not be added: ${
          error instanceof Error ? error.message : "unknown error"
        }. Add it from the Rooms desk.`,
      };
    }
  }

  // a redirect to /business would land on the same route and leave the sheet's
  // client state open — refresh the list and let the sheet close itself instead
  revalidatePath("/business");
  return { error: null, created: true };
}
