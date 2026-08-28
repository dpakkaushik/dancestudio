import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DanceEvent,
  EntryFormat,
  EventBooking,
  EventCat,
  EventEntryHeadline,
  EventStatus,
  MyEventBooking,
} from "@/types/event";

/** Step 21 reads and RPC wrappers. Events, tiers and bookings are RLS-shaped:
 *  members read their tenant's (drafts included), the public reads published
 *  events of listed tenants, and bookings are the holder's and the organiser's.
 *  Sold counts are never stored — `event_counts` sums live bookings, so a
 *  cancellation frees a seat by arithmetic. */

const MAX_LIST = 200;

interface EntryTierRow {
  id: string;
  format: EntryFormat;
  fee_inr: number;
  capacity: number;
  deleted_at: string | null;
}
interface TicketTierRow {
  id: string;
  name: string;
  price_inr: number;
  capacity: number;
  sort: number;
  deleted_at: string | null;
}
interface EventRow {
  id: string;
  tenant_id: string;
  cat: EventCat;
  title: string;
  style: string;
  start_date: string;
  end_date: string;
  start_time: string;
  venue: string;
  address: string | null;
  city: string;
  maps_url: string;
  about: string | null;
  entry_format: EventEntryHeadline;
  bracket: number;
  rounds: number;
  prizes: number[] | null;
  tickets_on: boolean;
  status: EventStatus;
  share_slug: string;
  poster: string | null;
  tenants: { name: string; city: string | null } | null;
  event_entry_tiers: EntryTierRow[] | null;
  event_ticket_tiers: TicketTierRow[] | null;
}
interface CountRow {
  event_id: string;
  ticket_tier_id: string | null;
  entry_format: EntryFormat | null;
  kind: "spectator" | "participant";
  n: number;
}
interface BookingRow {
  id: string;
  event_id: string;
  user_id: string | null;
  kind: "spectator" | "participant";
  ticket_tier_id: string | null;
  entry_format: EntryFormat | null;
  qty: number;
  entrant_name: string | null;
  partner_name: string | null;
  amount_inr: number;
  status: "booked" | "cancelled";
  checked_in_at: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  event_ticket_tiers: { name: string } | null;
}
interface MyBookingRow extends BookingRow {
  events: {
    title: string;
    cat: EventCat;
    share_slug: string;
    start_date: string;
    start_time: string;
    venue: string;
    city: string;
  } | null;
}

const EVENT_SELECT =
  "id, tenant_id, cat, title, style, start_date, end_date, start_time, venue, address, city, maps_url, about, entry_format, bracket, rounds, prizes, tickets_on, status, share_slug, poster, tenants (name, city), event_entry_tiers (id, format, fee_inr, capacity, deleted_at), event_ticket_tiers (id, name, price_inr, capacity, sort, deleted_at)";
const BOOKING_SELECT =
  "id, event_id, user_id, kind, ticket_tier_id, entry_format, qty, entrant_name, partner_name, amount_inr, status, checked_in_at, created_at, profiles (full_name), event_ticket_tiers (name)";

const toEvent = (r: EventRow, counts: CountRow[]): DanceEvent => ({
  id: r.id,
  tenantId: r.tenant_id,
  tenantName: r.tenants?.name ?? "",
  tenantCity: r.tenants?.city ?? null,
  cat: r.cat,
  title: r.title,
  style: r.style,
  startDate: r.start_date,
  endDate: r.end_date,
  startTime: String(r.start_time).slice(0, 5),
  venue: r.venue,
  address: r.address,
  city: r.city,
  mapsUrl: r.maps_url,
  about: r.about,
  entryFormat: r.entry_format,
  bracket: r.bracket,
  rounds: r.rounds,
  prizes: r.prizes ?? [],
  ticketsOn: r.tickets_on,
  status: r.status,
  shareSlug: r.share_slug,
  poster: r.poster,
  entryTiers: (r.event_entry_tiers ?? [])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => ["solo", "duo", "crew"].indexOf(a.format) - ["solo", "duo", "crew"].indexOf(b.format))
    .map((t) => ({
      id: t.id,
      format: t.format,
      feeInr: t.fee_inr,
      capacity: t.capacity,
      entered: counts
        .filter((c) => c.event_id === r.id && c.kind === "participant" && c.entry_format === t.format)
        .reduce((a, c) => a + Number(c.n), 0),
    })),
  ticketTiers: (r.event_ticket_tiers ?? [])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((t) => ({
      id: t.id,
      name: t.name,
      priceInr: t.price_inr,
      capacity: t.capacity,
      sort: t.sort,
      sold: counts.filter((c) => c.event_id === r.id && c.ticket_tier_id === t.id).reduce((a, c) => a + Number(c.n), 0),
    })),
});

async function countsFor(supabase: SupabaseClient, eventIds: string[]): Promise<CountRow[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc("event_counts", { p_event_ids: eventIds });
  if (error) {
    throw new Error(`events.counts failed: ${error.message}`);
  }
  return (data ?? []) as CountRow[];
}

async function hydrate(supabase: SupabaseClient, rows: EventRow[]): Promise<DanceEvent[]> {
  const counts = await countsFor(
    supabase,
    rows.map((r) => r.id)
  );
  return rows.map((r) => toEvent(r, counts));
}

/** The studio's whole events desk, any status — RLS admits members. */
export async function findEventsByTenant(supabase: SupabaseClient, tenantId: string): Promise<DanceEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`events.findByTenant failed: ${error.message}`);
  }
  return hydrate(supabase, (data ?? []) as unknown as EventRow[]);
}

