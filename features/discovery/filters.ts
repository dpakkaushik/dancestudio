import { hourOf } from "@/lib/format/month";
import type { PublicClassListing } from "@/types/class";
import type { CrewSummary } from "@/types/crew";
import { eventPriceLabel, type DanceEvent, type EntryFormat, type EventCat } from "@/types/event";
import type { NearbyTenant } from "@/repositories/discovery";

/** Step 23 — the filters as URL state, and WHAT THE SHEET ACTUALLY DOES
 *  (prototype 4456-4460): "One set of predicates, applied to whichever list is
 *  on screen. Distance only bites on records that carry a distance; time-of-day
 *  and duration are read off the clock … A filter that cannot be evaluated does
 *  not silently empty the list — it stands aside." Pure: the page and the
 *  client sheet both read this, and nothing here touches a clock or the DOM. */

export type SortBy = "near" | "soon" | "price";
export type Dist = "any" | "2" | "5" | "10";
export type When = "any" | "morning" | "afternoon" | "evening";
export type Dur = "any" | "60" | "90" | "120";
export type PriceBand = "free" | "paid";
export type Fmt = "all" | EntryFormat;

export interface DiscoverFilters {
  styles: string[];
  sort: SortBy;
  dist: Dist;
  when: When;
  dur: Dur;
  prices: PriceBand[];
  cats: EventCat[];
  fmt: Fmt;
  /** the events tab's own box (S_eventslist 13551) */
  q: string;
}

export const DEFAULT_FILTERS: DiscoverFilters = { styles: [], sort: "near", dist: "any", when: "any", dur: "any", prices: [], cats: [], fmt: "all", q: "" };

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
const listOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] =>
  [...new Set((v ?? "").split(",").map((s) => s.trim()).filter((s) => (allowed as readonly string[]).includes(s)))] as T[];

export const CATS = ["showcase", "battle", "tournament"] as const;

/** the URL → the filters; anything unrecognised falls back, never throws */
export function parseFilters(params: Record<string, string | undefined>, styleNames: readonly string[]): DiscoverFilters {
  return {
    styles: listOf(params.styles, styleNames),
    sort: oneOf(params.sort, ["near", "soon", "price"] as const, "near"),
    dist: oneOf(params.dist, ["any", "2", "5", "10"] as const, "any"),
    when: oneOf(params.when, ["any", "morning", "afternoon", "evening"] as const, "any"),
    dur: oneOf(params.dur, ["any", "60", "90", "120"] as const, "any"),
    prices: listOf(params.price, ["free", "paid"] as const),
    cats: listOf(params.cat, CATS),
    fmt: oneOf(params.fmt, ["all", "solo", "duo", "crew"] as const, "all"),
    q: (params.q ?? "").slice(0, 60),
  };
}

/** the filters → the URL, defaults left out so a clean list has a clean address */
export function filtersToParams(f: DiscoverFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.styles.length) out.styles = f.styles.join(",");
  if (f.sort !== "near") out.sort = f.sort;
  if (f.dist !== "any") out.dist = f.dist;
  if (f.when !== "any") out.when = f.when;
  if (f.dur !== "any") out.dur = f.dur;
  if (f.prices.length) out.price = f.prices.join(",");
  if (f.cats.length) out.cat = f.cats.join(",");
  if (f.fmt !== "all") out.fmt = f.fmt;
  if (f.q.trim()) out.q = f.q.trim();
  return out;
}

/** how many the Filters button says are on (4664) — the style rail is its own control */
export const filtersOnCount = (f: DiscoverFilters, tab: string): number =>
  (tab === "events" ? (f.cats.length ? 1 : 0) + (f.fmt !== "all" ? 1 : 0) : 0) +
  (f.prices.length ? 1 : 0) +
  (f.dist !== "any" ? 1 : 0) +
  (f.when !== "any" ? 1 : 0) +
  (tab === "classes" && f.dur !== "any" ? 1 : 0) +
  (f.sort !== "near" ? 1 : 0);

/* ── the predicates ── */

const whenOfHour = (h: number): Exclude<When, "any"> => (h < 12 ? "morning" : h < 17 ? "afternoon" : "evening");
const priceBandOk = (prices: PriceBand[], amount: number): boolean => prices.length === 0 || prices.length === 2 || (prices[0] === "free" ? amount === 0 : amount > 0);
const styleOk = (styles: string[], style: string): boolean => styles.length === 0 || style === "All styles" || styles.includes(style);
const minutesOf = (startsAt: string, endsAt: string): number => Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);

export function filterClasses(list: PublicClassListing[], f: DiscoverFilters): PublicClassListing[] {
  const out = list.filter((c) => {
    if (!styleOk(f.styles, c.style)) return false;
    if (!priceBandOk(f.prices, c.priceInr)) return false;
    if (f.when !== "any" && c.session && whenOfHour(hourOf(c.session.startsAt)) !== f.when) return false;
    if (f.dur !== "any" && c.session && minutesOf(c.session.startsAt, c.session.endsAt) > Number(f.dur)) return false;
    return true;
  });
  if (f.sort === "soon") return out.sort((a, b) => (a.session?.startsAt ?? "").localeCompare(b.session?.startsAt ?? ""));
  if (f.sort === "price") return out.sort((a, b) => a.priceInr - b.priceInr);
  return out; /* "near" — a class carries no distance of its own; the list stands as it came */
}

/** businesses: distance bites here (the one list that carries one); a style
 *  narrows to businesses with a published class in it (the caller passes that map) */
export function filterTenants(list: NearbyTenant[], f: DiscoverFilters, stylesByTenant: Map<string, string[]>): NearbyTenant[] {
  const out = list.filter((t) => {
    if (f.dist !== "any" && t.distanceKm > Number(f.dist)) return false;
    if (f.styles.length && !(stylesByTenant.get(t.id) ?? []).some((s) => f.styles.includes(s))) return false;
    return true;
  });
  return out.sort((a, b) => a.distanceKm - b.distanceKm); /* nearest first is the only order a business has */
}

export function filterCrews(list: CrewSummary[], f: DiscoverFilters): CrewSummary[] {
  return list.filter((c) => styleOk(f.styles, c.style));
}

const eventMinPrice = (e: DanceEvent): number => {
  const label = eventPriceLabel(e);
  return label === "Free" ? 0 : Number(label.replace(/[^\d]/g, "")) || 0;
};

export function filterEvents(list: DanceEvent[], f: DiscoverFilters): DanceEvent[] {
  const q = f.q.trim().toLowerCase();
  const out = list.filter((e) => {
    if (f.cats.length && !f.cats.includes(e.cat)) return false;
    if (f.fmt !== "all" && !e.entryTiers.some((t) => t.format === f.fmt)) return false;
    if (!styleOk(f.styles, e.style)) return false;
    if (!priceBandOk(f.prices, eventMinPrice(e))) return false;
    if (f.when !== "any" && whenOfHour(Number(e.startTime.slice(0, 2))) !== f.when) return false;
    if (q && !`${e.title} ${e.style} ${e.tenantName}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (f.sort === "price") return out.sort((a, b) => eventMinPrice(a) - eventMinPrice(b));
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate)); /* soonest first, for "near" too — an event's city is the filter */
}

/** the radius the businesses query asks for — the sheet's distance, or the default 25 km */
export const radiusOf = (f: DiscoverFilters): number => (f.dist === "any" ? 25 : Number(f.dist));
