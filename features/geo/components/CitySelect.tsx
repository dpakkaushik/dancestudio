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
 *  (Discover's 34px pill). Same options, same words.
 *
 *  ⚠ AND ONE ROW ABOVE THE CITIES THAT IS NOT A CITY (`lead`, 21 Sep 2026, the
 *  user: "merge near me and city filter on discover"). Discover asked WHERE
 *  twice — a Near me chip beside this one — and the two were never independent:
 *  they are the same question, "measure from this city, or from me", which is
 *  why 18 Sep put them on one line and why one line was still one too many.
 *  The lead row is deliberately GENERAL and deliberately not a city: it carries
 *  its own words and its own press, so the meaning of "near me" stays in
 *  Discover and this control keeps knowing only about places. */

const NONE = "__none__";

/** a row above the cities with its own meaning — Discover's Near me, today */
export type CityLead = {
  /** the select's value for it — never a city name */
  value: string;
  /** the row as the dropdown prints it */
  option: string;
  /** what the chip or field prints while it is the answer (a caller may say "Finding you…") */
  label: string;
  /** is it the current answer, rather than the city */
  active: boolean;
  onPick: () => void;
};

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
  lead = null,
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
  /** a first row that is not a city (Discover's Near me) */
  lead?: CityLead | null;
}) {
  /* whatever city is being shown is always in the list, even if the registry
     has not got to it — a picker must never fail to show its own value */
  const options = value && !cities.some((c) => c.toLowerCase() === value.toLowerCase()) ? [value, ...cities] : cities;
  /* ⚠ while the lead row is the answer the SELECT stands on it, not on the city
     underneath — so picking the city you are already in is a real change of
     value, which is the only way a native select fires, and the only way back */
  const selectValue = lead?.active ? lead.value : (value ?? NONE);
  const shown = lead?.active ? lead.label : (value ?? placeholder);

  const select = (
    <select
      value={selectValue}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (lead && v === lead.value) lead.onPick();
        else if (v === NONE) onChange(null, null);
        else onChange(v, null);
      }}
      aria-label={ariaLabel}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "default" : "pointer", WebkitAppearance: "none", appearance: "none", border: "none", background: "transparent" }}
    >
      {lead ? <option value={lead.value}>{lead.option}</option> : null}
      {allowNone || !value ? <option value={NONE}>{allowNone ? noneLabel : placeholder}</option> : null}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  if (variant === "chip") {
    /* the lead row inks the chip the way the Near me chip inked itself: a list
       measured from somewhere other than the city on it must say so at a glance */
    const on = Boolean(lead?.active);
    return (
      <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 17, background: on ? "var(--text)" : CARD, border: `1.5px solid ${on ? "var(--text)" : EL}`, fontSize: 12.5, fontWeight: 800, color: on ? "var(--solid)" : INK, cursor: "pointer", maxWidth: 190, boxSizing: "border-box" }}>
        <DosPinIcon size={13} color={on ? "var(--solid)" : "var(--sub)"} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shown}</span>
        <span aria-hidden="true" style={{ color: on ? "var(--solid)" : MUTED, fontSize: 10, opacity: on ? 0.8 : 1 }}>
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
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: value || lead?.active ? INK : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shown}</span>
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
