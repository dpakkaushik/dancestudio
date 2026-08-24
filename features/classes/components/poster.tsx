"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** The poster kit, lifted from the prototype's shared module (DanceOSApp.jsx:6478-6592
 *  + 128-148 + 3196-3218): every class has a drawn poster — three designs, picked from
 *  the class's own name so it is the same design every time you see it — and the
 *  booking page stands it on a sleeve lit like a music player: the artwork blown up
 *  and blurred as the light source, the dance's own colour laid over it, the sharp
 *  square on top. Uploading your own poster arrives with Step 11; the pass/QR sheet
 *  behind the poster arrives with Step 10. */

export const DOS_POSTERS: Array<[string, string]> = [
  ["bold", "Bold"],
  ["split", "Split"],
  ["quiet", "Quiet"],
];

/** A class that has not been given a poster gets a drawn design picked from its own
 *  name — the same design every time (prototype dosPosterAuto, line 141). */
export const dosPosterAuto = (seedText: string): string => {
  const seed = String(seedText || "class");
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DOS_POSTERS[h % DOS_POSTERS.length][0];
};

export interface PosterItem {
  title: string;
  style: string;
  styleColor: string;
}

/** The drawn poster — a record sleeve, not a flyer: the style's colours cut the way
 *  the design cuts them, no lettering, no frame (prototype PosterBlock, 6526-6592). */
export function PosterBlock({
  item,
  design = "bold",
  size = 96,
  deco = false,
}: {
  item: PosterItem;
  design?: string;
  size?: number;
  deco?: boolean;
}) {
  /* one id PER POSTER INSTANCE — two posters that agree on title+design+size must
     never share a gradient id, or the second paints itself with the first one's art */
  const uid = String(useId()).replace(/[^a-zA-Z0-9]/g, "");
  const col = item.styleColor || "#3B82F6";
  const title = String(item.title || item.style || "Class").trim();
  const S = size;
  const dark = "#0B0B0C";
  const mid = `pm${uid}`;
  return (
    <svg
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      {...(deco
        ? { role: "presentation", "aria-hidden": true }
        : { role: "img", "aria-label": `Poster for ${title}` })}
      style={{ borderRadius: 0, flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={mid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={col} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <clipPath id={`${mid}c`}>
          <rect width={S} height={S} rx={0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${mid}c)`}>
        <rect width={S} height={S} fill={design === "quiet" ? dark : `url(#${mid})`} />
        {design === "bold" ? (
          <>
            <circle cx={S * 0.78} cy={S * 0.24} r={S * 0.34} fill="#fff" opacity=".13" />
            <circle cx={S * 0.2} cy={S * 0.86} r={S * 0.42} fill={col} opacity=".34" />
          </>
        ) : design === "split" ? (
          <>
            <path d={`M0 ${S} L${S} 0 L${S} ${S} Z`} fill={dark} opacity=".72" />
            <circle cx={S * 0.28} cy={S * 0.3} r={S * 0.16} fill="#fff" opacity=".2" />
          </>
        ) : (
          <>
            <rect
              x={S * 0.14}
              y={S * 0.14}
              width={S * 0.72}
              height={S * 0.72}
              rx={S * 0.06}
              fill="none"
              stroke={col}
              strokeWidth={Math.max(1, S * 0.025)}
              opacity=".85"
            />
            <rect x={S * 0.3} y={S * 0.3} width={S * 0.4} height={S * 0.4} rx={S * 0.04} fill={col} opacity=".22" />
          </>
        )}
      </g>
    </svg>
  );
}

/** How much of the sleeve has been scrolled away, 0..1 (prototype useDosFold,
 *  3196-3218). State moves only inside scroll/resize/RAF callbacks. */
export const useDosFold = (h: number): number => {
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  useEffect(() => {
    let raf: number | null = null;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        const H = h || 0;
        if (!H) return;
        const max = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
        const over = Math.max(1, Math.min(H, max));
        const next = Math.max(0, Math.min(1, (window.scrollY || 0) / over));
        if (Math.abs(next - pRef.current) > 0.004) {
          pRef.current = next;
          setP(next);
        }
      });
    };
    const t = window.setTimeout(onScroll, 160); // restored scroll positions settle late
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [h]);
  return p;
};

/** The one sleeve height every booking page means by "the poster" (prototype 6496).
 *  Taller than the poster on purpose: the shadow needs somewhere to fall. */
export const DOS_SLEEVE = 306;

/** The sleeve pins under the top bar and the opaque sheet below slides up over it —
 *  it never shrinks, so the page's height never fights the scroll (prototype
 *  DosPosterSleeve, 6497-6524). Tapping the poster opens the pass sheet
 *  (Step 10) — pass onOpen to make the square the control it is in the
 *  prototype; without it the square stays inert. */
export function DosPosterSleeve({
  item,
  design,
  col,
  heroGone = 0,
  size = 246,
  onOpen,
  label = "Open the pass",
  children,
}: {
  item: PosterItem;
  design: string;
  col: string;
  heroGone?: number;
  size?: number;
  onOpen?: () => void;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-dosfold="poster"
      style={{
        height: DOS_SLEEVE,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "sticky",
        top: "var(--dos-top)",
        zIndex: 0,
        background: "var(--bg)",
      }}
    >
      {/* the cover, blown up and blurred, is the light source */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 0,
          pointerEvents: "none",
          filter: "blur(36px) saturate(1.9) brightness(.62)",
          transform: "scale(1.9)",
          opacity: 0.62 * (1 - heroGone),
        }}
      >
        <PosterBlock item={item} design={design} size={size} deco />
      </span>
      {/* and the dance's own colour over it — a quiet poster is nearly black, and a
          black field behind a black square is not a background, it is a hole */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `linear-gradient(180deg, ${col}5e 0%, ${col}38 58%, ${col}10 100%)`,
          opacity: 1 - heroGone,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "inline-block",
          lineHeight: 0,
          marginTop: 12,
          transform: `translateY(${(heroGone * 54).toFixed(1)}px)`,
          transformOrigin: "50% 40%",
          opacity: Math.max(0, 1 - heroGone * 1.15),
          willChange: "transform, opacity",
          pointerEvents: heroGone > 0.86 ? "none" : "auto",
          visibility: heroGone > 0.86 ? "hidden" : "visible",
        }}
      >
        <span
          role={onOpen ? "button" : undefined}
          tabIndex={onOpen ? 0 : undefined}
          aria-label={onOpen ? label : undefined}
          onClick={onOpen}
          onKeyDown={
            onOpen
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen();
                  }
                }
              : undefined
          }
          style={{
            lineHeight: 0,
            display: "block",
            borderRadius: 0,
            cursor: onOpen ? "pointer" : undefined,
            boxShadow:
              "0 0 52px 20px rgba(0,0,0,.62), 0 26px 60px -4px rgba(0,0,0,.85), 0 8px 18px rgba(0,0,0,.65)",
          }}
        >
          <PosterBlock item={item} design={design} size={size} />
        </span>
        {children}
      </div>
    </div>
  );
}
