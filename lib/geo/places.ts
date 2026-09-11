/** GOOGLE MAPS PLATFORM, SERVER SIDE (11 Sep 2026)
 *
 *  The user's decision: "I have a Google Maps demo key, let's make it standard…
 *  when selecting a city, or putting some address, instead of hardcoded city
 *  names I want to use APIs."
 *
 *  So this replaces the OpenStreetMap/Nominatim layer entirely. Three calls,
 *  and every one of them happens HERE rather than in the browser:
 *
 *    * `suggestPlaces`  — Places API (New) Autocomplete. What somebody types
 *                         becomes a short list of real places.
 *    * `resolvePlace`   — Place Details for the one they chose: the point, and
 *                         the address broken into parts.
 *    * `reversePlace`   — Geocoding, for a pin dragged on the map.
 *
 *  WHY THE SERVER. The browser needs its own Maps key to draw a map — that one
 *  is public by nature and protected by an HTTP-referrer restriction. The
 *  SEARCH key is a different thing: it can spend quota, so it stays here, and
 *  the browser never sees it. It also means the app can be rate-limited, cached
 *  and swapped for another provider in one file.
 *
 *  ⚠ THE DEMO KEY IS NOT A PRODUCTION KEY. Google says so itself: the Maps Demo
 *  Key needs no billing, has an unpublished daily quota, and simply STOPS when
 *  the quota is reached rather than charging. So every function here fails soft
 *  — an empty list, a null place — and the screens are built to carry on
 *  without an address. Nothing in this app should ever break because a map
 *  service is having a day. Swap `GOOGLE_MAPS_KEY` for a billed key and
 *  nothing else changes.
 *
 *  ⚠ AND A LICENSING RULE, not a technical one: Google's terms forbid showing
 *  Google geocoding results on a non-Google map, and forbid caching results
 *  beyond 30 days. So the map component uses Google too, and the cache below is
 *  a short in-memory one — minutes, not months. */

export interface PlaceSuggestion {
  /** Google's opaque id, the only thing that should be passed back to resolve it */
  id: string;
  /** what the list shows — "Kothrud, Pune, Maharashtra, India" */
  label: string;
  /** the bold half: the place's own name */
  main: string;
  /** the rest: where it is */
  secondary: string;
}

export interface ResolvedPlace {
  /** the whole address as a person would read it */
  label: string;
  lat: number;
  lng: number;
  /** the locality — what `tenants.area` holds */
  area: string | null;
  /** the city, as Google names it; the database folds aliases onto one form */
  city: string | null;
}

const PLACES = "https://places.googleapis.com/v1/places";

/** ⚠ GEOCODING **v4**, NOT THE CLASSIC API (11 Sep 2026, found by running it).
 *
 *  The obvious endpoint — `maps.googleapis.com/maps/api/geocode/json` — is v3,
 *  and a Maps DEMO KEY is refused for it: it answers HTTP 200 with
 *  `REQUEST_DENIED … You must enable Billing`, which is easy to read as a
 *  broken key rather than the wrong API. v4 is a different host, takes the key
 *  as a HEADER rather than a query parameter, and is one of the APIs a demo key
 *  does support.
 *
 *  The happy accident is that v4 answers in the same shape as Places (New) —
 *  `addressComponents` with `longText` and `types` — so one component-picker
 *  serves both, which v3's snake_case would not have. */
const GEOCODE_V4 = "https://geocode.googleapis.com/v4/geocode/location";

const key = (): string | null => process.env.GOOGLE_MAPS_KEY || null;

/** Whether search is available at all. A screen asks this so it can offer the
 *  map alone rather than a search box that answers nothing. */
export const isPlacesConfigured = (): boolean => Boolean(key());

/* ── a short cache, because a picker asks the same question many times ─────── */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(k: string): T | null {
  const hit = cache.get(k);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) {
    if (hit) cache.delete(k);
    return null;
  }
  cache.delete(k);
  cache.set(k, hit);
  return hit.value as T;
}

function remember(k: string, value: unknown): void {
  cache.set(k, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** a picker must never hang on a third party */
const ask = async (url: string, init?: RequestInit): Promise<unknown> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`google answered ${res.status}`);
  }
  return res.json();
};

/* ── 1. what somebody typed → real places ─────────────────────────────────── */

interface AutocompleteBody {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }>;
}

/** Places Autocomplete. `near` biases towards a point without fencing the
 *  answer in — which is what makes "Kothrud" find Pune's rather than a road
 *  with the same name three states away, while still letting somebody search
 *  another city entirely. */
