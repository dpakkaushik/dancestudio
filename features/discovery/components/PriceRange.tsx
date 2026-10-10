"use client";

import { useState } from "react";

/** THE PRICE BAR (10 Oct 2026, the user: "a price range bar which can slide from
 *  both ends in filters according to the relevant section"). Two thumbs on one
 *  track, from ₹0 to the dearest class in this city (`ceil`, the page's own
 *  number). The thumbs move freely while dragged and the list is asked for once,
 *  on release — a replace of the address per pixel would be a server render per
 *  pixel. A thumb at its own end means "no bound on that side", so a bar at both
 *  ends narrows nothing and the Filters button does not count it.
 *
 *  ⚠ Two native range inputs laid over one another (the track and the fill are
 *  ours, drawn under them). Each keeps its own accessible name and keyboard: an
 *  arrow key moves a thumb by one step and its release commits. The parent keys
 *  this component on the committed values, so Reset all puts the thumbs back. */
const STEP = 50;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function PriceRange({ ceil, min, max, onCommit }: { ceil: number; min: number | null; max: number | null; onCommit: (min: number | null, max: number | null) => void }) {
  const [lo, setLo] = useState(Math.min(min ?? 0, ceil));
  const [hi, setHi] = useState(Math.min(max ?? ceil, ceil));
  const commit = (l: number, h: number) => {
    const nextMin = l <= 0 ? null : l;
    const nextMax = h >= ceil ? null : h;
    if (nextMin === min && nextMax === max) return;
    onCommit(nextMin, nextMax);
  };
  const pct = (n: number) => (ceil > 0 ? n / ceil : 0);
  const words = lo <= 0 && hi >= ceil ? "Any price" : hi <= 0 ? "Free only" : `${rupees(lo)} – ${hi >= ceil ? `${rupees(ceil)}+` : rupees(hi)}`;
  const release = () => commit(lo, hi);
  return (
    <div data-testid="price-range" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span data-testid="price-range-words" style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>
          {words}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)" }}>up to {rupees(ceil)}</span>
      </div>
      <div className="dos-range" style={{ position: "relative", height: 30 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 11, right: 11, top: 13, height: 4, borderRadius: 2, background: "var(--el)" }} />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 13,
            height: 4,
            borderRadius: 2,
            background: "var(--text)",
            left: `calc(${pct(lo)} * (100% - 22px) + 11px)`,
            width: `calc(${Math.max(0, pct(hi) - pct(lo))} * (100% - 22px))`,
          }}
        />
        <input
          type="range"
          min={0}
          max={ceil}
          step={STEP}
          value={lo}
          aria-label="Minimum price"
          aria-valuetext={rupees(lo)}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={release}
          onTouchEnd={release}
          onKeyUp={release}
          /* the low thumb rides on top once it is near the right end, or two
             thumbs parked at the ceiling could never be pulled apart */
          style={{ zIndex: lo > ceil * 0.9 ? 3 : 2 }}
        />
        <input
          type="range"
          min={0}
          max={ceil}
          step={STEP}
          value={hi}
          aria-label="Maximum price"
          aria-valuetext={hi >= ceil ? `${rupees(ceil)} and up` : rupees(hi)}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={release}
          onTouchEnd={release}
          onKeyUp={release}
          style={{ zIndex: 2 }}
        />
      </div>
    </div>
  );
}
