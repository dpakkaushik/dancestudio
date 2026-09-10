/** GEOCODING, WITHOUT AN ACCOUNT (11 Sep 2026)
 *
 *  The app needed a location picker and had no maps provider, so the one it
 *  gets is the one that needs nothing signed up for: **OpenStreetMap**. Tiles
 *  come from the OSM tile servers and the addresses from **Nominatim**, both
 *  free and keyless. Nothing here reads an API key, and nothing has to.
 *
 *  ⚠ WHAT THAT COSTS, stated plainly rather than discovered later. Nominatim's
 *  usage policy is an ABSOLUTE MAXIMUM of one request per second, demands a
 *  User-Agent that identifies the application, and forbids heavy commercial
 *  use. That is fine for a picker somebody opens once when they set up a studio.
 *  It is NOT fine for a consumer app at scale, and the day this platform has
 *  real traffic it needs a paid or keyed geocoder. So:
 *
 *    * every call goes through the SERVER (`/api/geocode`), never the browser —
 *      which is what makes the User-Agent, the caching and the throttle
 *      possible at all, and keeps the policy a promise this app can actually
 *      keep;
 *    * the provider is chosen by ONE environment variable. Set
 *      `GEOCODER_PROVIDER=locationiq` (or `maptiler`) and `GEOCODER_KEY`, and
 *      the swap is a deploy, not a rewrite. Both speak the same shapes below
 *      because both are Nominatim-derived.
 *
 *  The throttle and the cache are PER INSTANCE. On a serverless deployment
 *  each instance keeps its own, so the global rate is the per-instance rate
 *  times the number of instances — another reason the keyed provider is the
 *  real answer at scale, and not something a comment can fix. */

export interface GeoPlace {
  /** the whole address as a person would read it */
  label: string;
  lat: number;
  lng: number;
  /** the locality — what `tenants.area` holds */
  area: string | null;
  /** the city, matched against DOS_CITIES by the caller where that matters */
  city: string | null;
}

type Provider = "nominatim" | "locationiq" | "maptiler";

const provider = (): Provider => {
  const p = (process.env.GEOCODER_PROVIDER ?? "nominatim").toLowerCase();
  return p === "locationiq" || p === "maptiler" ? p : "nominatim";
};

/** Nominatim asks to be told who is calling; an app that does not is blocked. */
const UA = "DanceOS/1.0 (https://dancestudio-orcin.vercel.app)";

const BASE: Record<Provider, string> = {
  nominatim: "https://nominatim.openstreetmap.org",
  locationiq: "https://us1.locationiq.com/v1",
  maptiler: "https://api.maptiler.com/geocoding",
};

/* ── the throttle: one request a second, queued rather than dropped ────────── */
let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();
const MIN_GAP_MS = 1100;

function throttled<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastCallAt = Date.now();
    return run();
  });
  /* the chain must not break on a rejection, or every later call inherits it */
  chain = next.catch(() => undefined);
  return next;
}

/* ── the cache: a picker asks the same question many times ─────────────────── */
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: GeoPlace[] }>();

function cached(key: string): GeoPlace[] | null {
  const hit = cache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  /* touch: a Map keeps insertion order, so re-inserting makes it the newest */
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function remember(key: string, value: GeoPlace[]): void {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
}

/* ── reading a provider's answer ───────────────────────────────────────────── */
interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

/** The locality, from whichever field the place happens to carry it. OSM is a
 *  map of the whole world made by hand, so the same idea lands in different
 *  keys depending on who mapped it; asking in order is the only way. */
const areaOf = (a: Record<string, string | undefined> | undefined): string | null =>
  a?.neighbourhood ?? a?.suburb ?? a?.quarter ?? a?.residential ?? a?.village ?? a?.town ?? a?.city_district ?? a?.road ?? null;

const cityOf = (a: Record<string, string | undefined> | undefined): string | null =>
  a?.city ?? a?.town ?? a?.municipality ?? a?.state_district ?? a?.village ?? null;

const toPlace = (r: NominatimRow): GeoPlace | null => {
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    label: r.display_name ?? "",
    lat,
    lng,
    area: areaOf(r.address),
    city: cityOf(r.address),
  };
};

async function ask(url: string): Promise<NominatimRow[]> {
  const res = await throttled(() =>
    fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en", Accept: "application/json" },
      /* a picker must not hang on a slow third party */
      signal: AbortSignal.timeout(8000),
    })
  );
  if (!res.ok) {
    throw new Error(`geocoder answered ${res.status}`);
  }
  const body = (await res.json()) as NominatimRow[] | NominatimRow;
  return Array.isArray(body) ? body : [body];
}

const keyParam = (): string => {
  const key = process.env.GEOCODER_KEY;
  return key ? `&key=${encodeURIComponent(key)}` : "";
};

/** Addresses matching what somebody typed. `near` biases the answer towards a
 *  city, which is what makes "Kothrud" find Pune's rather than a road in
 *  another state. */
export async function searchPlaces(q: string, near?: { lat: number; lng: number } | null): Promise<GeoPlace[]> {
  const term = q.trim();
  if (term.length < 3) {
    return [];
  }
  const key = `s:${term.toLowerCase()}:${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
  const hit = cached(key);
  if (hit) {
    return hit;
  }

  /* a box roughly 60 km around the city centre — a bias, not a fence:
     `bounded=0` keeps a match outside it rather than dropping it */
  const box = near ? `&viewbox=${near.lng - 0.6},${near.lat + 0.55},${near.lng + 0.6},${near.lat - 0.55}&bounded=0` : "";
  const p = provider();
  const url =
    p === "maptiler"
      ? `${BASE.maptiler}/${encodeURIComponent(term)}.json?country=in&limit=6${keyParam()}`
      : `${BASE[p]}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(term)}${box}${keyParam()}`;

  const rows = await ask(url);
  const places = rows.map(toPlace).filter((x): x is GeoPlace => x !== null);
  remember(key, places);
  return places;
}

/** The address at a point — what the pin is standing on. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
  /* five decimal places is about a metre; rounding is what makes a dragged pin
     share cache entries with itself instead of asking on every pixel */
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cached(key);
  if (hit) {
    return hit[0] ?? null;
  }
  const p = provider();
  const url =
    p === "maptiler"
      ? `${BASE.maptiler}/${lng},${lat}.json?limit=1${keyParam()}`
      : `${BASE[p]}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}${keyParam()}`;

  const rows = await ask(url);
  const place = rows.map(toPlace).find((x): x is GeoPlace => x !== null) ?? null;
  remember(key, place ? [place] : []);
  return place;
}

/** India's bounding box, give or take — the sanity check a server owes a pair
 *  of numbers that arrived from a browser. */
export const isPlausibleIndianPoint = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