export async function suggestPlaces(
  q: string,
  near?: { lat: number; lng: number } | null,
  /** cities only — for the "which city?" question, where a shop is not an answer */
  citiesOnly = false
): Promise<PlaceSuggestion[]> {
  const term = q.trim();
  const k = key();
  if (!k || term.length < 2) {
    return [];
  }
  const ck = `a:${citiesOnly ? "c" : "p"}:${term.toLowerCase()}:${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ""}`;
  const hit = cached<PlaceSuggestion[]>(ck);
  if (hit) {
    return hit;
  }

  const body: Record<string, unknown> = {
    input: term,
    /* India only: every city list, every studio and every event in this app is
       Indian, and an unbounded search offers Paris to somebody typing "Par" */
    includedRegionCodes: ["in"],
    languageCode: "en",
  };
  if (citiesOnly) {
    /* `(cities)` is Google's own collection for locality-level results */
    body.includedPrimaryTypes = ["locality", "administrative_area_level_3"];
  }
  if (near) {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  }

  try {
    const json = (await ask(`${PLACES}:autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k },
      body: JSON.stringify(body),
    })) as AutocompleteBody;

    const out: PlaceSuggestion[] = (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        id: p.placeId as string,
        label: p.text?.text ?? "",
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }))
      .slice(0, 6);
    remember(ck, out);
    return out;
  } catch {
    /* the map still works; only the typed search does not */
    return [];
  }
}

/* ── 2. the one they chose → a point and an address ───────────────────────── */

interface PlaceDetails {
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
}

/** OSM needed a guessing game here; Google labels its components, so this is a
 *  lookup rather than a heuristic. `locality` is the city everywhere in India;
 *  the neighbourhood falls back through the sublocality levels because a big
 *  city has three of them and a small town has none. */
const pick = (components: PlaceDetails["addressComponents"], types: string[]): string | null => {
  for (const t of types) {
    const hit = (components ?? []).find((c) => (c.types ?? []).includes(t));
    if (hit?.longText) {
      return hit.longText;
    }
  }
  return null;
};

const CITY_TYPES = ["locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2"];
const AREA_TYPES = ["sublocality_level_1", "sublocality", "neighborhood", "route", "premise"];

const toResolved = (d: PlaceDetails): ResolvedPlace | null => {
  const lat = d.location?.latitude;
  const lng = d.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  return {
    label: d.formattedAddress ?? d.shortFormattedAddress ?? "",
    lat,
    lng,
    area: pick(d.addressComponents, AREA_TYPES),
    city: pick(d.addressComponents, CITY_TYPES),
  };
};

export async function resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
  const k = key();
  if (!k || !placeId) {
    return null;
  }
  const ck = `d:${placeId}`;
  const hit = cached<ResolvedPlace | null>(ck);
  if (hit !== null) {
    return hit;
  }
  try {
    /* the field mask is not optional and it is not only about bytes: Places
       (New) BILLS BY THE FIELDS ASKED FOR, so asking for everything is the
       expensive way to get four things */
    const json = (await ask(`${PLACES}/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": k,
        "X-Goog-FieldMask": "formattedAddress,shortFormattedAddress,location,addressComponents",
      },
    })) as PlaceDetails;
    const out = toResolved(json);
    remember(ck, out);
    return out;
  } catch {
    return null;
  }
}

/* ── 3. a pin on the map → an address ─────────────────────────────────────── */

interface GeocodeV4Body {
  results?: Array<{
    formattedAddress?: string;
    /** v4 also breaks the address out properly — `locality` here is the city,
     *  and it agrees with the components, so it is a free second opinion */
    postalAddress?: { locality?: string; administrativeArea?: string };
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  }>;
}

/** The address under a point — what makes a pair of numbers legible. */
export async function reversePlace(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const k = key();
  if (!k) {
    return null;
  }
  /* five decimals is about a metre; rounding to four is what makes a dragged
     pin share cache entries with itself instead of asking on every pixel */
  const ck = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cached<ResolvedPlace | null>(ck);
  if (hit !== null) {
    return hit;
  }
  try {
    const json = (await ask(`${GEOCODE_V4}/${lat},${lng}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": k },
    })) as GeocodeV4Body;
    const first = json.results?.[0];
    if (!first) {
      remember(ck, null);
      return null;
    }
    const out: ResolvedPlace = {
      label: first.formattedAddress ?? "",
      lat,
      lng,
      area: pick(first.addressComponents, AREA_TYPES),
      /* the components first, because they are what Places answers with too and
         one rule for both is one rule to be wrong about; `postalAddress` is the
         fallback for a point whose components carry no locality at all */
      city: pick(first.addressComponents, CITY_TYPES) ?? first.postalAddress?.locality ?? null,
    };
    remember(ck, out);
    return out;
  } catch {
    return null;
  }
}

/** India's bounding box, give or take — the sanity check a server owes a pair
 *  of numbers that arrived from a browser. */
export const isPlausibleIndianPoint = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
