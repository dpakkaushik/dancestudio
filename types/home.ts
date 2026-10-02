import type { ClassArtist } from "@/types/classPerson";
import type { DanceClass } from "@/types/class";
import type { ClassBookingStatus } from "@/types/classBooking";

/** Parity slice H10 — Home's PassDeck (prototype 6863-7204). Nothing new is
 *  stored: a deck row is a class session seen on ONE day from the side you are
 *  on — booked, assisting, teaching, or (a studio's Home) what is running in
 *  your rooms.
 *
 *  ⚠ IT CARRIED EVENTS TOO UNTIL 29 Sep 2026 (the user: *"Remove Organization
 *  and Events completely"*), which is why `DeckItem` was a union and every row
 *  carries a `kind`. Both are kept: the union has one member today and the deck
 *  is still the one rail in this app that mixes what it is given, so a second
 *  kind of thing to be on somebody's day arrives as a member rather than as a
 *  rewrite. */

/** What this session is to you — the chip the card wears (prototype roleOf 7003-7008,
 *  and "At your studio" 7056). Home shows the whole day in one list, so the card
 *  has to say it; every other surface passes none and the chip is absent.
 *  ⚠ `Spectator`, `Competing` and `Running` went with events (29 Sep 2026). */
export type DeckRole = "Booked" | "Waitlisted" | "Assisting" | "Teaching" | "At your studio";

/** Where a card stands in today (2 Oct 2026, the user: "once class completed for
 *  today it should move on the left … completed status same as live with red
 *  border … upcoming classes yellow border"). Decided by the LIST off the clock
 *  the server already read, never by the card: `done` has ended, `live` is the
 *  one winner, `upcoming` is everything else — which includes a session that has
 *  started but lost the Live dead heat, because exactly one card is live. */
export type DeckState = "done" | "live" | "upcoming";

interface DeckBase {
  /** "class:<sessionId>" — unique in the rail */
  key: string;
  roleLabel: DeckRole;
  /** you run it — wins a dead heat for the Live badge (7093-7097) */
  host: boolean;
  startsAt: string;
  endsAt: string;
  /** exactly one card in the deck is live, decided by the list (7084-7104) */
  live: boolean;
  /** done · live · upcoming — the card's frame on Home, and its place in the rail */
  state: DeckState;
  /** where the card's sleeve opens */
  href: string;
}

export interface DeckClassItem extends DeckBase {
  kind: "class";
  danceClass: DanceClass;
  /** seats taken, for the tile's "N spots left" */
  filled: number;
  /** ⚠ carried, no longer PRINTED on the card (18 Sep 2026) — a studio's name is
   *  the booking page's to say. Kept because the deck's own words read from it */
  businessName: string;
  businessCity: string | null;
  /** the confirmed teacher, whose face the card's centre wears */
  artist: ClassArtist | null;
  /** your own booking, when you hold one — its id is the entry code */
  classBooking: { id: string; status: ClassBookingStatus } | null;
  /** the door has let you in (a live attendance row on your booking) — the card
   *  says "✓ Checked in". ⚠ `receipt` went with the deck's Invoice (2 Oct 2026) */
  checkedIn: boolean;
}

export type DeckItem = DeckClassItem;
