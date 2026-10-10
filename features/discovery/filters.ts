import { hourOf } from "@/lib/format/month";
import { STYLE_FAMILIES, stylesOfFamilies } from "@/lib/constants/styleInfo";
import type { PublicClassListing } from "@/types/class";
import type { CrewSummary } from "@/types/crew";
import type { NearbyBusiness } from "@/repositories/discovery";

/** Step 23 — the filters as URL state, and WHAT THE SHEET ACTUALLY DOES
 *  (prototype 4456-4460): "One set of predicates, applied to whichever list is
 *  on screen. Distance only bites on records that carry a distance; time-of-day
 *  and duration are read off the clock … A filter that cannot be evaluated does
 *  not silently empty the list — it stands aside." Pure: the page and the
 *  client sheet both read this, and nothing here touches a clock or the DOM. */

/** ⚠ "popular" and "az" are the STYLES tab's two orders (2 Oct 2026); "near"
 *  is every tab's default, and on Styles it means the shelf's own order —
 *  classical first, then the families mixed */
/** ⚠ EVERY TAB SORTS (10 Oct 2026, the user: "sort filters for all sections -
 *  classes, studio, crew, artist, styles"). "pricey" (most expensive first) and
 *  "members" (a crew's size) are new; "popular" means the tab's own popularity —
 *  most booked for a class, most followed for a studio, an artist and a crew,
 *  most classes for a style. Which words a tab offers is the sheet's decision
 *  (`SORTS_FOR`), and a word a tab does not offer leaves its list as it came. */
export type SortBy = "near" | "soon" | "price" | "pricey" | "popular" | "members" | "az";
const SORT_WORDS = ["near", "soon", "price", "pricey", "popular", "members", "az"] as const;
export type Dist = "any" | "2" | "5" | "10";
export type When = "any" | "morning" | "afternoon" | "evening";
export type Dur = "any" | "60" | "90" | "120";
export type PriceBand = "free" | "paid";

/** ⚠ `cats` (the event kinds), `fmt` (solo · duo · crew) and their `Fmt` type
 *  went with events on 29 Sep 2026, and so did the Events tab's own search box
 *  that `q` fed (S_eventslist 13551). `q` stays because the sheet still parses
 *  it out of the URL and a link somebody was handed may carry one — it simply
 *  narrows nothing now. */
export interface DiscoverFilters {
  styles: string[];
  /** dance-style FAMILIES (2 Oct 2026, the user: "family for dance style in
   *  filters as well") — see `effectiveStyles` for how the two combine */
  fams: string[];
  /** Styles tab only: just the styles with a class in this city */
  has: boolean;
  sort: SortBy;
  dist: Dist;
  when: When;
  dur: Dur;
  /** ⚠ kept for links already handed out; the sheet's PRICE row is the range below now */
  prices: PriceBand[];
  /** THE PRICE RANGE, in whole rupees (10 Oct 2026, the user: "a price range bar
   *  which can slide from both ends"). Null is "no bound on this side", so a
   *  bar left at its two ends narrows nothing and does not count as on. */
  pmin: number | null;
  pmax: number | null;
  q: string;
}

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
const listOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] =>
  [...new Set((v ?? "").split(",").map((s) => s.trim()).filter((s) => (allowed as readonly string[]).includes(s)))] as T[];

/** a rupee bound out of the address: a whole number from 0 to ten lakh, or none */
const rupeesOf = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
};

/** the URL → the filters; anything unrecognised falls back, never throws */
export function parseFilters(params: Record<string, string | undefined>, styleNames: readonly string[]): DiscoverFilters {
  let pmin = rupeesOf(params.pmin);
  let pmax = rupeesOf(params.pmax);
  /* a hand-written range the wrong way round is read the right way round */
  if (pmin !== null && pmax !== null && pmin > pmax) [pmin, pmax] = [pmax, pmin];
  if (pmin === 0) pmin = null;
  return {
    styles: listOf(params.styles, styleNames),
    fams: listOf(params.fam, STYLE_FAMILIES),
    has: params.has === "1",
    sort: oneOf(params.sort, SORT_WORDS, "near"),
    dist: oneOf(params.dist, ["any", "2", "5", "10"] as const, "any"),
    when: oneOf(params.when, ["any", "morning", "afternoon", "evening"] as const, "any"),
    dur: oneOf(params.dur, ["any", "60", "90", "120"] as const, "any"),
    prices: listOf(params.price, ["free", "paid"] as const),
    pmin,
    pmax,
    q: (params.q ?? "").slice(0, 60),
  };
}

