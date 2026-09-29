import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayKeyOf } from "@/lib/format/month";
import type { CalendarEntry } from "@/types/calendar";
import type { DanceClass } from "@/types/class";
import type { DeckClassItem, DeckItem, DeckRole } from "@/types/home";
import type { Business } from "@/types/business";
import { findMyCalendar, findTenantCalendar } from "./calendar";
import { findPaidReceiptsByEnrollments } from "./payments";

/** Home's PassDeck reads (prototype 6863-7104). No table, no RPC, no policy: the
 *  deck is TODAY's slice of rows that already exist — the calendar's three sides
 *  (a booking is Train, a confirmed artist classPerson is Teach, a confirmed assistant
 *  classPerson is Assist), and, on a studio's Home, every session in its rooms. Every
 *  read below is one the calendar or the bookings list already makes; this file
 *  only asks them for one day and says which side each row is on.
 *
 *  ⚠ THE EVENT HALF WENT ON 29 Sep 2026 (the user: *"Remove Organization and
 *  Events completely"*) — the tickets you held, the entries you had made and the
 *  events your businesses ran. It took THREE reads with it (`findMyEventBookings`,
 *  `findEventsByTenants`, and a `findEventBySlug` PER EVENT HELD), so a person's
 *  Home is materially cheaper than it was: what is left is one calendar read and
 *  one receipts read for the whole day. */

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
  businessId: "",
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
  /* the calendar entry does not carry the venue; the deck's card does not draw it */
  venueBusinessId: null,
  venueStatus: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  /* a card stands in for the class; whose pass pays is the class’s own answer,
     read on its page — these carry the column defaults so the shape matches */
  allowsStudioMemberships: true,
  allowsArtistMemberships: false,
});

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
  businessName: e.businessName,
  tenantCity: e.tenantCity,
  artist: e.artist,
  classBooking: e.classBooking,
  receipt,
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

/** One person's day: what they train in, assist on and teach today. Drafts are
 *  not "on" and never appear (the prototype's hosting side reads Published only,
 *  6934).
 *
 *  ⚠ `businesses` WENT WITH EVENTS (29 Sep 2026). It named the businesses whose
 *  EVENTS were running today, which was the only thing on a person's deck that
 *  was not their own row. Dropped rather than left unread: a parameter nobody
 *  reads is a lie to the next reader, and there is one call site. */
export async function findMyDeck(supabase: SupabaseClient, userId: string, nowIso: string): Promise<DeckItem[]> {
  const { from, to } = todayWindow(nowIso);
  const entries = await findMyCalendar(supabase, userId, from, to);

  const live = entries.filter((e) => e.classStatus !== "draft");
  // one read for every paid seat on the day, not one per card
  const receipts = await findPaidReceiptsByEnrollments(
    supabase,
    live.filter((e) => e.classBooking?.status === "enrolled").map((e) => e.classBooking!.id)
  );

  const rows: DeckItem[] = live.map((e) => {
    const role: DeckRole =
      e.side === "hosting" ? "Teaching" : e.side === "assisting" ? "Assisting" : e.classBooking?.status === "waitlisted" ? "Waitlisted" : "Booked";
    const r = e.classBooking ? receipts.get(e.classBooking.id) : undefined;
    return classItem(e, role, e.side === "hosting", r ? { amountInr: r.amountInr, method: r.method } : null);
  });

  return settle(rows, new Date(nowIso).getTime());
}

/** A studio's day is not a person's day (prototype 7022-7060): what is running
 *  in ITS rooms today, drawn by the same card, in the same rail, as everybody
 *  else's. */
export async function findStudioDeck(supabase: SupabaseClient, business: Business, nowIso: string): Promise<DeckItem[]> {
  const { from, to } = todayWindow(nowIso);
  const entries = await findTenantCalendar(supabase, business.id, { name: business.name, city: business.city }, from, to);
  const rows: DeckItem[] = entries.filter((e) => e.classStatus !== "draft").map((e) => classItem(e, "At your studio", true, null));
  return settle(rows, new Date(nowIso).getTime());
}
