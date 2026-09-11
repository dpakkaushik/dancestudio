"use client";

import { useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";
import { PlaceSearch, type ResolvedPlace } from "./PlaceSearch";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** WHICH CITY? ASK THE MAP, NOT A LIST (11 Sep 2026).
 *
 *  Every "pick a city" in this app was a `<select>` over `DOS_CITIES` — twelve
 *  hardcoded names, which meant a dance studio in Kochi, Indore or Guwahati
 *  could not say where it was. The first replacement drew the database's own
 *  registry (cities that already hold a business) as tap-chips, with a search
 *  behind them. The user looked at those chips and saw a list — *"city, rather
 *  than picking from a hardcoded list, should be picked from API"* — and a
 *  control that has to be explained is the wrong control. So there are no
 *  chips. There are two ways a city gets here, and both are Google:
 *
 *  1. IT IS READ OFF THE ADDRESS. On a studio or an event the owner places the
 *     pin first — searches the address, or presses "Use my location" — and the
 *     city is whatever Google says that point is in. The field then shows the
 *     answer, marked "from the address", and stays out of the way.
 *  2. IT IS SEARCHED. Where there is no address to read it from (a crew, an
 *     enquiry), or when the address got it wrong, the field IS a Places search
 *     for cities: type, pick.
 *
 *  And the last option in that search is always the typed name itself. The
 *  app runs on a Maps demo key whose daily quota pauses rather than bills, so
 *  "Google is not answering" is a state that will happen, and a form that
 *  cannot be finished that day is worse than a hand-typed city. The database
 *  folds aliases (`canonical_city`: Bangalore → Bengaluru) whether the name
 *  came from Google or a keyboard, so grouping holds either way. */
export function CityPicker({
  value,
  onChange,
  label = "City",
  source = null,
}: {
  /** the city as it stands, or null */
  value: string | null;
  /** the chosen city, and its centre when the search gave one */
  onChange: (city: string | null, centre?: { lat: number; lng: number } | null) => void;
  label?: string;
  /** "address" when the value was read off a placed pin — shown back, so the
   *  person knows they did not have to (and where to look if it is wrong) */
  source?: "address" | null;
}) {
  const [changing, setChanging] = useState(false);

  const chose = (place: ResolvedPlace) => {
    /* a city search answers with the city in `city`; if Google labelled it
       something else, the place's own name is the next best thing */
    const name = place.city ?? place.label.split(",")[0]?.trim() ?? null;
    setChanging(false);
    onChange(name, { lat: place.lat, lng: place.lng });
  };

  const searching = !value || changing;

  return (
    <div>
      <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>{label}</div>

      {searching ? (
        <>
          <PlaceSearch
            placeholder="Search your city…"
            citiesOnly
            /* focus only when the person asked to change it — a field that
               grabs focus on open steals it from the name being typed above */
            autoFocus={changing}
            onPick={chose}
            onFreeText={(text) => {
              setChanging(false);
              onChange(text, null);
            }}
          />
          {changing && value ? (
            <button type="button" onClick={() => setChanging(false)} style={{ ...linkBtn, marginTop: 6 }}>
              Keep {value}
            </button>
          ) : null}
        </>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: CARD,
            border: `1px solid ${EL}`,
            borderRadius: 12,
            padding: "9px 11px",
            boxSizing: "border-box",
          }}
        >
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          {source === "address" ? <span style={{ flexShrink: 0, fontSize: 10, color: MUTED }}>from the address</span> : null}
          <button type="button" aria-label="Change city" onClick={() => setChanging(true)} style={linkBtn}>
            Change
          </button>
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  flexShrink: 0,
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