/** THE SORTS EACH TAB OFFERS, first word the default (10 Oct 2026). "near" is
 *  the list's own order and is named for what it is on that tab: a studio is
 *  measured, so "Nearest"; a class, an artist and a crew carry no distance, so
 *  "Recommended" (the styles you want to learn first, R73); a style's own shelf
 *  is "Classical first". */
export const SORTS_FOR: Record<string, Array<[SortBy, string]>> = {
  classes: [["near", "Recommended"], ["soon", "Earliest"], ["price", "Cheapest"], ["pricey", "Priciest"], ["popular", "Most booked"]],
  studios: [["near", "Nearest"], ["popular", "Most followed"], ["price", "Lowest class price"], ["az", "A–Z"]],
  artists: [["near", "Recommended"], ["popular", "Most followed"], ["price", "Lowest class price"], ["az", "A–Z"]],
  crews: [["near", "Recommended"], ["popular", "Most followed"], ["members", "Most members"], ["az", "A–Z"]],
  /* "members" on Styles is the people who follow it (10 Oct 2026, the follower
     pill on every style tile) — a style's membership is the people who carry it */
  styles: [["near", "Classical first"], ["popular", "Most classes"], ["members", "Most followed"], ["az", "A–Z"]],
};

/** the tabs a price means something on: a class's own price, and the classes a
 *  studio or an artist teaches. A crew and a style have no price of their own. */
export const PRICED_TABS = ["classes", "studios", "artists"] as const;
export const isPricedTab = (tab: string): boolean => (PRICED_TABS as readonly string[]).includes(tab);

/** the bar's right end for this city's classes: the dearest, rounded up to the
 *  next ₹100, and never under ₹500 so a city of free classes still has a bar */
export const priceCeilOf = (prices: readonly number[]): number => Math.max(500, Math.ceil(Math.max(0, ...prices) / 100) * 100);

const priceRangeOk = (f: DiscoverFilters, amount: number): boolean => (f.pmin === null || amount >= f.pmin) && (f.pmax === null || amount <= f.pmax);
export const priceRangeOn = (f: DiscoverFilters): boolean => f.pmin !== null || f.pmax !== null;

/** a studio's or an artist's classes pass when ANY is in the range. ⚠ One with no
 *  class at all is left OUT while a range is on: nothing they teach is known to
 *  fit the budget, and saying it does would be a claim about money. */
export const anyPriceOk = (f: DiscoverFilters, prices: readonly number[] | undefined): boolean =>
  !priceRangeOn(f) || (prices ?? []).some((p) => priceRangeOk(f, p));

/** the one ordering every shelf goes through, keyed by what the tab knows. A
 *  key the tab cannot answer leaves that order out rather than inventing one;
 *  a missing price sorts last whichever way the price runs. Stable, so ties
 *  keep the list's own order. */
export interface SortKeys<T> {
  name?: (x: T) => string;
  popular?: (x: T) => number;
  price?: (x: T) => number | null;
  members?: (x: T) => number;
}
export function sortShelf<T>(list: T[], sort: SortBy, k: SortKeys<T>): T[] {
  const byPrice = (dir: 1 | -1) => (a: T, b: T) => {
    const pa = k.price?.(a) ?? null;
    const pb = k.price?.(b) ?? null;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  if (sort === "az" && k.name) return [...list].sort((a, b) => k.name!(a).localeCompare(k.name!(b)));
  if (sort === "popular" && k.popular) return [...list].sort((a, b) => k.popular!(b) - k.popular!(a));
  if (sort === "members" && k.members) return [...list].sort((a, b) => k.members!(b) - k.members!(a));
  if (sort === "price" && k.price) return [...list].sort(byPrice(1));
  if (sort === "pricey" && k.price) return [...list].sort(byPrice(-1));
  return list;
}

/** the filters → the URL, defaults left out so a clean list has a clean address */
export function filtersToParams(f: DiscoverFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.styles.length) out.styles = f.styles.join(",");
  if (f.fams.length) out.fam = f.fams.join(",");
  if (f.has) out.has = "1";
  if (f.sort !== "near") out.sort = f.sort;
  if (f.dist !== "any") out.dist = f.dist;
  if (f.when !== "any") out.when = f.when;
  if (f.dur !== "any") out.dur = f.dur;
  if (f.prices.length) out.price = f.prices.join(",");
  if (f.pmin !== null) out.pmin = String(f.pmin);
  if (f.pmax !== null) out.pmax = String(f.pmax);
  if (f.q.trim()) out.q = f.q.trim();
  return out;
}

