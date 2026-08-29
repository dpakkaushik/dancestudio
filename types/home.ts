import type { DanceClass } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";
import type { DanceEvent } from "@/types/event";

/** Parity slice H10 — Home's PassDeck (prototype 6863-7204). Nothing new is
 *  stored: a deck row is a class session or an event seen on ONE day from the
 *  side you are on — booked, assisting, teaching, a ticket you hold, an event
 *  you run, or (a studio's Home) what is running in your rooms. */

/** What this session is to you — the chip the card wears (prototype roleOf 7003-7008,
 *  and "At your studio" 7056). Home shows the whole day in one list, so the card
 *  has to say it; every other surface passes none and the chip is absent. */
export type DeckRole = "Booked" | "Waitlisted" | "Assisting" | "Teaching" | "Spectator" | "Competing" | "Running" | "At your studio";

interface DeckBase {
  /** "class:<sessionId>" / "event:<eventId>" — unique across both kinds in one rail */
  key: string;
  roleLabel: DeckRole;
  /** you run it — wins a dead heat for the Live badge (7093-7097) */
  host: boolean;
  startsAt: string;
  endsAt: string;
  /** exactly one card in the deck is live, decided by the list (7084-7104) */
  live: boolean;
  /** where the card's sleeve opens */
  href: string;
}

export interface DeckClassItem extends DeckBase {
  kind: "class";
  danceClass: DanceClass;
  /** seats taken, for the tile's "N spots left" */
  filled: number;
  tenantName: string;
  tenantCity: string | null;
  /** your own booking, when you hold one — its id is the entry code */
  enrollment: { id: string; status: EnrollmentStatus } | null;
  /** what you paid for the seat, when it was paid for — the invoice's figures */
  receipt: { amountInr: number; method: string | null } | null;
}

export interface DeckEventItem extends DeckBase {
  kind: "event";
  event: DanceEvent;
  /** the ticket or entry you hold — its id is the entry code, its words the strip's line */
  booking: { id: string; words: string } | null;
}

export type DeckItem = DeckClassItem | DeckEventItem;
