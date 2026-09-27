"use client";

import { useState } from "react";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
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
  const [open, setOpen] = useState(false);
  useCloseOnBack(() => setOpen(false), open);

  /** ⚠⚠ AN IN-APP SHEET, NOT A NATIVE `<select>` (27 Sep 2026, the user: *"fix
   *  all list drop downs should be within the app only not open a seprate
   *  screen"*).
   *
   *  This control was an invisible native `<select>` stretched over a painted
   *  chip — and on a phone that is exactly what the ask describes: Android and
   *  iOS answer a `<select>` with a FULL-SCREEN OS picker, in the system's own
   *  type, with the system's own Cancel, over the app. Nothing in the app is
   *  visible while it is open. On a laptop it is a small popup and reads fine,
   *  which is why it survived four months.
   *
   *  So it is the app's own bottom sheet now — the same shape every other list
   *  in DanceOS opens in, `dosSheetUp`, a scrim, `useCloseOnBack` so the phone's
   *  back gesture closes it. The OPTIONS are unchanged, the callbacks are
   *  unchanged and every caller is untouched: what changed is what a press
   *  opens.
   *
   *  ⚠ The trigger is a real `<button>` with the same accessible name the
   *  select carried, so every locator that found "Choose a city" still does. */
  const pick = (v: string) => {
    setOpen(false);
    if (lead && v === lead.value) lead.onPick();
    else if (v === NONE) onChange(null, null);
    else onChange(v, null);
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen(true)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "default" : "pointer", border: "none", background: "transparent", padding: 0 }}
    />
  );

  const sheet = open ? (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 680 }}>
      <div
        role="listbox"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: "var(--text)", maxHeight: "72vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
        {(
          [
            ...(lead ? [[lead.value, lead.option] as const] : []),
            ...(allowNone || !value ? [[NONE, allowNone ? noneLabel : placeholder] as const] : []),
            ...options.map((c) => [c, c] as const),
          ] as ReadonlyArray<readonly [string, string]>
        ).map(([v, l]) => {
          const on = v === selectValue;
          return (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => pick(v)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "13px 12px", marginBottom: 6, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: on ? 900 : 700, background: on ? EL : CARD, border: `1.5px solid ${on ? INK : EL}`, color: INK }}
            >
              <DosPinIcon size={13} color={on ? INK : "var(--sub)"} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
              {on ? <span aria-hidden="true" style={{ color: INK, fontSize: 13 }}>✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const select = (
    <>
      {trigger}
      {sheet}
    </>
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
