import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingWords } from "@/features/events/components/event-kit";
import { addDays, dayKeyOf } from "@/lib/format/month";
import type { CalendarEntry } from "@/types/calendar";
import type { DanceClass } from "@/types/class";
import type { DanceEvent, MyEventBooking } from "@/types/event";
import type { DeckClassItem, DeckEventItem, DeckItem, DeckRole } from "@/types/home";
import type { Tenant } from "@/types/tenant";
import { findMyCalendar, findTenantCalendar } from "./calendar";
import { findEventBySlug, findEventsByTenants, findMyEventBookings } from "./events";
import { findPaidReceiptsByEnrollments } from "./payments";

/** Home's PassDeck reads (prototype 6863-7104). No table, no RPC, no policy: the
 *  deck is TODAY's slice of rows that already exist — the calendar's three sides
 *  (a booking is Train, a confirmed artist claim is Teach, a confirmed assistant
 *  claim is Assist), the event tickets you hold, the events your businesses run,
 *  and, on a studio's Home, every session in its rooms. Every read below is one
 *  the calendar, the bookings list or the managed list already makes; this file
 *  only asks them for one day and says which side each row is on. */

const IST_OFFSET = "+05:30";
const dayStartIso = (dayKey: string) => `${dayKey}T00:00:00${IST_OFFSET}`;

/** the IST day `nowIso` falls on, as the half-open window a range query wants */
const todayWindow = (nowIso: string) => {
  const today = dayKeyOf(nowIso);
  return { today, from: dayStartIso(today), to: dayStartIso(addDays(today, 1)) };
};

/* the calendar entry as the one class card draws it — the same mapping the
   calendar screen and /my-classes make (the tile draws its own poster from the
   title; the entry carries neither poster nor room id) */
const classOf = (e: CalendarEntry): DanceClass => ({
  id: e.classId,
  tenantId: "",
  title: e.title,
  shareSlug: e.shareSlug,
  style: e.style,
  level: e.level,
  room: e.room,
  roomId: null,
  poster: null,
  priceInr: e.priceInr,
  capacity: e.capacity,
  status: e.classStatus,
  session: { id: e.sessionId, startsAt: e.startsAt, endsAt: e.endsAt },
});

/* an event's day on the IST clock the form took it in (managed.ts does the same);
   it has no end time, so it runs to the end of its last day */
const eventSpan = (e: DanceEvent) => ({
  startsAt: `${e.startDate}T${e.startTime}:00${IST_OFFSET}`,
  endsAt: `${e.endDate || e.startDate}T23:59:59${IST_OFFSET}`,
});
const eventOnDay = (e: DanceEvent, today: string) => e.startDate <= today && today <= (e.endDate || e.startDate);

const classItem = (e: CalendarEntry, roleLabel: DeckRole, host: boolean, receipt: DeckClassItem["receipt"]): DeckClassItem => ({
  kind: "class",
  key: `class:${e.sessionId}`,
  roleLabel,
  host,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  live: false,
  href: `/c/${e.shareSlug}`,
  danceClass: classOf(e),
  filled: e.filled,
  tenantName: e.tenantName,
  tenantCity: e.tenantCity,
  enrollment: e.enrollment,
  receipt,
});

const eventItem = (ev: DanceEvent, roleLabel: DeckRole, host: boolean, href: string, booking: DeckEventItem["booking"]): DeckEventItem => ({
  kind: "event",
  key: `event:${ev.id}`,
  roleLabel,
  host,
  ...eventSpan(ev),
  live: false,
  href,
  event: ev,
  booking,
});

/** ONE THING IS RUNNING, AND IT IS THE FIRST TILE (prototype 7084-7104). The
 *  winner is the live session that started most recently — the room you are
 *  actually in — and yours wins a dead heat. Every other card is told it is not
 *  live, so two rows the clock cannot tell apart can never both wear the badge.
 *  The rest of the day follows in the order the day happens. */
const settle = (rows: DeckItem[], nowMs: number): DeckItem[] => {
  const startMs = (r: DeckItem) => new Date(r.startsAt).getTime();
  const winner =
    rows
      .filter((r) => startMs(r) <= nowMs && nowMs < new Date(r.endsAt).getTime())
      .sort((a, b) => startMs(b) - startMs(a) || (a.host ? 0 : 1) - (b.host ? 0 : 1))[0] ?? null;
  return rows
    .map((r) => ({ ...r, live: winner !== null && r.key === winner.key }))
    .sort((a, b) => (a.live ? 0 : 1) - (b.live ? 0 : 1) || a.startsAt.localeCompare(b.startsAt));
};

