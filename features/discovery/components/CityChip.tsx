"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaceSearch, type ResolvedPlace } from "@/features/geo/components/PlaceSearch";
import { DosPinIcon } from "./discover-kit";

/** THE PLACE, ONCE (prototype 4507-4530): one 34px chip — the app's own place
 *  mark, the city, and the chevron that says it opens.
 *
 *  ⚠ THE TWELVE ARE GONE (11 Sep 2026, the user: "instead of hardcoded city
 *  names I want to use APIs"). This was a native `<select>` over `DOS_CITIES`,
 *  invisible and full-size under the chip — which was a good pattern and the
 *  wrong data: twelve names that could not grow, so a dancer in Kochi could not
 *  find the studios in Kochi.
 *
 *  It keeps the invisible-select trick for the cities DanceOS ALREADY HAS, because
 *  a platform picker is still the best way to choose one of eight things on a
 *  phone, and adds one more option — "Search another city…" — which opens a
 *  Places search over every city in India. So the common case stays one tap and
 *  the long tail is possible at all.
 *
 *  The list is the REGISTRY: cities that actually have a business in them,
 *  busiest first. It fills itself as studios open, so nobody edits a constant
 *  to add a city. */
const SEARCH = "__search__";

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
  const [searching, setSearching] = useState(false);

  const go = (next: string, centre?: { lat: number; lng: number }) => {
    const p = new URLSearchParams({ city: next, tab, ...extra });
    /* a city from the search has a centre of its own and may have nothing in it
       yet — carrying the point means the radius search still has somewhere to
       measure from, instead of falling back to the country */
    if (centre) {
      p.set("near", `${centre.lat.toFixed(3)},${centre.lng.toFixed(3)}`);
    }
    router.push(`/discover?${p.toString()}`);
  };

  const chose = (place: ResolvedPlace) => {
    const name = place.city ?? place.label.split(",")[0]?.trim();
    setSearching(false);
    if (name) {
      go(name, { lat: place.lat, lng: place.lng });
    }
  };

  /* whatever city is being shown is always in the list, even if the registry
     has not got to it — a picker must never fail to show its own value */
  const options = cities.some((c) => c.toLowerCase() === city.toLowerCase()) ? cities : [city, ...cities];

  return (
    <>
      <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 17, background: "var(--card)", border: "1px solid var(--el)", fontSize: 12.5, fontWeight: 800, color: "var(--text)", cursor: "pointer", maxWidth: 170, boxSizing: "border-box" }}>
        <DosPinIcon size={13} color="var(--sub)" />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 10 }}>
          ▾
        </span>
        <select
          value={city}
          onChange={(e) => (e.target.value === SEARCH ? setSearching(true) : go(e.target.value))}
          aria-label="Choose a city"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", WebkitAppearance: "none", appearance: "none", border: "none", background: "transparent" }}
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={SEARCH}>Search another city…</option>
        </select>
      </span>

      {searching ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "18vh 16px 16px" }} onClick={() => setSearching(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(430px, 100%)", background: "var(--bg)", border: "1px solid var(--el)", borderRadius: 18, padding: "14px 14px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)", marginBottom: 3 }}>Which city?</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 10, lineHeight: 1.45 }}>
              Any city in India — Discover will search around it even if nothing is there yet.
            </div>
            <PlaceSearch placeholder="Search a city…" citiesOnly autoFocus onPick={chose} />
          </div>
        </div>
      ) : null}
    </>
  );
}
