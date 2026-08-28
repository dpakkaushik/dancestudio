/** Step 21 — events. Lifted from the prototype's event record (EVENT_STORE 912),
 *  its form (S_eventform 15759) and the shared constants: three categories
 *  (auditions were removed, 2989), entries by format with their own price and
 *  places, spectator tiers with theirs, and a publish rule stated once
 *  (dosEventBlockers 3061). */

export type EventCat = "showcase" | "battle" | "tournament";
export type EntryFormat = "solo" | "duo" | "crew";
export type EventEntryHeadline = "none" | EntryFormat | "all" | "mixed";
export type EventStatus = "draft" | "published" | "completed";

/** EV_TINT (3134): an event wears the colour of its KIND */
export const EV_TINT: Record<EventCat, string> = { showcase: "#F59E0B", battle: "#DC2626", tournament: "#7C3AED" };
/** TYPE_LABEL (584) */
export const TYPE_LABEL: Record<EventCat, string> = { battle: "Battle tournament", tournament: "Tournament", showcase: "Showcase" };
/** the form's own words for each kind (CATS 15762) */
export const EVENT_CATS: Array<{ k: EventCat; label: string; sub: string; c: string }> = [
  { k: "showcase", label: "Showcase", sub: "Performances · ticketed", c: "#F59E0B" },
  { k: "battle", label: "Battle Tournament", sub: "Knockout brackets", c: "#DC2626" },
  { k: "tournament", label: "Tournament", sub: "Round based · scored", c: "#7C3AED" },
];
/** EV_FORMATS (3017) */
export const EV_FORMATS: Array<[EntryFormat | "all", string, string]> = [
  ["solo", "Solo", "one dancer"],
  ["duo", "Duet", "two dancers"],
  ["crew", "Crew", "a whole crew"],
  ["all", "All formats", "anyone may enter"],
];
export const FORMAT_WORD: Record<EntryFormat, string> = { solo: "Solo", duo: "Duet", crew: "Crew" };
/** EVENT_CRITERIA (1943) — what the panel scores on; printed, not yet scored */
export const EVENT_CRITERIA: Record<EventCat, string[]> = {
  battle: ["Technique", "Musicality", "Execution", "Battle IQ"],
  tournament: ["Technique", "Choreography", "Expression", "Timing"],
  showcase: ["Choreography", "Expression"],
};

/* the ceilings, in one place, so the form and anything that reads it agree (15770) */
export const EV_NAME_WORDS = 8;
export const EV_NAME_CHARS = 64;
export const EV_MAX_TICKETS = 5000;
export const EV_MAX_ENTRIES = 500;

/** a showcase is WATCHED — its line-up is the host's; everything else is entered (3041) */
export const takesEntries = (cat: EventCat) => cat !== "showcase";

export interface EventEntryTier {
  id: string;
  format: EntryFormat;
  feeInr: number;
  /** 0 means "up to the most" (EV_MAX_ENTRIES) */
  capacity: number;
  /** entries booked so far */
  entered: number;
}

export interface EventTicketTier {
  id: string;
  name: string;
  priceInr: number;
  capacity: number;
  sort: number;
  /** seats booked so far */
  sold: number;
}

export interface DanceEvent {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCity: string | null;
  cat: EventCat;
  title: string;
  style: string;
  startDate: string;
  endDate: string;
  /** "18:00" */
  startTime: string;
  venue: string;
  address: string | null;
  city: string;
  mapsUrl: string;
  about: string | null;
  entryFormat: EventEntryHeadline;
  bracket: number;
  rounds: number;
  prizes: number[];
  ticketsOn: boolean;
  status: EventStatus;
  shareSlug: string;
  poster: string | null;
  entryTiers: EventEntryTier[];
  ticketTiers: EventTicketTier[];
}