/** One person's day: what they train in, assist on and teach today, the event
 *  tickets they hold for today, and the events their businesses are running.
 *  Drafts are not "on" and never appear (the prototype's hosting side reads
 *  Published only, 6934). */
export async function findMyDeck(supabase: SupabaseClient, userId: string, nowIso: string, tenants: Tenant[]): Promise<DeckItem[]> {
  const { today, from, to } = todayWindow(nowIso);
  const tenantIds = tenants.map((t) => t.id);
  const [entries, tickets, hosted] = await Promise.all([
    findMyCalendar(supabase, userId, from, to),
    findMyEventBookings(supabase, userId),
    tenantIds.length ? findEventsByTenants(supabase, tenantIds) : Promise.resolve([] as DanceEvent[]),
  ]);

  const live = entries.filter((e) => e.classStatus !== "draft");
  // one read for every paid seat on the day, not one per card
  const receipts = await findPaidReceiptsByEnrollments(
    supabase,
    live.filter((e) => e.enrollment?.status === "enrolled").map((e) => e.enrollment!.id)
  );

  const rows: DeckItem[] = live.map((e) => {
    const role: DeckRole =
      e.side === "hosting" ? "Teaching" : e.side === "assisting" ? "Assisting" : e.enrollment?.status === "waitlisted" ? "Waitlisted" : "Booked";
    const r = e.enrollment ? receipts.get(e.enrollment.id) : undefined;
    return classItem(e, role, e.side === "hosting", r ? { amountInr: r.amountInr, method: r.method } : null);
  });

  // events you run today — the manager's door behind the card (7020, target "eventmanage")
  const running = hosted.filter((ev) => ev.status === "published" && eventOnDay(ev, today));
  const runningIds = new Set(running.map((ev) => ev.id));
  for (const ev of running) {
    rows.push(eventItem(ev, "Running", true, `/business/${ev.tenantId}/events/${ev.id}`, null));
  }

  // tickets and entries for today — one card per event, however many you hold on
  // it (the register lists them; the deck says you are going). An event you run
  // is already here on the running side, which outranks a seat on it.
  //
  // A booking carries only its event's START date, and a festival runs for days:
  // so the shortlist is every booking that has started (a window back, because a
  // ticket to something long over is not today's business) and the EVENT decides
  // whether today is one of its days.
  const OLDEST = addDays(today, -30);
  const byEvent = new Map<string, MyEventBooking>();
  for (const t of tickets) {
    if (t.startDate > today || t.startDate < OLDEST) continue;
    if (runningIds.has(t.eventId) || byEvent.has(t.eventId)) continue;
    byEvent.set(t.eventId, t);
  }
  const held = [...byEvent.values()];
  const events = await Promise.all(held.map((t) => findEventBySlug(supabase, t.eventShareSlug)));
  events.forEach((ev, i) => {
    if (!ev || !eventOnDay(ev, today)) return;
    const t = held[i];
    rows.push(eventItem(ev, t.kind === "participant" ? "Competing" : "Spectator", false, `/e/${ev.shareSlug}`, { id: t.id, words: bookingWords(t) }));
  });

  return settle(rows, new Date(nowIso).getTime());
}

/** A studio's day is not a person's day (prototype 7022-7060): what is running
 *  in ITS rooms today — every published session of the business and every event
 *  it is running — drawn by the same card, in the same rail, as everybody else's. */
export async function findStudioDeck(supabase: SupabaseClient, tenant: Tenant, nowIso: string): Promise<DeckItem[]> {
  const { today, from, to } = todayWindow(nowIso);
  const [entries, events] = await Promise.all([
    findTenantCalendar(supabase, tenant.id, { name: tenant.name, city: tenant.city }, from, to),
    findEventsByTenants(supabase, [tenant.id]),
  ]);
  const rows: DeckItem[] = entries.filter((e) => e.classStatus !== "draft").map((e) => classItem(e, "At your studio", true, null));
  for (const ev of events) {
    if (ev.status === "published" && eventOnDay(ev, today)) {
      rows.push(eventItem(ev, "Running", true, `/business/${ev.tenantId}/events/${ev.id}`, null));
    }
  }
  return settle(rows, new Date(nowIso).getTime());
}
