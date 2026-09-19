"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDiscoverCities } from "@/repositories/cities";

/** THE REGISTRY, FOR THE ONE DROPDOWN (19 Sep 2026, the user: "city picker
 *  should always be the same drop down everywhere"). Every city picker in the
 *  app is one control now — the cities DanceOS already has, busiest first, and
 *  "Search another city…" behind them — and this is how a client-side picker
 *  gets the list without every screen having to read it on the server first.
 *  `discover_cities` answers anon, so it works on onboarding and on a public
 *  page alike; a failed read is an empty list, never an error, because the
 *  search behind the list still works without it. */
export async function listCitiesAction(): Promise<string[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const cities = await findDiscoverCities(supabase);
    return cities.map((c) => c.city);
  } catch {
    return [];
  }
}
