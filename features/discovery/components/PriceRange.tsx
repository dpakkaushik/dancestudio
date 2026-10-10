"use client";

import { useEffect, useRef, useState } from "react";

/** THE PRICE BAR (10 Oct 2026, the user: "a price range bar which can slide from
 *  both ends in filters according to the relevant section"; re-cut the same day:
 *  "make the price bar better and more responsive").
 *
 *  Two thumbs on one track, from ₹0 to the dearest class in this city (`ceil`,
 *  the page's own number). A thumb at its own end means "no bound on that side",
 *  so a bar at both ends narrows nothing and the Filters button does not count it.
 *
 *  ⚠ ONE POINTER SURFACE, NOT TWO STACKED NATIVE INPUTS. The first cut laid two
 *  `<input type="range">` over each other and only their 22px thumbs took a
 *  pointer, so a press anywhere else on the bar did nothing and two thumbs parked
 *  together could not be told apart. Now the whole 44px strip is the control: a
 *  press moves the NEAREST thumb there and drags it, with `touch-action: none` so
 *  a sideways drag on a phone is never taken for a scroll.
 *
 *  ⚠ RESPONSIVE WITHOUT A RENDER PER PIXEL. The words, the fill and a bubble over
 *  the moving thumb follow the finger at once (local state); the list is asked
 *  for when the thumb RESTS for a moment (`SETTLE_MS`) and again on release — so
 *  results update while you are still holding, and a held drag is not a server
 *  render per pixel. Arrow keys work the same way: four presses, one request.
 *
 *  ⚠ The parent keys this on `ceil` only. When the committed values come back
 *  from the address they are adopted unless a thumb is in the hand, so Reset all
 *  and the Free chip still put the thumbs where the address says. */
const STEP = 50;
const SETTLE_MS = 350;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const snap = (n: number, ceil: number) => Math.max(0, Math.min(ceil, Math.round(n / STEP) * STEP));

type Thumb = "lo" | "hi";

