import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayKeyOf } from "@/lib/format/month";
import { tileClassOf, type CalendarEntry } from "@/types/calendar";
import { SIDE_RELATION } from "@/lib/format/classLabels";
import type { DeckClassItem, DeckItem, DeckRole, DeckState } from "@/types/home";
import type { Business } from "@/types/business";
import { findMyCalendar, findBusinessCalendar } from "./calendar";

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
 *  `findEventsByBusinesses`, and a `findEventBySlug` PER EVENT HELD), so a person's
 *  Home is materially cheaper than it was: what is left is one calendar read and
 *  one receipts read for the whole day. */

const IST_OFFSET = "+05:30";
const dayStartIso = (dayKey: string) => `${dayKey}T00:00:00${IST_OFFSET}`;

/** the IST day `nowIso` falls on, as the half-open window a range query wants */
const todayWindow = (nowIso: string) => {
  const today = dayKeyOf(nowIso);
  return { today, from: dayStartIso(today), to: dayStartIso(addDays(today, 1)) };
};

/* the calendar entry as the one class card draws it — ⚠ the SAME conversion the
   calendar and the profile pages use (`tileClassOf`, 4 Oct 2026). This was a
   second copy of it, and the second copy is what would have left the deck's
   cards without the "By …" line the others gained. */
const classOf = tileClassOf;

/** Which of these seats of YOURS the door has let in — one live attendance row
 *  each (Step 10: checking out soft-deletes). Says `user_id` out loud: a studio's
 *  members read their whole register, and RLS is a ceiling, not a scope. A failed
 *  read is "nobody checked in", never an error on Home. */
export async function findMyCheckedInBookings(supabase: SupabaseClient, userId: string, bookingIds: string[]): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("attendance")
    .select("class_booking_id")
    .eq("user_id", userId)
    .in("class_booking_id", bookingIds)
    .is("deleted_at", null);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.class_booking_id as string));
}

const classItem = (e: CalendarEntry, roleLabel: DeckRole, host: boolean, checkedIn: boolean): DeckClassItem => ({
  kind: "class",
  key: `class:${e.sessionId}`,
  roleLabel,
  host,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  live: false,
  state: "upcoming",
  href: `/c/${e.shareSlug}`,
  danceClass: classOf(e),
  filled: e.filled,
  businessName: e.businessName,
  businessCity: e.businessCity,
  artist: e.artist,
  classBooking: e.classBooking,
  checkedIn,
});

/** ONE THING IS RUNNING, AND IT IS THE FIRST TILE (prototype 7084-7104). The
 *  winner is the live session that started most recently — the room you are
 *  actually in — and yours wins a dead heat. Every other card is told it is not
 *  live, so two rows the clock cannot tell apart can never both wear the badge.
 *
 *  ⚠ THE RAIL READS LEFT TO RIGHT AS THE DAY (2 Oct 2026, the user: "once class
 *  completed for today it should move on the left"): what has ENDED first, then
 *  the live one, then what is still to come — each group in time order. The deck
 *  no longer opens on the live card; it opens on the morning. */
const STATE_ORDER: Record<DeckState, number> = { done: 0, live: 1, upcoming: 2 };
const settle = (rows: DeckItem[], nowMs: number): DeckItem[] => {
  const startMs = (r: DeckItem) => new Date(r.startsAt).getTime();
  const endMs = (r: DeckItem) => new Date(r.endsAt).getTime();
  const winner =
    rows
      .filter((r) => startMs(r) <= nowMs && nowMs < endMs(r))
      .sort((a, b) => startMs(b) - startMs(a) || (a.host ? 0 : 1) - (b.host ? 0 : 1))[0] ?? null;
  return rows
    .map((r): DeckItem => {
      const live = winner !== null && r.key === winner.key;
      const state: DeckState = live ? "live" : endMs(r) <= nowMs ? "done" : "upcoming";
      return { ...r, live, state };
    })
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.startsAt.localeCompare(b.startsAt));
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
  // one read for every seat you hold today, not one per card
  const checkedIn = await findMyCheckedInBookings(
    supabase,
    userId,
    live.filter((e) => e.classBooking?.status === "enrolled").map((e) => e.classBooking!.id)
  );

  const rows: DeckItem[] = live.map((e) => {
    const role: DeckRole = SIDE_RELATION[e.side];
    return classItem(e, role, e.side === "hosting", Boolean(e.classBooking && checkedIn.has(e.classBooking.id)));
  });

  return settle(rows, new Date(nowIso).getTime());
}

/** A studio's day is not a person's day (prototype 7022-7060): what is running
 *  in ITS rooms today, drawn by the same card, in the same rail, as everybody
 *  else's. */
export async function findStudioDeck(supabase: SupabaseClient, business: Business, nowIso: string): Promise<DeckItem[]> {
  const { from, to } = todayWindow(nowIso);
  const entries = await findBusinessCalendar(supabase, business.id, { name: business.name, city: business.city }, from, to);
  const rows: DeckItem[] = entries.filter((e) => e.classStatus !== "draft").map((e) => classItem(e, "atYourStudio", true, false));
  return settle(rows, new Date(nowIso).getTime());
}
