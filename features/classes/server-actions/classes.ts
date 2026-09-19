"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createClassWithSession,
  softDeleteClass,
  updateClassDetails,
  updateClassPoster,
  findRoomClash,
  respondToVenueRequest,
  updateClassStatus,
} from "@/repositories/classes";
import { findRoomsByTenant } from "@/repositories/rooms";
import { searchEverything } from "@/repositories/search";
import { reconcileClassPeople } from "@/services/classPeople";

export interface ClassActionState {
  error: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const classFields = z.object({
  /* no `title`: a class has no name. The form has no field for one (the prototype's
     has none either, 15309-15531), and the repository writes the database's title
     column as "{style} · {level}" on every save — see types/class.ts */
  style: z.string().refine((s) => DOS_STYLE_NAMES.includes(s), "Pick a dance style"),
  level: z.enum(["all", "beginner", "intermediate", "professional"]),
  room: z.string().trim().max(140).optional(),
  /** Step 11: the room is picked from the studio's own rooms. The RPC and the
   *  class triggers re-check that it belongs to this tenant and that it holds
   *  the capacity, so a forged id gets nowhere. */
  roomId: z.string().uuid().optional(),
  poster: z.enum(["bold", "split", "quiet", "none"]).optional(),
  priceInr: z.coerce.number().int("Whole rupees only").min(0).max(1000000, "Price is too high"),
  capacity: z.coerce.number().int().min(1, "At least one place").max(500, "Capacity is too high"),
  date: z.string().regex(DATE_RE, "Pick a date"),
  startTime: z.string().regex(TIME_RE, "Pick a start time"),
  endTime: z.string().regex(TIME_RE, "Pick an end time"),
  /* WHERE AN ARTIST'S CLASS HAPPENS (18 Sep 2026): a studio's room — the venue,
     with `roomId` one of ITS rooms — or a place of their own. The RPC and the
     triggers re-check the room belongs to the venue and that a venue class is
     saved as a draft, so a forged id or status gets nowhere. */
  venueBusinessId: z.string().uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  mapsUrl: z.string().url().max(400).optional(),
  /* WHOSE PASS PAYS FOR A SEAT (19 Sep 2026) — the form's two switches. They
     travel as "1" or an empty string, so a missing field reads as off; the
     database is what refuses a pass a class does not admit. */
  allowsStudioMemberships: z.coerce.boolean(),
  allowsArtistMemberships: z.coerce.boolean(),
});

const endsAfterStart = {
  check: (d: { startTime: string; endTime: string }) => d.endTime > d.startTime,
  message: "The class has to end after it starts",
};

const createClassSchema = classFields
  .extend({
    tenantId: z.string().uuid(),
    status: z.enum(["draft", "published"]),
  })
  .refine(endsAfterStart.check, { message: endsAfterStart.message });

const updateClassSchema = classFields
  .extend({
    tenantId: z.string().uuid(),
    classId: z.string().uuid(),
  })
  .refine(endsAfterStart.check, { message: endsAfterStart.message });

/** India-only for now — a picked date + time means IST. */
const toIst = (date: string, time: string): string => `${date}T${time}:00+05:30`;

/** Who the form says is on this class. Parsed separately from the class fields
 *  because a bad people payload must never stop the class itself saving. */
/* 18 Sep 2026: the form names the TEACHER only. Assistants left it — they are
   added from the class page by the owner or the teacher, each addition an ask. */
const peopleSchema = z.object({
  artistUserId: z.string().uuid().nullable(),
  /* ⚠ Step 13: a rate is optional here because only an OWNER's form sends one.
     Validating the range is not the authorization — ask_class_person and
     set_class_person_pay refuse a rate from anybody but the owner, server-side. */
  artistPayInr: z.number().int().min(0).max(200000).optional(),
});

const readPeople = (formData: FormData) => {
  const raw = formData.get("people");
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  try {
    const parsed = peopleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // not JSON — treat as "the form said nothing about people"
  }
};

const readFields = (formData: FormData) => ({
  style: formData.get("style"),
  level: formData.get("level"),
  room: (formData.get("room") as string) || undefined,
  roomId: (formData.get("roomId") as string) || undefined,
  poster: (formData.get("poster") as string) || undefined,
  priceInr: formData.get("priceInr"),
  capacity: formData.get("capacity"),
  date: formData.get("date"),
  startTime: formData.get("startTime"),
  endTime: formData.get("endTime"),
  venueBusinessId: (formData.get("venueBusinessId") as string) || undefined,
  lat: (formData.get("lat") as string) || undefined,
  lng: (formData.get("lng") as string) || undefined,
  mapsUrl: (formData.get("mapsUrl") as string) || undefined,
  allowsStudioMemberships: (formData.get("allowsStudioMemberships") as string) === "1",
  allowsArtistMemberships: (formData.get("allowsArtistMemberships") as string) === "1",
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

export async function createClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const parsed = createClassSchema.safeParse({
    ...readFields(formData),
    tenantId: formData.get("tenantId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await requireUser();
  const d = parsed.data;
  const people = readPeople(formData);
  try {
    const classId = await createClassWithSession(supabase, {
      tenantId: d.tenantId,
      style: d.style,
      level: d.level,
      room: d.room ?? null,
      roomId: d.roomId ?? null,
      poster: d.poster ?? null,
      priceInr: d.priceInr,
      capacity: d.capacity,
      status: d.status,
      startsAt: toIst(d.date, d.startTime),
      endsAt: toIst(d.date, d.endTime),
      venueBusinessId: d.venueBusinessId ?? null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      mapsUrl: d.mapsUrl ?? null,
      allowsStudioMemberships: d.allowsStudioMemberships,
      allowsArtistMemberships: d.allowsArtistMemberships,
    });
    // the asks go out once the class they are about exists
    if (people) {
      await reconcileClassPeople(supabase, classId, people);
    }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not create the class" };
  }

  redirect(afterSave(formData, d.tenantId));
}

export async function updateClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const parsed = updateClassSchema.safeParse({
    ...readFields(formData),
    tenantId: formData.get("tenantId"),
    classId: formData.get("classId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await requireUser();
  const d = parsed.data;
  const people = readPeople(formData);
  try {
    await updateClassDetails(supabase, d.classId, {
      style: d.style,
      level: d.level,
      room: d.room ?? null,
      roomId: d.roomId ?? null,
      poster: d.poster ?? null,
      priceInr: d.priceInr,
      capacity: d.capacity,
      startsAt: toIst(d.date, d.startTime),
      endsAt: toIst(d.date, d.endTime),
      venueBusinessId: d.venueBusinessId ?? null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      mapsUrl: d.mapsUrl ?? null,
      allowsStudioMemberships: d.allowsStudioMemberships,
      allowsArtistMemberships: d.allowsArtistMemberships,
    });
    if (people) {
      await reconcileClassPeople(supabase, d.classId, people);
    }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the class" };
  }

  redirect(afterSave(formData, d.tenantId));
}

/** WHERE A SAVE LANDS (19 Sep 2026): an artist's register is the Manage segment
 *  of Your classes, and the form says so in a hidden `after` field — so the
 *  redirect goes there in ONE hop instead of through `/business/{id}/classes`,
 *  which for an artist page could only redirect again and left a looping entry
 *  in the history. Only the two known destinations are honoured. */
const afterSave = (formData: FormData, tenantId: string) => {
  const after = String(formData.get("after") ?? "");
  return after === "/my-classes?show=manage" ? after : `/business/${tenantId}/classes`;
};

const classRefSchema = z.object({
  classId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export async function publishClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const parsed = classRefSchema.safeParse({
    classId: formData.get("classId"),
    tenantId: formData.get("tenantId"),
  });
  if (!parsed.success) {
    return { error: "Invalid class" };
  }

  const supabase = await requireUser();
  try {
    await updateClassStatus(supabase, parsed.data.classId, "published");
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not publish" };
  }

  revalidatePath(`/business/${parsed.data.tenantId}/classes`);
  return { error: null };
}

export async function deleteClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const parsed = classRefSchema.safeParse({
    classId: formData.get("classId"),
    tenantId: formData.get("tenantId"),
  });
  if (!parsed.success) {
    return { error: "Invalid class" };
  }

  const supabase = await requireUser();
  try {
    await softDeleteClass(supabase, parsed.data.classId);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not delete" };
  }

  revalidatePath(`/business/${parsed.data.tenantId}/classes`);
  return { error: null };
}

const posterSchema = z.object({
  classId: z.string().uuid(),
  tenantId: z.string().uuid(),
  poster: z.enum(["bold", "split", "quiet", "none"]),
});

/** The Poster chip on the class page (prototype 11812 → the sheet at 12768-12780):
 *  one field, set from the page itself. Who may is RLS's call — the update returns
 *  no row for anybody else, and the repository says so. */
export async function setClassPosterAction(input: {
  classId: string;
  tenantId: string;
  poster: string;
}): Promise<ClassActionState> {
  const parsed = posterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Pick one of the drawn designs" };
  }

  const supabase = await requireUser();
  try {
    await updateClassPoster(supabase, parsed.data.classId, parsed.data.poster);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not set the poster" };
  }

  revalidatePath(`/business/${parsed.data.tenantId}/classes`);
  return { error: null };
}

const clashSchema = z
  .object({
    tenantId: z.string().uuid(),
    roomId: z.string().uuid(),
    date: z.string().regex(DATE_RE),
    startTime: z.string().regex(TIME_RE),
    endTime: z.string().regex(TIME_RE),
    excludeClassId: z.string().uuid().nullable().optional(),
  })
  .refine(endsAfterStart.check, { message: endsAfterStart.message });

/** THE VENUE'S ANSWER (18 Sep 2026): the studio's owner accepts or declines an
 *  artist's ask for one of its rooms — from the Inbox's Requests desk. The RPC
 *  decides who may answer. */
const venueSchema = z.object({ classId: z.string().uuid(), accept: z.boolean() });
export async function respondToVenueRequestAction(input: unknown): Promise<ClassActionState> {
  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await respondToVenueRequest(supabase, parsed.data.classId, parsed.data.accept);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
  revalidatePath("/inbox");
  revalidatePath("/my-classes");
  revalidatePath("/");
  return { error: null };
}

/** THE VENUE PICKER'S TWO READS (18 Sep 2026): the studios an artist may ask for
 *  a room — the same search box Discover uses, narrowed to studios (a stranger's
 *  own RLS decides what is found, so an unlisted studio is never offered) — and
 *  a chosen studio's rooms, which anyone may read on a listed studio. */
export async function searchVenuesAction(term: unknown): Promise<Array<{ id: string; name: string; sub: string }>> {
  const q = typeof term === "string" ? term.trim().slice(0, 60) : "";
  if (q.length < 2) return [];
  const supabase = await requireUser();
  try {
    return (await searchEverything(supabase, q, 6)).filter((h) => h.kind === "studio").map((h) => ({ id: h.id, name: h.name, sub: h.sub }));
  } catch {
    return [];
  }
}

export async function venueRoomsAction(businessId: unknown): Promise<Array<{ id: string; name: string; capacity: number; amenities: string[] }>> {
  const parsed = z.string().uuid().safeParse(businessId);
  if (!parsed.success) return [];
  const supabase = await requireUser();
  try {
    return (await findRoomsByTenant(supabase, parsed.data)).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, amenities: r.amenities }));
  } catch {
    return [];
  }
}

/** the clashing class's label ("{style} · {level}") and the hour it starts */
export type RoomClash = { label: string; at: string } | null;

/** The confirm sheet's ROOM ALREADY BUSY question (F3). A read, not a write:
 *  it changes nothing and it is the caller's own tenant's rows. Anything that
 *  goes wrong here answers "no clash" — the database still refuses a real one
 *  at publish, so a failed early check can never let a double-booking through;
 *  it can only lose the early warning. */
export async function checkRoomClashAction(input: unknown): Promise<RoomClash> {
  const parsed = clashSchema.safeParse(input);
  if (!parsed.success) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const hit = await findRoomClash(supabase, {
      tenantId: parsed.data.tenantId,
      roomId: parsed.data.roomId,
      startsAt: toIst(parsed.data.date, parsed.data.startTime),
      endsAt: toIst(parsed.data.date, parsed.data.endTime),
      excludeClassId: parsed.data.excludeClassId ?? null,
    });
    if (!hit) return null;
    const at = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
      .format(new Date(hit.startsAt))
      .toLowerCase();
    return { label: hit.label, at };
  } catch {
    return null;
  }
}
