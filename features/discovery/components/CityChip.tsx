"use client";

import { useRouter } from "next/navigation";
import { CitySelect } from "@/features/geo/components/CitySelect";

/** THE PLACE, ONCE (prototype 4507-4530): one 34px chip — the app's own place
 *  mark, the city, and the chevron that says it opens.
 *
 *  SINCE 19 Sep 2026 THIS IS THE ONE CITY DROPDOWN IN ITS CHIP DRESS
 *  (`CitySelect`, the user: "city picker should always be the same drop down
 *  everywhere") — the registry of cities DanceOS already has, busiest first,
 *  and "Search another city…" behind it. The mechanism was born here on 11 Sep
 *  2026 (the twelve hardcoded names went, the invisible native select over the
 *  chip stayed) and every other city field in the app now stands on it.
 *
 *  Choosing a city REPLACES the URL rather than pushing one: the city is a
 *  setting of the list you are on, and a push per change made the back gesture
 *  walk through every city before it could leave Discover. */
export function CityChip({
  city,
  cities,
  tab,
  extra,
}: {
  city: string;
  /** the registry, busiest first — what the quick picker offers */
  cities: string[];
  tab: string;
  extra: Record<string, string>;
}) {
  const router = useRouter();

  const go = (next: string | null, centre?: { lat: number; lng: number } | null) => {
    if (!next) return;
    const p = new URLSearchParams({ city: next, tab, ...extra });
    /* a city from the search has a centre of its own and may have nothing in it
       yet — carrying the point means the radius search still has somewhere to
       measure from, instead of falling back to the country */
    if (centre) {
      p.set("near", `${centre.lat.toFixed(3)},${centre.lng.toFixed(3)}`);
    }
    router.replace(`/discover?${p.toString()}`, { scroll: false });
  };

  return <CitySelect variant="chip" value={city} cities={cities} onChange={go} />;
}
