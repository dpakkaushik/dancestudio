"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

export interface PlaceSuggestion {
  id: string;
  label: string;
  main: string;
  secondary: string;
}

export interface ResolvedPlace {
  label: string;
  lat: number;
  lng: number;
  area: string | null;
  city: string | null;
}

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg)",
  border: `1px solid ${EL}`,
  borderRadius: 12,
  padding: "10px 11px",
  fontSize: 13,
  color: INK,
  fontFamily: "inherit",
};

/** TYPING A PLACE (11 Sep 2026 — the user: "instead of hardcoded city names I
 *  want to use APIs").
 *
 *  Google Places Autocomplete, through this app's own server so the key that
 *  spends quota never reaches a browser. Two behaviours worth naming:
 *
 *  DEBOUNCED, because autocomplete is billed per keystroke if you let it be.
 *  250 ms is long enough that "Kothrud" is one or two calls rather than eight,
 *  and short enough that it still feels like it is keeping up.
 *
 *  THE LAST ANSWER WINS. Two requests in flight can come back in either order,
 *  and a slow first response landing after a fast second one would replace the
 *  right list with a stale one — so every response carries the sequence number
 *  it was asked with and an out-of-date one is dropped on arrival. */
export function PlaceSearch({
  placeholder,
  near,
  citiesOnly = false,
  autoFocus = false,
  onPick,
  onEmpty,
  onFreeText,
}: {
  placeholder: string;
  /** bias the answers towards a point — what makes "Kothrud" find Pune's */
  near?: { lat: number; lng: number } | null;
  /** only cities, for the "which city?" question where a shop is not an answer */
  citiesOnly?: boolean;
  autoFocus?: boolean;
  onPick: (place: ResolvedPlace) => void;
  /** said when Google answers nothing — a screen may want to explain itself */
  onEmpty?: () => void;
  /** ⚠ THE WAY OUT WHEN GOOGLE IS NOT ANSWERING (11 Sep 2026).
   *
   *  When set, the typed text itself is offered as the last option. This is not
   *  a convenience — it is the difference between a form somebody can finish
   *  and one they cannot. The app runs on a Maps DEMO KEY whose daily quota
   *  PAUSES rather than charges, so "Google answers nothing" is a state that
   *  WILL happen, and a city field that only accepts a Places result would
   *  block studio creation outright on the day it does.
   *
   *  Safe because the database is what keeps cities consistent, not this
   *  control: `canonical_city()` folds Bangalore onto Bengaluru whether the
   *  name came from Google or from a keyboard. */
  onFreeText?: (text: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const search = useCallback(
    async (q: string) => {
      const mine = ++seq.current;
      if (q.trim().length < 2) {
        setList([]);
        return;
      }
      setBusy(true);
      try {
        const p = new URLSearchParams({ q: q.trim() });
        if (near) {
          p.set("lat", String(near.lat));
          p.set("lng", String(near.lng));
        }
        if (citiesOnly) {
          p.set("cities", "1");
        }
        const res = await fetch(`/api/places?${p.toString()}`);
        const body = (await res.json()) as { places?: PlaceSuggestion[] };
        if (mine !== seq.current) {
          return;
        }
        const places = body.places ?? [];
        setList(places);
        setNote(places.length === 0 ? "Nothing found for that." : null);
        if (places.length === 0) {
          onEmpty?.();
        }
      } catch {
        if (mine === seq.current) {
          setList([]);
          setNote("The address search is not answering right now.");
        }
      } finally {
        if (mine === seq.current) {
          setBusy(false);
        }
      }
    },
    [near, citiesOnly, onEmpty]
  );

  const type = (v: string) => {
    setTerm(v);
    setNote(null);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => void search(v), 250);
  };

  const choose = async (s: PlaceSuggestion) => {
    setTerm("");
    setList([]);
    setBusy(true);
    try {
      const res = await fetch(`/api/places?place=${encodeURIComponent(s.id)}`);
      const body = (await res.json()) as { place: ResolvedPlace | null };
      if (body.place) {
        onPick(body.place);
      } else {
        setNote("That place could not be looked up. Try another, or move the map.");
      }
    } catch {
      setNote("That place could not be looked up. Try another, or move the map.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ position: "relative" }}>
        <input
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => type(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          style={field}
        />
        {busy ? (
          <span aria-hidden="true" style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 800, color: MUTED }}>
            …
          </span>
        ) : null}
      </div>

      {list.length > 0 || (onFreeText && term.trim().length >= 2) ? (
        <div role="listbox" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => void choose(s)}
              style={{ textAlign: "left", background: CARD, border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.35 }}
            >
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: INK }}>{s.main}</span>
              {s.secondary ? <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>{s.secondary}</span> : null}
            </button>
          ))}

          {/* last, always available: what they actually typed */}
          {onFreeText && term.trim().length >= 2 ? (
            <button
              type="button"
              role="option"
              aria-selected="false"
              aria-label={`Use "${term.trim()}"`}
              onClick={() => {
                const t = term.trim();
                setTerm("");
                setList([]);
                onFreeText(t);
              }}
              style={{ textAlign: "left", background: "transparent", border: `1px dashed ${EL}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.35 }}
            >
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: INK }}>
                Use &ldquo;{term.trim()}&rdquo;
              </span>
              <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>exactly as typed</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {note ? <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>{note}</div> : null}
    </div>
  );
}
