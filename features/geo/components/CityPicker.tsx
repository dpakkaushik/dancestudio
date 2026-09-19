"use client";

import { useEffect, useState } from "react";
import { listCitiesAction } from "@/features/geo/server-actions/cities";
import { CitySelect } from "./CitySelect";

/** WHICH CITY? THE ONE DROPDOWN (19 Sep 2026, the user: "city picker should
 *  always be the same drop down everywhere").
 *
 *  11 Sep 2026 took the twelve hardcoded names out and made this a Places
 *  search field, with the city READ OFF THE ADDRESS wherever a pin is placed
 *  first (a studio, an event). Both of those stay true; what changed is the
 *  dress: this is `CitySelect` — Discover's own chip mechanism, a native
 *  dropdown over the REGISTRY of cities DanceOS already has, with "Search
 *  another city…" (the Places search, and the typed name as its last option)
 *  behind it. The registry is fetched once per page through a server action
 *  and shared by every picker on it, so a form does not have to read it on the
 *  server to draw a city field. */

/* one fetch per page, shared by every picker on it */
let registry: Promise<string[]> | null = null;
const loadRegistry = () => (registry ??= listCitiesAction().catch(() => []));

export function CityPicker({
  value,
  onChange,
  label = "City",
  source = null,
  disabled = false,
  name,
}: {
  /** the city as it stands, or null */
  value: string | null;
  /** the chosen city, and its centre when the search gave one */
  onChange: (city: string | null, centre?: { lat: number; lng: number } | null) => void;
  label?: string;
  /** "address" when the value was read off a placed pin — shown back, so the
   *  person knows they did not have to (and where to look if it is wrong) */
  source?: "address" | null;
  disabled?: boolean;
  /** a hidden input for a plain form post */
  name?: string;
}) {
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void loadRegistry().then((list) => {
      if (live) setCities(list);
    });
    return () => {
      live = false;
    };
  }, []);

  return <CitySelect value={value} cities={cities} onChange={onChange} label={label} source={source} disabled={disabled} name={name} />;
}
