"use client";

import { useState, type CSSProperties } from "react";
import { INK, SUB } from "@/lib/design/tokens";
import { PlaceSearch, type ResolvedPlace } from "./PlaceSearch";
import { DosPinIcon } from "@/features/discovery/components/discover-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** THE ONE CITY DROPDOWN (19 Sep 2026, the user: "city picker should always be
 *  the same drop down everywhere").
 *
 *  Until today a city was picked four different ways: Discover's chip was a
 *  native select over the registry with a search behind it, the forms carried a
 *  Places search field, Stats had a plain select, and onboarding and the Edit
 *  profile sheet were free-text boxes. This is the chip's mechanism — the one
 *  the user already had in hand — made into the control for all of them:
 *
 *  · a NATIVE `<select>`, invisible and full-size over the field, listing the
 *    REGISTRY (every city that already has a business in it, busiest first —
 *    `discover_cities`, never a hardcoded list) with the current value always
 *    among the options, because a picker must never fail to show its own value;
 *  · one more option, "Search another city…", which opens a Places search over
 *    every city in India — and, as the last row of that search, the typed name
 *    itself (the Maps demo key's quota pauses; a form must still be finishable).
 *
 *  A platform picker is still the best way to choose one of a dozen things on a
 *  phone, and the long tail stays possible. Two dresses: the FIELD (a form row
 *  with its label) and the CHIP (Discover's 34px pill). Same options, same
 *  search, same words. */

const SEARCH = "__search__";
const NONE = "__none__";

export function CitySelect({
  value,
  cities,
  onChange,
  variant = "field",
  label,
  source = null,
  disabled = false,
  name,
  placeholder = "Choose a city…",
  ariaLabel = "Choose a city",
  allowNone = false,
  noneLabel = "Everywhere",
}: {
  /** the city as it stands, or null */
  value: string | null;
  /** the registry, busiest first — what the dropdown offers */
  cities: readonly string[];
  /** the chosen city, and its centre when the search gave one */
  onChange: (city: string | null, centre?: { lat: number; lng: number } | null) => void;
  variant?: "field" | "chip";
  label?: string;
  /** "address" when the value was read off a placed pin — shown back */
  source?: "address" | null;
  disabled?: boolean;
  /** a hidden input for a plain form post */
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** keep a "none" row on the list even while a city is picked (Stats' Everywhere) */
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [searching, setSearching] = useState(false);

  const chose = (place: ResolvedPlace) => {
    /* a city search answers with the city in `city`; if Google labelled it
       something else, the place's own name is the next best thing */
    const nameOf = place.city ?? place.label.split(",")[0]?.trim() ?? null;
    setSearching(false);
    onChange(nameOf, { lat: place.lat, lng: place.lng });
  };

  /* whatever city is being shown is always in the list, even if the registry
     has not got to it — a picker must never fail to show its own value */
  const options = value && !cities.some((c) => c.toLowerCase() === value.toLowerCase()) ? [value, ...cities] : cities;
  const selectValue = value ?? NONE;

  const select = (
    <select
      value={selectValue}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === SEARCH) setSearching(true);
        else if (v === NONE) onChange(null, null);
        else onChange(v, null);
      }}
      aria-label={ariaLabel}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "default" : "pointer", WebkitAppearance: "none", appearance: "none", border: "none", background: "transparent" }}
    >
      {allowNone || !value ? <option value={NONE}>{allowNone ? noneLabel : placeholder}</option> : null}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={SEARCH}>Search another city…</option>
    </select>
  );

  const modal = searching ? (
    <div role="dialog" aria-modal="true" aria-label="Which city?" style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "18vh 16px 16px" }} onClick={() => setSearching(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(430px, 100%)", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 18, padding: "14px 14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: INK, marginBottom: 3 }}>Which city?</div>
        <div style={{ fontSize: 11, color: SUB, marginBottom: 10, lineHeight: 1.45 }}>Any city in India.</div>
        <PlaceSearch
          placeholder="Search your city…"
          citiesOnly
          autoFocus
          onPick={chose}
          onFreeText={(text) => {
            setSearching(false);
            onChange(text, null);
          }}
        />
        <button type="button" onClick={() => setSearching(false)} style={{ ...linkBtn, marginTop: 10 }}>
          {value ? `Keep ${value}` : "Cancel"}
        </button>
      </div>
    </div>
  ) : null;

  if (variant === "chip") {
    return (
      <>
        <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 17, background: CARD, border: `1px solid ${EL}`, fontSize: 12.5, fontWeight: 800, color: INK, cursor: "pointer", maxWidth: 170, boxSizing: "border-box" }}>
          <DosPinIcon size={13} color="var(--sub)" />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ?? placeholder}</span>
          <span aria-hidden="true" style={{ color: MUTED, fontSize: 10 }}>
            ▾
          </span>
          {select}
        </span>
        {modal}
      </>
    );
  }

  return (
    <div>
      {label ? <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>{label}</div> : null}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "9px 11px", boxSizing: "border-box", opacity: disabled ? 0.7 : 1 }}>
        <DosPinIcon size={13} color="var(--sub)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: value ? INK : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ?? placeholder}</span>
        {source === "address" && value ? <span style={{ flexShrink: 0, fontSize: 10, color: MUTED }}>from the address</span> : null}
        <span aria-hidden="true" style={{ flexShrink: 0, color: MUTED, fontSize: 11 }}>
          ▾
        </span>
        {select}
      </div>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {modal}
    </div>
  );
}

const linkBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  fontSize: 11.5,
  fontWeight: 800,
  color: SUB,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};