export async function findEventById(supabase: SupabaseClient, eventId: string): Promise<DanceEvent | null> {
  const { data, error } = await supabase.from("events").select(EVENT_SELECT).eq("id", eventId).is("deleted_at", null).maybeSingle();
  if (error) {
    throw new Error(`events.findById failed: ${error.message}`);
  }
  if (!data) return null;
  return (await hydrate(supabase, [data as unknown as EventRow]))[0];
}

/** The public page's read — a stranger resolves a published event of a listed
 *  tenant, a member resolves their own draft too (RLS decides). */
export async function findEventBySlug(supabase: SupabaseClient, slug: string): Promise<DanceEvent | null> {
  const { data, error } = await supabase.from("events").select(EVENT_SELECT).eq("share_slug", slug).is("deleted_at", null).maybeSingle();
  if (error) {
    throw new Error(`events.findBySlug failed: ${error.message}`);
  }
  if (!data) return null;
  return (await hydrate(supabase, [data as unknown as EventRow]))[0];
}

/** Discover's Events tab: published, still to come, soonest first. */
export async function findPublishedEvents(supabase: SupabaseClient, todayKey: string, city?: string): Promise<DanceEvent[]> {
  let q = supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "published")
    .is("deleted_at", null)
    .gte("end_date", todayKey)
    .order("start_date", { ascending: true })
    .limit(50);
  if (city) q = q.eq("city", city);
  const { data, error } = await q;
  if (error) {
    throw new Error(`events.findPublished failed: ${error.message}`);
  }
  return hydrate(supabase, (data ?? []) as unknown as EventRow[]);
}

export interface EventPayload {
  cat: EventCat;
  title: string;
  style: string;
  start_date: string;
  end_date: string;
  start_time: string;
  venue: string;
  address: string | null;
  city: string;
  maps_url: string;
  about: string | null;
  entry_format: EventEntryHeadline;
  bracket: number;
  rounds: number;
  prizes: number[];
  tickets_on: boolean;
  entry_tiers: Array<{ format: EntryFormat; fee_inr: number; capacity: number }>;
  ticket_tiers: Array<{ id?: string; name: string; price_inr: number; capacity: number; sort: number }>;
}

export async function saveEvent(supabase: SupabaseClient, tenantId: string, eventId: string | null, payload: EventPayload): Promise<string> {
  const { data, error } = await supabase.rpc("save_event", { p_tenant_id: tenantId, p_event_id: eventId, p_event: payload });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function publishEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.rpc("publish_event", { p_event_id: eventId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function setEventStatus(supabase: SupabaseClient, eventId: string, status: "draft" | "completed"): Promise<void> {
  const { error } = await supabase.rpc("set_event_status", { p_event_id: eventId, p_status: status });
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_event", { p_event_id: eventId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function bookEvent(
  supabase: SupabaseClient,
  input: {
    eventId: string;
    kind: "spectator" | "participant";
    ticketTierId?: string | null;
    qty?: number;
    format?: EntryFormat | null;
    entrantName?: string | null;
    partnerName?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("book_event", {
    p_event_id: input.eventId,
    p_kind: input.kind,
    p_ticket_tier_id: input.ticketTierId ?? null,
    p_qty: input.qty ?? 1,
    p_format: input.format ?? null,
    p_entrant_name: input.entrantName ?? null,
    p_partner_name: input.partnerName ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

export async function cancelEventBooking(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_event_booking", { p_booking_id: bookingId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function checkInEventBooking(supabase: SupabaseClient, bookingId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc("check_in_event_booking", { p_booking_id: bookingId, p_in: on });
  if (error) {
    throw new Error(error.message);
  }
}

export async function addEventWalkIn(
  supabase: SupabaseClient,
  input: { eventId: string; kind: "spectator" | "participant"; name: string; ticketTierId?: string | null; format?: EntryFormat | null }
): Promise<void> {
  const { error } = await supabase.rpc("add_event_walk_in", {
    p_event_id: input.eventId,
    p_kind: input.kind,
    p_name: input.name,
    p_ticket_tier_id: input.ticketTierId ?? null,
    p_format: input.format ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

const toBooking = (r: BookingRow): EventBooking => ({
  id: r.id,
  eventId: r.event_id,
  userId: r.user_id,
  kind: r.kind,
  ticketTierId: r.ticket_tier_id,
  ticketTierName: r.event_ticket_tiers?.name ?? null,
  entryFormat: r.entry_format,
  qty: r.qty,
  name: r.entrant_name ?? r.profiles?.full_name ?? "Someone",
  partnerName: r.partner_name,
  amountInr: r.amount_inr,
  status: r.status,
  checkedInAt: r.checked_in_at,
  createdAt: r.created_at,
});

/** The register — RLS admits the organiser's members. Live bookings only. */
export async function findEventBookings(supabase: SupabaseClient, eventId: string): Promise<EventBooking[]> {
  const { data, error } = await supabase
    .from("event_bookings")
    .select(BOOKING_SELECT)
    .eq("event_id", eventId)
    .eq("status", "booked")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    throw new Error(`events.findBookings failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as BookingRow[]).map(toBooking);
}

/** Your tickets and entries, soonest first — says `user_id = me` out loud. */
export async function findMyEventBookings(supabase: SupabaseClient, userId: string): Promise<MyEventBooking[]> {
  const { data, error } = await supabase
    .from("event_bookings")
    .select(`${BOOKING_SELECT}, events (title, cat, share_slug, start_date, start_time, venue, city)`)
    .eq("user_id", userId)
    .eq("status", "booked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`events.findMyBookings failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as MyBookingRow[])
    .filter((r) => r.events)
    .map((r) => ({
      ...toBooking(r),
      eventTitle: r.events!.title,
      eventCat: r.events!.cat,
      eventShareSlug: r.events!.share_slug,
      startDate: r.events!.start_date,
      startTime: String(r.events!.start_time).slice(0, 5),
      venue: r.events!.venue,
      city: r.events!.city,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
