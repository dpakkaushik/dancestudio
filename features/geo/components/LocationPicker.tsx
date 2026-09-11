"use client";

import { useCallback, useRef, useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";
import { GoogleMapPicker, type MapPoint } from "./GoogleMap";
import { PlaceSearch, type ResolvedPlace } from "./PlaceSearch";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

export interface PickedLocation {
  lat: number;
  lng: number;
  /** the locality, as Google names it — what `tenants.area` holds */
  area: string | null;
  /** the city, as Google names it. NOT checked against a list any more: the
   *  database folds aliases (Bengaluru/Bangalore) onto one canonical name and
   *  registers anything it has not seen, so a studio in a city DanceOS never
   *  thought of is now a studio in that city. */
  city: string | null;
  /** the whole address, for showing back what was chosen */
  label: string | null;
}

/** WHERE A BUSINESS ACTUALLY IS (11 Sep 2026, rebuilt on Google).
 *
 *  Until the picker existed, every studio in a city sat on the SAME
 *  coordinates — its city's centroid, written by `create_tenant_with_owner`
 *  because there was no way to ask. Discover measured centroid to centroid, so
 *  "2.4 km away" was the same 2.4 km for every studio in Pune and "nearest
 *  first" was not an order at all.
 *
 *  THE ORDER IS THE FLOW (the user, looking at the first version: "after
 *  filling the studio name the user gets the option to use my location;
 *  location and address are picked, city is picked from the Google address;
 *  when the user fills 'where it is' it auto-suggests the address"). So the
 *  two ways of ARRIVING at a point come first and large — search the address
 *  (Google suggests as you type) or press one button and let the phone say —
 *  and the map comes after, as the place to check and fine-tune what they
 *  gave. Every way in ends the same: a lat/lng, the address underneath it, and
 *  the area and city read off that address for the form to fill itself with.
 *
 *  NOTHING IS GEOCODED ON ARRIVAL, deliberately. The address for a point we
 *  already hold is a question that spends a request, and opening a sheet is not
 *  a reason to spend one — a picker that geocodes on mount costs a call for
 *  every person who opens the sheet and closes it again. The stored `area` is
 *  what the business already says about itself, and it is what the panel shows
 *  until somebody actually moves the pin. */
export function LocationPicker({
  value,
  centre,
  onChange,
}: {
  value: { lat: number | null; lng: number | null; area: string | null };
  /** where the map opens when this business has no point yet — the city it
   *  named, resolved by the caller; India's centre if it named none */
  centre?: { lat: number; lng: number } | null;
  onChange: (picked: PickedLocation) => void;
}) {
  /* the geographic centre of India, so a map with nothing to go on opens on the
     country rather than on the Atlantic */
  const fallback = centre ?? { lat: 22.9734, lng: 78.6569 };
  const known = value.lat !== null && value.lng !== null;
  const [point, setPoint] = useState<MapPoint>({ lat: value.lat ?? fallback.lat, lng: value.lng ?? fallback.lng });
  const [address, setAddress] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(value.area);
  const [city, setCity] = useState<string | null>(null);
  const [busy, setBusy] = useState<"here" | "address" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const seq = useRef(0);

  /** the address under a point — what makes a pair of numbers legible */
  const describe = useCallback(
    async (p: MapPoint) => {
      const mine = ++seq.current;
      setBusy("address");
      try {
        const res = await fetch(`/api/places?lat=${p.lat}&lng=${p.lng}`);
        const body = (await res.json()) as { place: ResolvedPlace | null; configured?: boolean };
        if (mine !== seq.current) {
          return;
        }
        const place = body.place;
        setAddress(place?.label ?? null);
        setArea(place?.area ?? null);
        setCity(place?.city ?? null);
        /* SAY WHY there is no address (11 Sep 2026). A deployment without
           GOOGLE_MAPS_KEY answered every lookup with null, and the panel's
           fallback line read as if the location had failed. The pin is real
           either way — it is the words for it that are missing. */
        if (!place) {
          setNote(
            body.configured === false
              ? "The pin is placed, but this server has no Google key to look up its address — type the area and city yourself."
              : "The pin is placed, but Google could not name the address just now — type the area and city yourself."
          );
        }
        onChange({ lat: p.lat, lng: p.lng, area: place?.area ?? null, city: place?.city ?? null, label: place?.label ?? null });
      } catch {
        /* the map still works; only the words for it are missing */
        if (mine === seq.current) {
          setAddress(null);
          onChange({ lat: p.lat, lng: p.lng, area, city, label: null });
        }
      } finally {
        if (mine === seq.current) {
          setBusy(null);
        }
      }
    },
    [onChange, area, city]
  );

  /** the map settled somewhere new */
  const moved = useCallback(
    (p: MapPoint) => {
      setTouched(true);
      setPoint(p);
      void describe(p);
    },
    [describe]
  );

  /** a searched address already carries everything — no second call for it */
  const chose = (place: ResolvedPlace) => {
    /* six decimals (~11 cm), the same precision a dragged pin is read at — a
       Places result arrives with float noise (18.507351399999997) */
    const p = { lat: Number(place.lat.toFixed(6)), lng: Number(place.lng.toFixed(6)) };
    setTouched(true);
    setPoint(p);
    setAddress(place.label);
    setArea(place.area);
    setCity(place.city);
    setNote(null);
    onChange({ ...p, area: place.area, city: place.city, label: place.label });
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setNote("This browser will not share a location.");
      return;
    }
    setBusy("here");
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        moved({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
      },
      () => {
        setBusy(null);
        setNote("The location was not shared. Search for the address, or move the map.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const placed = touched || known;

  return (
    <div>
      {/* the two ways in, first and large */}
      <PlaceSearch placeholder="Search an address or landmark…" near={point} onPick={chose} />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={busy === "here"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          boxSizing: "border-box",
          marginTop: 8,
          height: 40,
          borderRadius: 12,
          border: "none",
          background: busy === "here" ? EL : "var(--text)",
          color: busy === "here" ? SUB : "var(--solid)",
          fontSize: 12.5,
          fontWeight: 900,
          cursor: busy === "here" ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {busy === "here" ? "Finding you…" : "◎ Use my location"}
      </button>

      {/* what the point resolved to — shown as soon as there is one */}
      {placed || busy === "address" ? (
        <div style={{ marginTop: 8, background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "9px 11px" }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED }}>THE PIN IS ON</div>
          <div style={{ fontSize: 11.5, color: INK, marginTop: 3, lineHeight: 1.45 }}>
            {busy === "address"
              ? "Looking up the address…"
              : address ?? (touched ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} — no address for it yet` : area ?? "A point already on record. Move the map to change it.")}
          </div>
          {address && (area || city) ? (
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 4 }}>
              {area ? `Area: ${area}` : null}
              {area && city ? " · " : null}
              {city ? `City: ${city}` : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* then the map, to check it and fine-tune it */}
      <div style={{ fontSize: 10.5, color: MUTED, margin: "10px 0 6px" }}>
        {placed ? "Drag the map to fine-tune the pin — the address above follows it." : "Or move the map and put the pin on your door."}
      </div>
      <GoogleMapPicker value={point} onPick={moved} zoom={placed ? 16 : 11} label="Move the map to place the pin on your studio" />

      {note ? <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 6, lineHeight: 1.45 }}>{note}</div> : null}
    </div>
  );
}