export interface EventBooking {
  id: string;
  eventId: string;
  userId: string | null;
  kind: "spectator" | "participant";
  ticketTierId: string | null;
  ticketTierName: string | null;
  entryFormat: EntryFormat | null;
  qty: number;
  /** who the register prints: the account's name, a crew, a duet, a walk-in */
  name: string;
  partnerName: string | null;
  /** Step 22: the duet partner as a person, asked — and whether they answered */
  partnerId: string | null;
  partnerStatus: "asked" | "confirmed" | "rejected" | null;
  /** Step 22: the crew a crew entry is for, entered by the person who leads it */
  crewId: string | null;
  amountInr: number;
  status: "booked" | "cancelled";
  checkedInAt: string | null;
  createdAt: string;
}

/** A ticket you hold, with the event it is for — the "your tickets" shelf. */
export interface MyEventBooking extends EventBooking {
  eventTitle: string;
  eventCat: EventCat;
  eventShareSlug: string;
  startDate: string;
  startTime: string;
  venue: string;
  city: string;
}

/** The headline for who may enter, from the tiers first (dosEntryLabel 3028):
 *  three open is All, one is its name, two is neither — say both. */
export const entryLabelOf = (e: { entryTiers: EventEntryTier[]; entryFormat: EventEntryHeadline; cat: EventCat }): string | null => {
  if (!takesEntries(e.cat)) return null;
  const open = e.entryTiers.map((t) => t.format);
  if (open.length === 3) return "All formats";
  if (open.length) return open.map((k) => FORMAT_WORD[k]).join("/");
  if (e.entryFormat === "all") return "All formats";
  if (e.entryFormat === "solo" || e.entryFormat === "duo" || e.entryFormat === "crew") return FORMAT_WORD[e.entryFormat];
  return null;
};

/** the cheapest way in (normEvent 2775): Free only when every way in costs nothing */
export const eventPriceLabel = (e: { entryTiers: EventEntryTier[]; ticketTiers: EventTicketTier[]; ticketsOn: boolean }): string => {
  const all = [...(e.ticketsOn ? e.ticketTiers.map((t) => t.priceInr) : []), ...e.entryTiers.map((t) => t.feeInr)];
  if (!all.length) return "Free";
  const paid = all.filter((n) => n > 0);
  return paid.length ? `₹${Math.min(...paid)}` : "Free";
};

export const seatCapacityOf = (e: { ticketTiers: EventTicketTier[]; ticketsOn: boolean }) =>
  e.ticketsOn ? e.ticketTiers.reduce((a, t) => a + t.capacity, 0) : 0;
export const seatsSoldOf = (e: { ticketTiers: EventTicketTier[] }) => e.ticketTiers.reduce((a, t) => a + t.sold, 0);
export const entryCapacityOf = (e: { entryTiers: EventEntryTier[]; bracket: number }) => {
  const fromTiers = e.entryTiers.reduce((a, t) => a + (t.capacity || 0), 0);
  return fromTiers || e.bracket || 0;
};
export const entriesOf = (e: { entryTiers: EventEntryTier[] }) => e.entryTiers.reduce((a, t) => a + t.entered, 0);

/** The publish rule as the form reads it while you type (dosEventBlockers) —
 *  the database says the same sentences in `event_blockers`. */
export const eventBlockers = (e: {
  cat: EventCat | null;
  ticketsOn: boolean;
  ticketTiers: Array<{ name: string; capacity: number }>;
  entryTiers: Array<{ format: EntryFormat; capacity: number }>;
}): string[] => {
  const out: string[] = [];
  if (!e.cat) return ["Pick an event type"];
  if (e.ticketsOn) {
    if (!e.ticketTiers.length) out.push("Add a ticket tier, or turn spectator tickets off");
    e.ticketTiers.forEach((t) => {
      if (!(t.capacity > 0)) out.push(`"${t.name || "A tier"}" has no seats — say how many are on sale`);
    });
  }
  if (takesEntries(e.cat)) {
    if (!e.entryTiers.length) out.push("Open at least one way in — solo, duet or crew");
    e.entryTiers.forEach((t) => {
      if (!(t.capacity > 0)) out.push(`${FORMAT_WORD[t.format]} entries have no places — say how many`);
    });
  } else if (!(e.ticketsOn && e.ticketTiers.length)) {
    out.push("A showcase is watched — put tickets on sale before publishing");
  }
  return out;
};
