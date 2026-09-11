"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

export interface MapPoint {
  lat: number;
  lng: number;
}

/** A PLACE DRAWN ON THE MAP — a studio on Discover's map view. Pressing it
 *  opens the place; the marker carries the name so a screen reader has
 *  something to read. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href: string;
  /** the colour the pin wears; the app's pink otherwise */
  tint?: string;
}

/* ── loading the Maps JavaScript API, exactly once ─────────────────────────── */

declare global {
  interface Window {
    google?: typeof google;
    __dosMapsPromise?: Promise<MapsLibraries>;
    /** the name in the script URL's `callback=` — Google calls it when the
     *  libraries are genuinely ready, which is the whole point of it */
    __dosMapsReady?: () => void;
  }
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/** The two constructors this app uses, once they are really available. */
interface MapsLibraries {
  Map: new (el: HTMLElement, opts?: google.maps.MapOptions) => google.maps.Map;
  AdvancedMarkerElement: new (
    opts?: google.maps.marker.AdvancedMarkerElementOptions
  ) => google.maps.marker.AdvancedMarkerElement;
}

/** ONE SCRIPT TAG FOR THE WHOLE APP, however many maps are on the page.
 *
 *  Google's loader complains if it is included twice, and React in development
 *  mounts every component twice — so the promise is parked on `window` rather
 *  than in a module variable or a hook. A second map awaits the first one's
 *  load instead of starting its own.
 *
 *  ⚠ THE SCRIPT'S `load` EVENT IS NOT "MAPS IS READY" (11 Sep 2026, and it cost
 *  two debugging rounds to establish). The obvious implementation — resolve on
 *  the tag's `load` — fails with **"google.maps.Map is not a constructor"**:
 *  `window.google.maps` is defined almost immediately, so every plausible
 *  readiness check passes while the classes are still being fetched. The next
 *  obvious fix, `google.maps.importLibrary`, fails too — **"importLibrary is
 *  not a function"** — because that only exists when the API is loaded through
 *  Google's dynamic-import bootstrap, which this plain script tag is not.
 *
 *  What actually works is the oldest and most boring mechanism Google has:
 *  `callback=`. The API calls that global itself, once, when the libraries it
 *  was asked for are genuinely usable. So the promise resolves there and
 *  nowhere else.
 *
 *  `libraries=marker` is not optional either: it is where AdvancedMarkerElement
 *  lives, and asking for it in the URL rather than later is what stops a marker
 *  racing the map that draws it. */
function loadMaps(): Promise<MapsLibraries> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.__dosMapsPromise) {
    return window.__dosMapsPromise;
  }

  window.__dosMapsPromise = new Promise<MapsLibraries>((resolve, reject) => {
    if (!MAPS_KEY) {
      reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY is not set"));
      return;
    }

    const ready = () => {
      const maps = window.google?.maps;
      if (typeof maps?.Map !== "function") {
        reject(new Error("Maps loaded but google.maps.Map is still not a constructor"));
        return;
      }
      if (typeof maps.marker?.AdvancedMarkerElement !== "function") {
        reject(new Error("Maps loaded without the marker library"));
        return;
      }
      resolve({ Map: maps.Map, AdvancedMarkerElement: maps.marker.AdvancedMarkerElement });
    };

    /* already here, from a previous mount in the same tab */
    if (typeof window.google?.maps?.Map === "function") {
      ready();
      return;
    }

    window.__dosMapsReady = ready;

    const existing = document.querySelector<HTMLScriptElement>("script[data-dos-maps]");
    if (existing) {
      /* somebody else's tag is already in flight; its callback is ours now */
      existing.addEventListener("error", () => reject(new Error("the Maps script could not be fetched")));
      return;
    }
    const tag = document.createElement("script");
    tag.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&libraries=marker&v=weekly&loading=async&callback=__dosMapsReady`;
    tag.async = true;
    tag.defer = true;
    tag.dataset.dosMaps = "1";
    tag.addEventListener("error", () => reject(new Error("the Maps script could not be fetched")));
    document.head.appendChild(tag);
  });

  /* a failed load must not poison every later attempt */
  window.__dosMapsPromise.catch(() => {
    window.__dosMapsPromise = undefined;
  });

  return window.__dosMapsPromise;
}

export const isMapsConfigured = (): boolean => Boolean(MAPS_KEY);

/** THE PIN DOES NOT MOVE; THE MAP MOVES UNDER IT (11 Sep 2026).
 *
 *  Every delivery app in India picks a location this way, and it is not a
 *  fashion: a marker you drag needs a finger ON the thing it is trying to be
 *  precise about, so your own hand covers the answer. A fixed centre pin keeps
 *  the target visible the whole time and turns "place the pin" into "move the
 *  map", which a thumb can do accurately. It also means there is exactly one
 *  point at all times — no state where the pin is somewhere the map is not.
 *
 *  `onPick` fires when the gesture ENDS (Google's `idle`), not during it, so a
 *  drag across the city is one reverse-geocode rather than four hundred.
 *
 *  WHEN THERE IS NO KEY, OR GOOGLE IS OUT OF QUOTA, this draws a plain panel
 *  saying so and the surrounding form still works. A map service having a day
 *  must never be the reason somebody cannot finish setting up their studio. */
export function GoogleMapPicker({
  value,
  zoom = 15,
  height = 260,
  onPick,
  label = "Choose the location",
  markers = [],
  showPin = true,
}: {
  value: MapPoint;
  zoom?: number;
  height?: number;
  onPick?: (point: MapPoint) => void;
  label?: string;
  /** places to draw — Discover's map view; empty for a picker */
  markers?: MapMarker[];
  /** the fixed centre pin; off when the map is for LOOKING rather than choosing */
  showPin?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const lib = useRef<MapsLibraries | null>(null);
  const drawn = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">(MAPS_KEY ? "loading" : "failed");
  const [centre, setCentre] = useState<MapPoint>(value);
  /* where WE last put the map — so a settle at that point is not a gesture */
  const known = useRef<MapPoint>(value);

  /* the latest onPick, without making it a dependency of the map's creation —
     re-creating a map because a callback identity changed is how a picker ends
     up flickering and losing its centre */
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  /* ── create the map once ── */
  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((libs) => {
        lib.current = libs;
        if (cancelled || !box.current || map.current) {
          return;
        }
        const m = new libs.Map(box.current, {
          center: value,
          zoom,
          /* a vector map id is what AdvancedMarkerElement needs; DEMO_MAP_ID is
             Google's own and works without configuring a style of our own */
          mapId: "DANCEOS_MAP",
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        map.current = m;
        known.current = value;
        if (showPin) {
          /* ⚠ ONLY A MOVE IS AN ANSWER (11 Sep 2026, found by the e2e suite).
             Google fires `idle` when the map has FIRST RENDERED too, and this
             listener used to report that as a pick. So opening a sheet with no
             city known — the map on India's centre — "placed" a pin nobody had
             touched: the picker reverse-geocoded 22.97,78.66 to Pipariya Khurd,
             a village in Madhya Pradesh, and wrote it over the Pune an owner
             had just chosen. An event published in Pune was saved there.

             The settle counts only when the centre is somewhere WE did not put
             it — not the opening point, not a `panTo` from a search result, not
             a zoom from the +/- buttons (which keeps the centre). A drag or a
             pinch moves it, and that is the gesture every map-pin app in the
             world means by "put the pin on your door". ~1 m of tolerance, for
             the tile-pixel rounding Google applies when it lands. */
          m.addListener("idle", () => {
            const c = m.getCenter();
            if (!c) return;
            if (Math.abs(c.lat() - known.current.lat) < 1e-5 && Math.abs(c.lng() - known.current.lng) < 1e-5) {
              return;
            }
            const next = { lat: Number(c.lat().toFixed(6)), lng: Number(c.lng().toFixed(6)) };
            known.current = next;
            setCentre(next);
            pick.current?.(next);
          });
        }
        setState("ready");
      })
      .catch((e: unknown) => {
        /* SAY WHY. A map that fails silently is a map nobody can fix: the panel
           the user sees has to be vague ("Google is not answering"), so the
           reason has to go somewhere, and the console is where somebody looking
           for it will be. */
        console.error("[DanceOS] the map could not be drawn:", e);
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── the parent moved the point (a search result, "use my location") ──
     Keyed on the NUMBERS, not the object: a parent that rebuilds `{lat, lng}`
     on every render would otherwise pan the map on every render, which reads as
     a map that will not hold still. The guard below then ignores a move the map
     has already made itself, so the `idle` listener and this effect cannot
     chase each other. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (c && Math.abs(c.lat() - value.lat) < 1e-6 && Math.abs(c.lng() - value.lng) < 1e-6) {
      return;
    }
    known.current = value;
    m.panTo(value);
    setCentre(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lng]);

  /* ── the parent asked for a different zoom ── The picker opens on a city
     (11) and asks for a street (16) once a pin is placed; until 11 Sep 2026
     `zoom` was read only when the map was built, so a searched address panned
     the map to the right point at city scale — and "fine-tune the pin" at
     city scale is a gesture of two kilometres. Keyed on the PROP, so a person
     who has zoomed by hand is not snapped back on every render; and only when
     it differs from what the map shows, so it is one move, not a fight. */
  useEffect(() => {
    const m = map.current;
    if (!m || m.getZoom() === zoom) return;
    m.setZoom(zoom);
  }, [zoom]);

  /* ── the places, redrawn when they change ── */
  const paint = useCallback(() => {
    const m = map.current;
    const libs = lib.current;
    if (!m || !libs) return;
    drawn.current.forEach((mk) => {
      mk.map = null;
    });
    drawn.current = [];
    markers.forEach((mk) => {
      const el = document.createElement("a");
      el.setAttribute("href", mk.href);
      el.setAttribute("aria-label", mk.label);
      el.title = mk.label;
      el.style.cssText = `display:block;width:18px;height:18px;border-radius:50%;background:${mk.tint ?? "#EC4899"};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);cursor:pointer`;
      drawn.current.push(
        new libs.AdvancedMarkerElement({ map: m, position: { lat: mk.lat, lng: mk.lng }, content: el, title: mk.label })
      );
    });
  }, [markers]);

  useEffect(() => {
    if (state === "ready") paint();
  }, [state, paint]);

  if (state === "failed") {
    return (
      <div>
        <div
          role="img"
          aria-label={`${label} — the map is unavailable`}
          style={{ height, borderRadius: 16, border: `1px dashed ${EL}`, background: CARD, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, boxSizing: "border-box" }}
        >
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: INK }}>The map is not available right now</div>
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 5, lineHeight: 1.5, maxWidth: 280 }}>
              {MAPS_KEY
                ? "Google is not answering — it may be out of quota for today. Search for the address instead; everything else on this screen still works."
                : "No Google Maps key is configured, so there is nothing to draw. Search for the address instead."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", height, borderRadius: 16, overflow: "hidden", border: `1px solid ${EL}`, background: "#0b1220" }}>
        <div ref={box} role="application" aria-label={label} style={{ position: "absolute", inset: 0 }} />

        {showPin ? (
          <>
            {/* the pin, dead centre, drawn over everything and touchable by nothing */}
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", filter: "drop-shadow(0 3px 5px rgba(0,0,0,.45))", zIndex: 3 }}>
              <svg width="30" height="42" viewBox="0 0 30 42" aria-hidden="true">
                <path d="M15 41C15 41 28 25.5 28 15A13 13 0 1 0 2 15c0 10.5 13 26 13 26Z" fill="#EC4899" stroke="#fff" strokeWidth="2.5" />
                <circle cx="15" cy="15" r="4.6" fill="#fff" />
              </svg>
            </div>
            {/* the spot the pin points AT, so the pin's own body never hides it */}
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3, background: "rgba(0,0,0,.55)", border: "1.5px solid #fff", pointerEvents: "none", zIndex: 3 }} />
          </>
        ) : null}

        {state === "loading" ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: CARD, color: SUB, fontSize: 11.5, fontWeight: 800 }}>
            Loading the map…
          </div>
        ) : null}
      </div>

      {showPin ? (
        <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: MUTED, flex: 1, minWidth: 0 }}>Drag the map so the pin sits on your door.</span>
          <span style={{ fontSize: 10, color: SUB, fontVariantNumeric: "tabular-nums" }}>
            {centre.lat.toFixed(5)}, {centre.lng.toFixed(5)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
