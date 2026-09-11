"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const TILE = 256;

/** WEB MERCATOR, WHICH IS ALL A SLIPPY MAP IS.
 *
 *  There is no mapping library here on purpose. A pan-and-zoom tile map is
 *  four functions and a grid of images, and the alternative was adding a
 *  dependency to a `node_modules` that is a pnpm store this machine has already
 *  broken once. What follows is the standard projection every tile server uses:
 *  the world is one tile at zoom 0 and four times as many at each zoom after
 *  it, so a coordinate in "tile units" times 256 is a pixel on the whole-world
 *  canvas. Everything else is subtraction. */
const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z);
const latToY = (lat: number, z: number) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
};
const xToLng = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
const yToLat = (y: number, z: number) => {
  const n = Math.PI - 2 * Math.PI * (y / Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface MapPoint {
  lat: number;
  lng: number;
}

/** A PLACE DRAWN ON THE MAP (11 Sep 2026) — a studio on Discover's map view.
 *  Pressing it opens the place; the pin itself carries the name so a screen
 *  reader has something to read. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href: string;
  /** the colour the pin wears; the app's pink otherwise */
  tint?: string;
}

/** THE PIN DOES NOT MOVE; THE MAP MOVES UNDER IT (11 Sep 2026).
 *
 *  Every delivery app in India picks a location this way, and it is not a
 *  fashion: a marker you drag needs a finger ON the thing it is trying to be
 *  precise about, so your own hand covers the answer. A fixed centre pin keeps
 *  the target visible the whole time and turns "place the pin" into "move the
 *  map", which a thumb can do accurately. It also means there is exactly one
 *  point at all times — no state where the pin is somewhere the map is not.
 *
 *  `onPick` fires when the gesture ENDS, not during it, so a drag across the
 *  city is one reverse-geocode rather than four hundred. */
export function MapPicker({
  value,
  zoom: initialZoom = 15,
  height = 260,
  onPick,
  label = "Choose the location",
  markers = [],
  showPin = true,
}: {
  value: MapPoint;
  zoom?: number;
  height?: number;
  onPick: (point: MapPoint) => void;
  label?: string;
  /** places to draw — Discover's map view; empty for a picker */
  markers?: MapMarker[];
  /** the fixed centre pin; off when the map is for LOOKING rather than choosing */
  showPin?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: height });
  const [centre, setCentre] = useState<MapPoint>(value);
  const [zoom, setZoom] = useState(clamp(initialZoom, 3, 19));

  /** THE CENTRE IS HELD TWICE, AND IT HAS TO BE (11 Sep 2026).
   *
   *  `centre` is state because the map is drawn from it. The ref is the same
   *  value readable OUTSIDE a render, and the reason is a bug this had on the
   *  first try: reporting the pin by reaching for the latest centre inside a
   *  `setCentre(c => …)` updater calls the PARENT's setState from inside a
   *  function React runs while rendering, which is the "Cannot update a
   *  component while rendering a different component" error. The updater is for
   *  computing the next state and nothing else; anything with an effect on the
   *  world reads the ref instead. */
  const centreRef = useRef<MapPoint>(value);
  const moveTo = useCallback((next: MapPoint) => {
    centreRef.current = next;
    setCentre(next);
  }, []);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef<{ points: Map<number, { x: number; y: number }>; gap: number; zoom: number } | null>(null);

  /* the parent may move the point (a search result, "use my location"), and
     when it does the map follows — but never mid-gesture, which would fight
     the finger */
  useEffect(() => {
    if (!drag.current) {
      moveTo(value);
    }
  }, [value.lat, value.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    const measure = () => setSize({ w: el.clientWidth || 320, h: el.clientHeight || height });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const view = useMemo(() => {
    const cx = lngToX(centre.lng, zoom) * TILE;
    const cy = latToY(centre.lat, zoom) * TILE;
    const left = cx - size.w / 2;
    const top = cy - size.h / 2;
    const n = Math.pow(2, zoom);
    const tiles: Array<{ key: string; x: number; y: number; sx: number; sy: number }> = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx += 1) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty += 1) {
        /* the world wraps sideways and does not wrap top to bottom */
        if (ty < 0 || ty >= n) {
          continue;
        }
        const wrapped = ((tx % n) + n) % n;
        tiles.push({ key: `${zoom}/${tx}/${ty}`, x: wrapped, y: ty, sx: tx * TILE - left, sy: ty * TILE - top });
      }
    }
    return { left, top, tiles };
  }, [centre.lat, centre.lng, zoom, size.w, size.h]);

  /** move the centre by a pixel delta, the same maths backwards */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const c = centreRef.current;
      const cx = lngToX(c.lng, zoom) * TILE - dx;
      const cy = latToY(c.lat, zoom) * TILE - dy;
      moveTo({
        lng: xToLng(cx / TILE, zoom),
        lat: clamp(yToLat(cy / TILE, zoom), -85, 85),
      });
    },
    [zoom, moveTo]
  );

  /** the gesture is over: say where the pin ended up, ONCE */
  const settle = useCallback(() => {
    const c = centreRef.current;
    onPick({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) });
  }, [onPick]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pinch.current) {
      pinch.current.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (drag.current) {
      /* a second finger turns a drag into a pinch */
      const first = drag.current;
      const points = new Map([
        [first.id, { x: first.x, y: first.y }],
        [e.pointerId, { x: e.clientX, y: e.clientY }],
      ]);
      const [a, b] = [...points.values()];
      pinch.current = { points, gap: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
      drag.current = null;
      return;
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinch.current?.points.has(e.pointerId)) {
      pinch.current.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pinch.current.points.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(clamp(Math.round(pinch.current.zoom + Math.log2(gap / pinch.current.gap)), 3, 19));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) {
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      d.moved = true;
    }
    d.x = e.clientX;
    d.y = e.clientY;
    panBy(dx, dy);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinch.current) {
      pinch.current.points.delete(e.pointerId);
      if (pinch.current.points.size < 2) {
        pinch.current = null;
        settle();
      }
      return;
    }
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      drag.current = null;
      if (d.moved) {
        settle();
      }
    }
  };

  const step = (by: number) => {
    setZoom((z) => clamp(z + by, 3, 19));
    /* the centre is unchanged by a zoom step, so the point is unchanged too —
       nothing to report */
  };

  return (
    <div>
      <div
        ref={box}
        role="application"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          setZoom((z) => clamp(z + (e.deltaY < 0 ? 1 : -1), 3, 19));
        }}
        style={{
          position: "relative",
          height,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${EL}`,
          background: "#0b1220",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* A map tile is not content. It is one of a moving grid of a dozen
            256px images that change on every pan, served by a CDN that is
            already sized for exactly this — next/image would proxy each one
            through the optimiser, which is both slower and, on Vercel, billed
            per transformation. */}
        {view.tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={TILE}
            height={TILE}
            style={{ position: "absolute", left: t.sx, top: t.sy, width: TILE, height: TILE, pointerEvents: "none" }}
          />
        ))}

        {/* THE PLACES (11 Sep 2026) — each a door, positioned by the same maths
            the tiles are. A marker off the edge is simply not drawn. */}
        {markers.map((m) => {
          const x = lngToX(m.lng, zoom) * TILE - view.left;
          const y = latToY(m.lat, zoom) * TILE - view.top;
          if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) {
            return null;
          }
          const tint = m.tint ?? "#EC4899";
          return (
            <a
              key={m.id}
              href={m.href}
              aria-label={m.label}
              title={m.label}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -100%)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.45))", lineHeight: 0, zIndex: 2 }}
            >
              <svg width="24" height="34" viewBox="0 0 30 42" aria-hidden="true">
                <path d="M15 41C15 41 28 25.5 28 15A13 13 0 1 0 2 15c0 10.5 13 26 13 26Z" fill={tint} stroke="#fff" strokeWidth="2.5" />
                <circle cx="15" cy="15" r="4.6" fill="#fff" />
              </svg>
            </a>
          );
        })}

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

        <div style={{ position: "absolute", right: 8, top: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {([["＋", 1, "Zoom in"], ["－", -1, "Zoom out"]] as Array<[string, number, string]>).map(([glyph, by, name]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              onClick={() => step(by)}
              style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${EL}`, background: CARD, color: INK, fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {glyph}
            </button>
          ))}
        </div>

        {/* OpenStreetMap's licence asks for this, and it is not optional */}
        <div style={{ position: "absolute", right: 0, bottom: 0, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 8.5, padding: "2px 5px", borderTopLeftRadius: 6, pointerEvents: "auto" }}>
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
            OpenStreetMap
          </a>
        </div>
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