/** how many the Filters button says are on (4664). ⚠ The styles and families
 *  count now (2 Oct 2026): they moved INTO the sheet, so a style picked there
 *  must show on the button or the list looks narrowed for no visible reason. */
export const filtersOnCount = (f: DiscoverFilters, tab: string): number =>
  (f.styles.length ? 1 : 0) +
  (f.fams.length ? 1 : 0) +
  (tab === "styles" && f.has ? 1 : 0) +
  (tab === "classes" && f.prices.length ? 1 : 0) +
  (isPricedTab(tab) && priceRangeOn(f) ? 1 : 0) +
  (tab === "studios" && f.dist !== "any" ? 1 : 0) +
  (tab === "classes" && f.when !== "any" ? 1 : 0) +
  (tab === "classes" && f.dur !== "any" ? 1 : 0) +
  /* a sort counts only where the tab offers it — a word carried over from
     another tab's link changes nothing here and must not say it does */
  (f.sort !== "near" && (SORTS_FOR[tab] ?? []).some(([s]) => s === f.sort) ? 1 : 0);

/** THE STYLES A LIST IS NARROWED TO, or null for "any" (2 Oct 2026). Picked
 *  styles win; failing that, the styles of the picked families. ⚠ The sheet
 *  only OFFERS styles inside the picked families and drops any outside one when
 *  a family is picked, so the two can never ask for something contradictory —
 *  this rule is the answer even for a hand-written URL that does. */
export function effectiveStyles(f: DiscoverFilters): string[] | null {
  if (f.styles.length) return f.styles;
  if (f.fams.length) return stylesOfFamilies(f.fams);
  return null;
}

/* ── the predicates ── */

const whenOfHour = (h: number): Exclude<When, "any"> => (h < 12 ? "morning" : h < 17 ? "afternoon" : "evening");
const priceBandOk = (prices: PriceBand[], amount: number): boolean => prices.length === 0 || prices.length === 2 || (prices[0] === "free" ? amount === 0 : amount > 0);
const styleOk = (f: DiscoverFilters, style: string): boolean => {
  const want = effectiveStyles(f);
  return !want || style === "All styles" || want.includes(style);
};
/** a list of styles (an artist's, a business's) passes when any one is wanted */
export const anyStyleOk = (f: DiscoverFilters, styles: readonly string[]): boolean => {
  const want = effectiveStyles(f);
  return !want || styles.some((s) => want.includes(s));
};

/** THE STYLES TAB'S OWN LIST (2 Oct 2026, the user: "also add filters on style
 *  section on discover") — family, style, "has classes here", and its order */
export function filterStyleShelf(shelfOrder: readonly string[], f: DiscoverFilters, classCount: Map<string, number>, followers: Map<string, number> = new Map()): string[] {
  const want = effectiveStyles(f);
  const out = shelfOrder.filter((s) => (!want || want.includes(s)) && (!f.has || (classCount.get(s) ?? 0) > 0));
  if (f.sort === "az") return [...out].sort((a, b) => a.localeCompare(b));
  if (f.sort === "popular") return [...out].sort((a, b) => (classCount.get(b) ?? 0) - (classCount.get(a) ?? 0));
  if (f.sort === "members") return [...out].sort((a, b) => (followers.get(b) ?? 0) - (followers.get(a) ?? 0));
  return out;
}
const minutesOf = (startsAt: string, endsAt: string): number => Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);

