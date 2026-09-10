"use client";

import { useCallback, useRef, useState } from "react";
import { DOS_CITIES, DOS_CITY_CENTROIDS, type DosCity } from "@/lib/constants/cities";
import { INK, SUB } from "@/lib/design/tokens";
import { MapPicker, type MapPoint } from "./MapPicker";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

export interface PickedLocation {
  lat: number;
  lng: number;
  /** the locality, as OpenStreetMap knows it — what `tenants.area` holds */
  area: string | null;
  /** only ever one of DOS_CITIES, or null when the point is outside them */
  city: DosCity | null;
  /** the whole address, for showing back what was chosen */
  label: string | null;
}

interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
  area: string | null;
  city: string | null;
}

const isDosCity = (v: string | null | undefined): v is DosCity =>
  Boolean(v) && (DOS_CITIES as readonly string[]).includes(v as string);

/** OSM says "Bengaluru" or "Bangalore" depending on who mapped it, and the app
 *  has one closed list of cities. Anything that is not on it is not forced onto
 *  it — the picker says which city it thinks it is in and leaves the field
 *  alone, because a studio silently moved to another city is worse than a
 *  studio whose city was not updated. */
const ALIASES: Record<string, DosCity> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  gurugram: "Gurgaon",
  gurgaon: "Gurgaon",
  delhi: "New Delhi",
  "new delhi": "New Delhi",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  madras: "Chennai",
  chennai: "Chennai",
};

const toDosCity = (raw: string | null): DosCity | null => {
  if (!raw) {
    return null;
  }
  const key = raw.trim().toLowerCase();
  if (ALIASES[key]) {
    return ALIASES[key];
  }
  const exact = DOS_CITIES.find((c) => c.toLowerCase() === key);
  return exact ?? (isDosCity(raw) ? raw : null);
};

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg)",
  border: `1px solid ${EL}`,
  borderRadius: 12,
  padding: "9px 11px",
  fontSize: 13,
  color: INK,
  fontFamily: "inherit",
};

const btn: React.CSSProperties = {
  height: 32,
  padding: "0 11px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  border: `1px solid ${EL}`,
  background: CARD,
  color: INK,
};

/** WHERE A BUSINESS ACTUALLY IS (11 Sep 2026).
 *
 *  Until now every studio in a city sat on the SAME coordinates — its city's
 *  centroid, written by `create_tenant_with_owner` because there was no way to
 *  ask. Discover measured distance from that centroid to the picked city's
 *  centroid, so "2.4 km away" was the same 2.4 km for every studio in Pune, and
 *  "nearest first" was not an order at all. This is the missing input.
 *
 *  Three ways to arrive at a point, because people arrive differently:
 *  type an address, use the phone's own location, or just move the map. All
 *  three end in the same place — a lat/lng and the address underneath it. */
