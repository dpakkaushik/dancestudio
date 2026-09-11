import type { SupabaseClient } from "@supabase/supabase-js";

/** THE CITY LIST IS NOT A LIST ANY MORE (11 Sep 2026) — the user: "instead of
 *  hardcoded city names I want to use APIs… nothing should be hardcoded."
 *
 *  `DOS_CITIES` was twelve names in a TypeScript file and `city_centroids` was
 *  the same twelve seeded into a table. Between them they decided which cities
 *  could exist at all: a studio in Kochi could not say it was in Kochi.
 *
 *  Now the geocoder names the city and the database remembers it. What this
 *  file reads is the REGISTRY — every city that has something in it, busiest
 *  first — which is a better list than twelve names could ever be, because it
 *  is true. */

export interface DiscoverCity {
  city: string;
  lat: number;
  lng: number;
  /** listed studios and artist pages in it — what puts the busiest first */
  businesses: number;
}

/** Every city Discover can offer, busiest first. SECURITY INVOKER behind the
 *  RPC: it counts only what the caller could see anyway.
 *
 *  ⚠ IT FALLS BACK TO THE TABLE, AND IT HAS TO (11 Sep 2026, caught by the e2e
 *  suite). `discover_cities()` arrives with migration
 *  `20260913140000_a_city_is_whatever_the_map_says`. Returning an empty list
 *  before that lands is NOT a harmless degradation: this list is where Discover
 *  gets the CENTRE it measures from, so an empty answer moved every radius
 *  search to the middle of India and emptied the shelf for everybody — a broken
 *  Discover, in production, for as long as the migration sat unapplied.
 *
 *  `city_centroids` has existed since Step 5 and is readable by anyone, so the
 *  fallback is a plain select over it. It has no business counts, which only
 *  costs the chips their ordering. */
export async function findDiscoverCities(supabase: SupabaseClient): Promise<DiscoverCity[]> {
  const { data, error } = await supabase.rpc("discover_cities");
  if (!error) {
    return ((data ?? []) as Array<{ city: string; lat: number; lng: number; businesses: number }>).map((r) => ({
      city: r.city,
      lat: Number(r.lat),
      lng: Number(r.lng),
      businesses: Number(r.businesses ?? 0),
    }));
  }

  const { data: rows, error: tableError } = await supabase
    .from("city_centroids")
    .select("city, lat, lng")
    .is("deleted_at", null)
    .order("city")
    .limit(200);
  if (tableError) {
    /* now it really is only navigation — nothing left to read */
    return [];
  }
  return ((rows ?? []) as Array<{ city: string; lat: number; lng: number }>).map((r) => ({
    city: r.city,
    lat: Number(r.lat),
    lng: Number(r.lng),
    businesses: 0,
  }));
}

/** Put a city on the map the first time somebody is in it. Returns the CANONICAL
 *  name it was stored under — Bengaluru for "Bangalore" — which is the name the
 *  caller should then write onto its own row, so grouping holds. */
export async function rememberCity(
  supabase: SupabaseClient,
  input: { city: string; lat: number; lng: number }
): Promise<string | null> {
  const { data, error } = await supabase.rpc("remember_city", {
    p_name: input.city,
    p_lat: input.lat,
    p_lng: input.lng,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data as string | null) ?? null;
}

/** The centre a city's radius search starts from. Null when nobody has been
 *  there yet — the caller then has a point of its own (the picker's) or falls
 *  back to the country. */
export function centreOf(
  /* the minimum a centre needs, so a screen that only carries names and points
     does not have to invent a `businesses` count to ask this */
  cities: Array<{ city: string; lat: number; lng: number }>,
  city: string | null
): { lat: number; lng: number } | null {
  if (!city) {
    return null;
  }
  const hit = cities.find((c) => c.city.toLowerCase() === city.toLowerCase());
  /* a city registered from a bad pin is stored at 0,0 — a real centre, never */
  return hit && (hit.lat !== 0 || hit.lng !== 0) ? { lat: hit.lat, lng: hit.lng } : null;
}

/** The geographic centre of India — where a map with nothing to go on opens,
 *  so it shows the country rather than the Atlantic. The one coordinate pair
 *  left in the codebase, and it is a fallback rather than a list. */
export const INDIA_CENTRE = { lat: 22.9734, lng: 78.6569 } as const;
