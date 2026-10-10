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
export type SortBy = "near" | "soon" | "price" | "popular" | "az";
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
  prices: PriceBand[];
  q: string;
}

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
const listOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] =>
  [...new Set((v ?? "").split(",").map((s) => s.trim()).filter((s) => (allowed as readonly string[]).includes(s)))] as T[];

/** the URL → the filters; anything unrecognised falls back, never throws */
export function parseFilters(params: Record<string, string | undefined>, styleNames: readonly string[]): DiscoverFilters {
  return {
    styles: listOf(params.styles, styleNames),
    fams: listOf(params.fam, STYLE_FAMILIES),
    has: params.has === "1",
    sort: oneOf(params.sort, ["near", "soon", "price", "popular", "az"] as const, "near"),
    dist: oneOf(params.dist, ["any", "2", "5", "10"] as const, "any"),
    when: oneOf(params.when, ["any", "morning", "afternoon", "evening"] as const, "any"),
    dur: oneOf(params.dur, ["any", "60", "90", "120"] as const, "any"),
    prices: listOf(params.price, ["free", "paid"] as const),
    q: (params.q ?? "").slice(0, 60),
  };
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
  (tab !== "styles" && f.prices.length ? 1 : 0) +
  (tab !== "styles" && f.dist !== "any" ? 1 : 0) +
  (tab !== "styles" && f.when !== "any" ? 1 : 0) +
  (tab === "classes" && f.dur !== "any" ? 1 : 0) +
  (f.sort !== "near" ? 1 : 0);

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
export function filterStyleShelf(shelfOrder: readonly string[], f: DiscoverFilters, classCount: Map<string, number>): string[] {
  const want = effectiveStyles(f);
  const out = shelfOrder.filter((s) => (!want || want.includes(s)) && (!f.has || (classCount.get(s) ?? 0) > 0));
  if (f.sort === "az") return [...out].sort((a, b) => a.localeCompare(b));
  if (f.sort === "popular") return [...out].sort((a, b) => (classCount.get(b) ?? 0) - (classCount.get(a) ?? 0));
  return out;
}
const minutesOf = (startsAt: string, endsAt: string): number => Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);

export function filterClasses(list: PublicClassListing[], f: DiscoverFilters): PublicClassListing[] {
  const out = list.filter((c) => {
    if (!styleOk(f, c.style)) return false;
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
export function filterBusinesses(list: NearbyBusiness[], f: DiscoverFilters, stylesByBusiness: Map<string, string[]>): NearbyBusiness[] {
  const out = list.filter((t) => {
    if (f.dist !== "any" && t.distanceKm > Number(f.dist)) return false;
    if (!anyStyleOk(f, stylesByBusiness.get(t.id) ?? [])) return false;
    return true;
  });
  return out.sort((a, b) => a.distanceKm - b.distanceKm); /* nearest first is the only order a business has */
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