export function LocationPicker({
  value,
  city,
  onChange,
}: {
  value: { lat: number | null; lng: number | null; area: string | null };
  /** the business's city today — where the map opens when there is no point yet */
  city: DosCity | null;
  onChange: (picked: PickedLocation) => void;
}) {
  const fallback = DOS_CITY_CENTROIDS[city ?? "Pune"];
  const [point, setPoint] = useState<MapPoint>({
    lat: value.lat ?? fallback.lat,
    lng: value.lng ?? fallback.lng,
  });
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(value.area);
  const [detected, setDetected] = useState<DosCity | null>(city);
  const [busy, setBusy] = useState<"search" | "here" | "address" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* a point the user never touched must not be saved as though they had */
  const [touched, setTouched] = useState(false);
  const seq = useRef(0);

  /** the address under a point — what makes a pair of numbers legible */
  const describe = useCallback(
    async (p: MapPoint) => {
      const mine = ++seq.current;
      setBusy("address");
      try {
        const res = await fetch(`/api/geocode?lat=${p.lat}&lng=${p.lng}`);
        const body = (await res.json()) as { place: GeoPlace | null };
        if (mine !== seq.current) {
          return;
        }
        const place = body.place;
        const nextArea = place?.area ?? null;
        const nextCity = toDosCity(place?.city ?? null);
        setAddress(place?.label ?? null);
        setArea(nextArea);
        setDetected(nextCity);
        setNote(place && !nextCity ? `That point is in ${place.city ?? "a place"} — outside the cities DanceOS lists, so the city field is left as it is.` : null);
        onChange({ lat: p.lat, lng: p.lng, area: nextArea, city: nextCity, label: place?.label ?? null });
      } catch {
        /* the map still works; only the words for it are missing */
        if (mine === seq.current) {
          setAddress(null);
          onChange({ lat: p.lat, lng: p.lng, area, city: detected, label: null });
        }
      } finally {
        if (mine === seq.current) {
          setBusy(null);
        }
      }
    },
    [onChange, area, detected]
  );

  const pick = useCallback(
    (p: MapPoint) => {
      setTouched(true);
      setPoint(p);
      void describe(p);
    },
    [describe]
  );

  /* NOTHING IS GEOCODED ON ARRIVAL, and that is deliberate twice over. The
     address for a point we already hold is a question the server can only
     answer by spending one of Nominatim's one-per-second requests, and opening
     a sheet is not a reason to spend one — a picker that geocodes on mount
     costs a request for every person who opens the sheet and closes it again.
     The stored `area` is what the business already says about itself, so it is
     what the panel shows until somebody actually moves the pin. */

  const search = async () => {
    if (term.trim().length < 3) {
      return;
    }
    setBusy("search");
    try {
      const centre = DOS_CITY_CENTROIDS[detected ?? city ?? "Pune"];
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(term.trim())}&lat=${centre.lat}&lng=${centre.lng}`);
      const body = (await res.json()) as { places: GeoPlace[] };
      setResults(body.places ?? []);
      if ((body.places ?? []).length === 0) {
        setNote("Nothing found for that. Try a landmark, or just move the map.");
      } else {
        setNote(null);
      }
    } catch {
      setNote("The address search is not answering. Move the map instead — that always works.");
    } finally {
      setBusy(null);
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setNote("This browser will not share a location.");
      return;
    }
    setBusy("here");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        pick({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
      },
      () => {
        setBusy(null);
        setNote("The location was not shared. Search for the address, or move the map.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const known = touched || (value.lat !== null && value.lng !== null);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Search an address or landmark…"
          aria-label="Search for an address"
          style={{ ...field, flex: 1, minWidth: 0 }}
        />
        <button type="button" onClick={() => void search()} disabled={busy === "search" || term.trim().length < 3} style={{ ...btn, height: "auto", opacity: term.trim().length < 3 ? 0.5 : 1 }}>
          {busy === "search" ? "…" : "Find"}
        </button>
      </div>

      {results.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {results.map((r) => (
            <button
              key={`${r.lat},${r.lng},${r.label}`}
              type="button"
              onClick={() => {
                setResults([]);
                setTerm("");
                pick({ lat: r.lat, lng: r.lng });
              }}
              style={{ textAlign: "left", background: CARD, border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 11.5, color: INK, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4 }}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      <MapPicker value={point} onPick={pick} zoom={known ? 16 : 12} label="Move the map to place the pin on your studio" />

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={useMyLocation} disabled={busy === "here"} style={btn}>
          {busy === "here" ? "Finding you…" : "◎ Use my location"}
        </button>
        {detected ? <span style={{ ...btn, cursor: "default", display: "inline-flex", alignItems: "center", color: SUB }}>{detected}</span> : null}
      </div>

      <div style={{ marginTop: 8, background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "9px 11px" }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED }}>THE PIN IS ON</div>
        <div style={{ fontSize: 11.5, color: known ? INK : SUB, marginTop: 3, lineHeight: 1.45 }}>
          {busy === "address" ? "Looking up the address…" : address ?? (known ? area ?? "A point already on record. Move the map to change it." : "Nothing yet. Move the map, search, or use your location.")}
        </div>
        {area ? <div style={{ fontSize: 10.5, color: SUB, marginTop: 4 }}>Area: {area}</div> : null}
      </div>

      {note ? <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 6, lineHeight: 1.45 }}>{note}</div> : null}
    </div>
  );
}
