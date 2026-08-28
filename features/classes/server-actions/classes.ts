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
  updateClassStatus,
} from "@/repositories/classes";
import { reconcileClassPeople } from "@/services/classPeople";

export interface ClassActionState {
  error: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const classFields = z.object({
  title: z.string().trim().min(1, "Give the class a name").max(140),
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
const peopleSchema = z.object({
  artistUserId: z.string().uuid().nullable(),
  /* ⚠ Step 13: a rate is optional here because only an OWNER's form sends one.
     Validating the range is not the authorization — claim_person and
     set_claim_pay refuse a rate from anybody but the owner, server-side. */
  artistPayInr: z.number().int().min(0).max(200000).optional(),
  assistants: z
    .array(
      z.object({
        userId: z.string().uuid(),
        canAttendance: z.boolean(),
        canRefunds: z.boolean(),
        payInr: z.number().int().min(0).max(200000).optional(),
      })
    )
    .max(12),
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
  title: formData.get("title"),
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
      title: d.title,
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
    });
    // the asks go out once the class they are about exists
    if (people) {
      await reconcileClassPeople(supabase, classId, people);
    }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not create the class" };
  }

  redirect(`/business/${d.tenantId}/classes`);
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
      title: d.title,
      style: d.style,
      level: d.level,
      room: d.room ?? null,
      roomId: d.roomId ?? null,
      poster: d.poster ?? null,
      priceInr: d.priceInr,
      capacity: d.capacity,
      startsAt: toIst(d.date, d.startTime),
      endsAt: toIst(d.date, d.endTime),
    });
    if (people) {
      await reconcileClassPeople(supabase, d.classId, people);
    }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the class" };
  }

  redirect(`/business/${d.tenantId}/classes`);
}

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
