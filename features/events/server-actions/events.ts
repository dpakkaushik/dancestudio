"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addEventWalkIn,
  bookEvent,
  cancelEventBooking,
  checkInEventBooking,
  deleteEvent,
  publishEvent,
  saveEvent,
  setEventStatus,
  type EventPayload,
} from "@/repositories/events";

/** ⚠ money-adjacent. Step 21's writes. The RPCs hold every rule — who may run
 *  events, the publish blockers, capacity under lock, and the refusal of a
 *  priced seat or entry until the rail has an account — so the actions
 *  validate shape and pass through. */

export interface EventActionResult {
  error: string | null;
  eventId?: string;
  bookingId?: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a date");
const time = z.string().regex(/^\d{2}:\d{2}$/, "not a time");
const FORMATS = ["solo", "duo", "crew"] as const;

const eventSchema = z.object({
  cat: z.enum(["showcase", "battle", "tournament"]),
  title: z.string().trim().min(1).max(64),
  style: z.string().trim().min(1).max(40),
  start_date: date,
  end_date: date,
  start_time: time,
  venue: z.string().trim().min(1).max(80),
  address: z.string().trim().max(160).nullable(),
  city: z.string().trim().min(1).max(40),
  maps_url: z.string().trim().min(4).max(300),
  about: z.string().trim().max(900).nullable(),
  entry_format: z.enum(["none", "solo", "duo", "crew", "all", "mixed"]),
  bracket: z.union([z.literal(0), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
  rounds: z.number().int().min(0).max(5),
  prizes: z.array(z.number().int().min(0).max(10_000_000)).max(3),
  tickets_on: z.boolean(),
  entry_tiers: z
    .array(z.object({ format: z.enum(FORMATS), fee_inr: z.number().int().min(0).max(999999), capacity: z.number().int().min(0).max(500) }))
    .max(3),
  ticket_tiers: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(40),
        price_inr: z.number().int().min(0).max(999999),
        capacity: z.number().int().min(1).max(5000),
        sort: z.number().int().min(0).max(99),
      })
    )
    .max(12),
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

function revalidateEvents(tenantId?: string, slug?: string) {
  if (tenantId) {
    revalidatePath(`/business/${tenantId}/events`);
  }
  revalidatePath("/business/[tenantId]/events", "page");
  revalidatePath("/business/[tenantId]/events/[eventId]", "page");
  if (slug) revalidatePath(`/e/${slug}`);
  revalidatePath("/e/[slug]", "page");
  revalidatePath("/discover");
  revalidatePath("/my-classes");
}

export async function saveEventAction(input: {
  tenantId: string;
  eventId: string | null;
  event: EventPayload;
  publish: boolean;
}): Promise<EventActionResult> {
  const head = z.object({ tenantId: z.string().uuid(), eventId: z.string().uuid().nullable(), publish: z.boolean() }).safeParse(input);
  const body = eventSchema.safeParse(input.event);
  if (!head.success || !body.success) {
    return { error: body.success ? "Invalid request" : body.error.issues[0]?.message ?? "Check the event" };
  }
  const supabase = await requireUser();
  try {
    const id = await saveEvent(supabase, head.data.tenantId, head.data.eventId, body.data as EventPayload);
    if (head.data.publish) {
      await publishEvent(supabase, id);
    }
    revalidateEvents(head.data.tenantId);
    return { error: null, eventId: id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that event" };
  }
}

export async function publishEventAction(input: { tenantId: string; eventId: string }): Promise<EventActionResult> {
  const parsed = z.object({ tenantId: z.string().uuid(), eventId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await publishEvent(supabase, parsed.data.eventId);
    revalidateEvents(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not publish" };
  }
}

export async function setEventStatusAction(input: {
  tenantId: string;
  eventId: string;
  status: "draft" | "completed";
}): Promise<EventActionResult> {
  const parsed = z
    .object({ tenantId: z.string().uuid(), eventId: z.string().uuid(), status: z.enum(["draft", "completed"]) })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await setEventStatus(supabase, parsed.data.eventId, parsed.data.status);
    revalidateEvents(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change that" };
  }
}

export async function deleteEventAction(input: { tenantId: string; eventId: string }): Promise<EventActionResult> {
  const parsed = z.object({ tenantId: z.string().uuid(), eventId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await deleteEvent(supabase, parsed.data.eventId);
    revalidateEvents(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not delete that event" };
  }
}

const bookSchema = z.object({
  eventId: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.enum(["spectator", "participant"]),
  ticketTierId: z.string().uuid().nullable().optional(),
  qty: z.number().int().min(1).max(20).optional(),
  format: z.enum(FORMATS).nullable().optional(),
  entrantName: z.string().trim().max(80).nullable().optional(),
  partnerName: z.string().trim().max(80).nullable().optional(),
  crewId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

export async function bookEventAction(input: z.input<typeof bookSchema>): Promise<EventActionResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid booking" };
  const supabase = await requireUser();
  try {
    const id = await bookEvent(supabase, parsed.data);
    revalidateEvents(undefined, parsed.data.slug);
    return { error: null, bookingId: id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not book" };
  }
}

export async function cancelEventBookingAction(input: { bookingId: string; slug?: string }): Promise<EventActionResult> {
  const parsed = z.object({ bookingId: z.string().uuid(), slug: z.string().optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await cancelEventBooking(supabase, parsed.data.bookingId);
    revalidateEvents(undefined, parsed.data.slug);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not cancel" };
  }
}

export async function checkInEventBookingAction(input: {
  tenantId: string;
  bookingId: string;
  on: boolean;
}): Promise<EventActionResult> {
  const parsed = z.object({ tenantId: z.string().uuid(), bookingId: z.string().uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await checkInEventBooking(supabase, parsed.data.bookingId, parsed.data.on);
    revalidateEvents(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not check them in" };
  }
}

export async function addWalkInAction(input: {
  tenantId: string;
  eventId: string;
  kind: "spectator" | "participant";
  name: string;
  ticketTierId?: string | null;
  format?: "solo" | "duo" | "crew" | null;
}): Promise<EventActionResult> {
  const parsed = z
    .object({
      tenantId: z.string().uuid(),
      eventId: z.string().uuid(),
      kind: z.enum(["spectator", "participant"]),
      name: z.string().trim().min(1).max(80),
      ticketTierId: z.string().uuid().nullable().optional(),
      format: z.enum(FORMATS).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Who is it?" };
  const supabase = await requireUser();
  try {
    await addEventWalkIn(supabase, parsed.data);
    revalidateEvents(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not add them" };
  }
}