export function PriceRange({ ceil, min, max, onCommit }: { ceil: number; min: number | null; max: number | null; onCommit: (min: number | null, max: number | null) => void }) {
  const fromProps = { lo: Math.min(min ?? 0, ceil), hi: Math.min(max ?? ceil, ceil) };
  const [val, setVal] = useState(fromProps);
  const [held, setHeld] = useState<Thumb | null>(null);
  /* the committed pair as the address last said it — adopted while nothing is held */
  const [seen, setSeen] = useState({ min, max });
  if ((seen.min !== min || seen.max !== max) && held === null) {
    setSeen({ min, max });
    setVal(fromProps);
  }

  const track = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const last = useRef({ min, max });
  const valRef = useRef(val);
  useEffect(() => {
    last.current = { min, max };
  }, [min, max]);
  useEffect(() => {
    valRef.current = val;
  }, [val]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const commitNow = (v: { lo: number; hi: number }) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const nextMin = v.lo <= 0 ? null : v.lo;
    const nextMax = v.hi >= ceil ? null : v.hi;
    if (nextMin === last.current.min && nextMax === last.current.max) return;
    onCommit(nextMin, nextMax);
  };
  const commitSoon = (v: { lo: number; hi: number }) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commitNow(v), SETTLE_MS);
  };

  const pct = (n: number) => (ceil > 0 ? n / ceil : 0);
  const valueAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return snap(((clientX - r.left) / r.width) * ceil, ceil);
  };
  const place = (thumb: Thumb, n: number) => {
    const cur = valRef.current;
    const next = thumb === "lo" ? { lo: Math.min(n, cur.hi), hi: cur.hi } : { lo: cur.lo, hi: Math.max(n, cur.lo) };
    if (next.lo === cur.lo && next.hi === cur.hi) return next;
    setVal(next);
    valRef.current = next;
    commitSoon(next);
    return next;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const n = valueAt(e.clientX);
    const { lo, hi } = valRef.current;
    /* the nearer thumb; when they sit together, the side you are pulling toward */
    const thumb: Thumb = lo === hi ? (n < lo ? "lo" : "hi") : Math.abs(n - lo) <= Math.abs(n - hi) ? "lo" : "hi";
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(thumb);
    place(thumb, n);
    (e.currentTarget.querySelector(`[data-thumb="${thumb}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!held) return;
    e.preventDefault();
    place(held, valueAt(e.clientX));
  };
  const onUp = () => {
    if (!held) return;
    setHeld(null);
    commitNow(valRef.current);
  };

  const onKey = (thumb: Thumb) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cur = valRef.current[thumb];
    const big = Math.max(STEP, snap(ceil / 10, ceil));
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? cur + STEP
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? cur - STEP
      : e.key === "PageUp" ? cur + big
      : e.key === "PageDown" ? cur - big
      : e.key === "Home" ? 0
      : e.key === "End" ? ceil
      : null;
    if (to === null) return;
    e.preventDefault();
    place(thumb, snap(to, ceil));
  };

  const { lo, hi } = val;
  const words = lo <= 0 && hi >= ceil ? "Any price" : hi <= 0 ? "Free only" : `${lo <= 0 ? "₹0" : rupees(lo)} – ${hi >= ceil ? `${rupees(ceil)}+` : rupees(hi)}`;
  const label = (n: number, thumb: Thumb) => (thumb === "hi" && n >= ceil ? `${rupees(ceil)}+` : n <= 0 ? "Free" : rupees(n));

  /* the quick picks — the same address the bar writes, so they light up when the bar matches */
  const third = snap(ceil / 3, ceil);
  const presets: Array<{ key: string; words: string; lo: number; hi: number }> = [
    { key: "free", words: "Free", lo: 0, hi: 0 },
    { key: "low", words: `Under ${rupees(third || STEP)}`, lo: 0, hi: third || STEP },
    { key: "mid", words: `${rupees(third)} – ${rupees(snap((ceil * 2) / 3, ceil))}`, lo: third, hi: snap((ceil * 2) / 3, ceil) },
    { key: "any", words: "Any", lo: 0, hi: ceil },
  ].filter((p, i, all) => all.findIndex((q) => q.lo === p.lo && q.hi === p.hi) === i);

  const thumb = (t: Thumb, n: number) => (
    <div
      key={t}
      data-thumb={t}
      role="slider"
      tabIndex={0}
      aria-label={t === "lo" ? "Minimum price" : "Maximum price"}
      aria-valuemin={0}
      aria-valuemax={ceil}
      aria-valuenow={n}
      aria-valuetext={label(n, t) === "Free" ? "₹0" : t === "hi" && n >= ceil ? `${rupees(ceil)} and up` : rupees(n)}
      onKeyDown={onKey(t)}
      onBlur={() => commitNow(valRef.current)}
      className="dos-range-thumb"
      data-held={held === t ? "true" : undefined}
      style={{
        position: "absolute",
        top: "50%",
        left: `calc(${pct(n)} * 100%)`,
        /* the low thumb rides on top once it is near the right end, or two thumbs
           parked at the ceiling could never be pulled apart */
        zIndex: held === t ? 4 : t === "lo" && lo > ceil * 0.9 ? 3 : 2,
      }}
    >
      {held === t ? (
        <span aria-hidden="true" className="dos-range-bubble">
          {label(n, t)}
        </span>
      ) : null}
    </div>
  );

  return (
    <div data-testid="price-range" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span data-testid="price-range-words" aria-live="polite" style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {words}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)" }}>up to {rupees(ceil)}</span>
      </div>
      <div
        className="dos-range"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ position: "relative", height: 44, padding: "0 14px", touchAction: "none", cursor: held ? "grabbing" : "pointer", userSelect: "none", WebkitUserSelect: "none" }}
      >
        <div ref={track} style={{ position: "relative", height: "100%" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 6, marginTop: -3, borderRadius: 3, background: "var(--el)" }} />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              height: 6,
              marginTop: -3,
              borderRadius: 3,
              background: "var(--text)",
              left: `calc(${pct(lo)} * 100%)`,
              width: `calc(${Math.max(0, pct(hi) - pct(lo))} * 100%)`,
              transition: held ? "none" : "left .15s ease, width .15s ease",
            }}
          />
          {thumb("lo", lo)}
          {thumb("hi", hi)}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {presets.map((p) => {
          const on = p.lo === lo && p.hi === hi;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              data-testid={`price-preset-${p.key}`}
              onClick={() => {
                const next = { lo: p.lo, hi: p.hi };
                setVal(next);
                valRef.current = next;
                commitNow(next);
              }}
              style={{ height: 30, padding: "0 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? "var(--text)" : "transparent", color: on ? "var(--solid)" : "var(--sub)", border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` }}
            >
              {p.words}
            </button>
          );
        })}
      </div>
    </div>
  );
}
