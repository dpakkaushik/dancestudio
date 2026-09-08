"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrgVerification } from "@/repositories/admin";
import { findProfileById } from "@/repositories/profiles";
import { createRoom } from "@/repositories/rooms";
import { createTenantWithOwner } from "@/repositories/tenants";
import type { TenantType } from "@/types/tenant";

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

/** THE CLIENT NO LONGER SAYS WHAT KIND OF BUSINESS THIS IS (8 Sep 2026). The
 *  kind follows from who is asking: an organization opens a STUDIO, a person
 *  with the Artist plan opens their ARTIST PAGE, and nobody else opens anything.
 *  The database enforces the same rule inside create_tenant_with_owner; reading
 *  the role here first is what lets the form be told in words what is missing
 *  BEFORE a row is attempted, and what decides which fields are required. */
const createTenantSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(140),
    area: z.string().trim().max(140).optional(),
    city: z.string().trim().max(120).optional(),
    rooms: roomsSchema,
  })
  .refine((d) => !d.city || (DOS_CITIES as readonly string[]).includes(d.city), {
    message: "Pick a city from the list",
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
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }

  /* who is asking decides what is being opened */
  const type: TenantType = profile.role === "org" ? "studio" : "trainer_business";
  if (type === "studio") {
    if (!parsed.data.city) return { error: "A studio needs a city" };
    if (!parsed.data.area) return { error: "A studio needs its area" };
    if (parsed.data.rooms.length === 0) return { error: "A studio needs at least one room" };
  }

  let tenantId: string;
  try {
    const tenant = await createTenantWithOwner(supabase, {
      name: parsed.data.name,
      type,
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
  for (const room of type === "studio" ? parsed.data.rooms : []) {
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
  revalidatePath("/");
  return { error: null, created: true };
}

/** THE ASK (8 Sep 2026): an organization puts itself in the admins' queue. The
 *  RPC refuses a person, an organization already verified, and one with no
 *  social links — the links are what gets checked, so they are the price of
 *  asking. Onboarding calls this when an organization finishes; the hub offers
 *  it again after a rejection. Asking twice returns the open request. */
export async function requestOrgVerificationAction(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await requestOrgVerification(supabase);
    revalidatePath("/business");
    revalidatePath("/admin/verifications");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not ask for verification" };
  }
}
