"use client";

import { INK, SUB } from "@/lib/design/tokens";
import { DosPinIcon } from "@/features/discovery/components/discover-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** THE ONE CITY DROPDOWN (19 Sep 2026, the user: "city picker should always be
 *  the same drop down everywhere" — and, later the same day: "keep only these
 *  cities in database — Gurugram, New Delhi, Bengaluru, Hyderabad, Pune,
 *  Mumbai, Kolkata, Chennai — and nothing else").
 *
 *  Until today a city was picked four different ways: Discover's chip was a
 *  native select over the registry with a search behind it, the forms carried
 *  a Places search field, Stats had a plain select, and onboarding and the
 *  Edit profile sheet were free-text boxes. This is the chip's mechanism made
 *  into the control for all of them: a NATIVE `<select>`, invisible and
 *  full-size over the field, listing THE CITIES DANCEOS SERVES — read from the
 *  database's `cities` registry, never a constant in this file — with the
 *  current value always among the options, because a picker must never fail
 *  to show its own value. The "Search another city…" the first cut carried is
 *  gone with the user's closed list: a city outside it is not a place this app
 *  serves yet, and a form must not be able to name one.
 *
 *  A platform picker is still the best way to choose one of eight things on a
 *  phone. Two dresses: the FIELD (a form row with its label) and the CHIP
 *  (Discover's 34px pill). Same options, same words. */

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
  /** the registry — the cities DanceOS serves */
  cities: readonly string[];
  /** the chosen city (the centre is the registry's — a page that needs it reads it there) */
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
        if (v === NONE) onChange(null, null);
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
    </select>
  );

  if (variant === "chip") {
    return (
      <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 17, background: CARD, border: `1.5px solid ${EL}`, fontSize: 12.5, fontWeight: 800, color: INK, cursor: "pointer", maxWidth: 170, boxSizing: "border-box" }}>
        <DosPinIcon size={13} color="var(--sub)" />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ?? placeholder}</span>
        <span aria-hidden="true" style={{ color: MUTED, fontSize: 10 }}>
          ▾
        </span>
        {select}
      </span>
    );
  }

  return (
    <div>
      {label ? <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>{label}</div> : null}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1.5px solid ${EL}`, borderRadius: 12, padding: "9px 11px", boxSizing: "border-box", opacity: disabled ? 0.7 : 1 }}>
        <DosPinIcon size={13} color="var(--sub)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: value ? INK : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ?? placeholder}</span>
        {source === "address" && value ? <span style={{ flexShrink: 0, fontSize: 10, color: MUTED }}>from the address</span> : null}
        <span aria-hidden="true" style={{ flexShrink: 0, color: MUTED, fontSize: 11 }}>
          ▾
        </span>
        {select}
      </div>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
    </div>
  );
}