export function filterClasses(list: PublicClassListing[], f: DiscoverFilters): PublicClassListing[] {
  const out = list.filter((c) => {
    if (!styleOk(f, c.style)) return false;
    if (!priceBandOk(f.prices, c.priceInr)) return false;
    if (!priceRangeOk(f, c.priceInr)) return false;
    if (f.when !== "any" && c.session && whenOfHour(hourOf(c.session.startsAt)) !== f.when) return false;
    if (f.dur !== "any" && c.session && minutesOf(c.session.startsAt, c.session.endsAt) > Number(f.dur)) return false;
    return true;
  });
  if (f.sort === "soon") return out.sort((a, b) => (a.session?.startsAt ?? "").localeCompare(b.session?.startsAt ?? ""));
  if (f.sort === "price") return out.sort((a, b) => a.priceInr - b.priceInr);
  if (f.sort === "pricey") return out.sort((a, b) => b.priceInr - a.priceInr);
  /* "popular" (most booked) needs the seat counts, which the page reads after
     this list — it sorts there, through `sortShelf` */
  return out; /* "near" — a class carries no distance of its own; the list stands as it came */
}

/** businesses: distance bites here (the one list that carries one); a style
 *  narrows to businesses with a published class in it, and a price range to
 *  businesses with a class in it (the caller passes both maps). Nearest first,
 *  always — another order is `sortShelf`'s, after the recommendation. */
export function filterBusinesses(list: NearbyBusiness[], f: DiscoverFilters, stylesByBusiness: Map<string, string[]>, pricesByBusiness: Map<string, number[]> = new Map()): NearbyBusiness[] {
  const out = list.filter((t) => {
    if (f.dist !== "any" && t.distanceKm > Number(f.dist)) return false;
    if (!anyStyleOk(f, stylesByBusiness.get(t.id) ?? [])) return false;
    if (!anyPriceOk(f, pricesByBusiness.get(t.id))) return false;
    return true;
  });
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function filterCrews(list: CrewSummary[], f: DiscoverFilters): CrewSummary[] {
  return list.filter((c) => styleOk(f, c.style));
}

/* ⚠ `filterEvents` and `eventMinPrice` went with events (29 Sep 2026) — the one
   predicate set in this file that read the event kinds, the entry formats and
   the Events tab's own search box. */

/** the radius the businesses query asks for — the sheet's distance, or the default 25 km */
/** `?city=all` — every city at once (2 Oct 2026, the user: "option to view for
 *  all cities together called all"). A value, never a city: the registry has no
 *  city called "all", and the reads are given no city at all. */
/** RECOMMENDED FIRST (11 Oct 2026, the user: "discover should get a setting
 *  icon … with option to change the dance styles you want to learn … called
 *  recommendation settings"). A STABLE partition: whatever is in a style this
 *  person wants to learn comes first, and inside each half the shelf keeps its
 *  own order. ⚠ Only while the person has not narrowed or sorted the shelf
 *  themselves — a choice they made outranks a guess about them — and nothing is
 *  ever REMOVED: a recommendation reorders, it never hides. */
export function recommendFirst<T>(list: T[], learn: readonly string[], f: DiscoverFilters, stylesOf: (x: T) => readonly string[]): T[] {
  if (learn.length === 0 || f.sort !== "near" || f.styles.length > 0 || f.fams.length > 0) return list;
  const want = new Set(learn);
  const rank = (x: T): number => {
    const hits = stylesOf(x).map((s) => learn.indexOf(s)).filter((i) => i >= 0);
    return hits.length ? Math.min(...hits) : Number.POSITIVE_INFINITY;
  };
  const yes = list.filter((x) => stylesOf(x).some((s) => want.has(s)));
  const no = list.filter((x) => !stylesOf(x).some((s) => want.has(s)));
  /* among the recommended, the style placed first in the list leads */
  const ordered = yes.map((x, i) => ({ x, i, r: rank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).map((o) => o.x);
  return [...ordered, ...no];
}

export const ALL_CITIES = "all";

export const radiusOf =(f: DiscoverFilters): number => (f.dist === "any" ? 25 : Number(f.dist));
