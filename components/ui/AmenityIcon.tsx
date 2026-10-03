import type { CSSProperties, ReactNode } from "react";

/** ONE SET OF AMENITY ICONS, DRAWN (4 Oct 2026, the user: "Revamp icon for
 *  amenities everywhere and make them better according to aesthetics. even in
 *  room form change icons").
 *
 *  ⚠ THE STORED VALUE DOES NOT CHANGE. `DOS_AMENITIES` keeps the prototype's
 *  emoji inside the string (150-151) because the string IS the stored value —
 *  rooms on production hold "🪞 Mirrors". What changed is how it is DRAWN: the
 *  emoji is taken off for the words (`amenityLabel`) and a line icon in one
 *  stroke weight stands in front of them, so twelve amenities read as one set
 *  instead of twelve platform emoji in twelve styles.
 *  ⚠ A value outside the registry (a proof's bare "Mirrors", an old row) still
 *  draws — its words, with the generic mark — rather than vanishing. */

/** the words of an amenity, without the emoji the stored value carries */
export function amenityLabel(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim() || value;
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* keyed by the WORDS, so a legacy value without its emoji finds its icon too */
const GLYPHS: Record<string, ReactNode> = {
  Mirrors: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" {...P} />
      <path d="M9.5 8.5l3-3M9.5 12.5l6-6" {...P} />
    </>
  ),
  "Sprung floor": (
    <>
      <path d="M3 17h18M3 20h18" {...P} />
      <path d="M5 14c1.2-2 2.8-2 4 0s2.8 2 4 0 2.8-2 4 0 1.8 1.6 2 1.6" {...P} />
    </>
  ),
  Sound: (
    <>
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" {...P} />
      <path d="M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11" {...P} />
    </>
  ),
  AC: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" {...P} />
      <path d="M10 4.5l2 1.5 2-1.5M10 19.5l2-1.5 2 1.5" {...P} />
    </>
  ),
  Mats: (
    <>
      <rect x="3" y="9" width="14" height="9" rx="2" {...P} />
      <path d="M17 11.5a3 3 0 110 4.5" {...P} />
      <path d="M7 12v3" {...P} />
    </>
  ),
  Projector: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="2.5" {...P} />
      <circle cx="15.5" cy="12.5" r="2.2" {...P} />
      <path d="M6.5 12.5h3M7 17v2M17 17v2" {...P} />
    </>
  ),
  "Changing room": (
    <>
      <path d="M12 7a2 2 0 112-2c0 1-2 1.4-2 3" {...P} />
      <path d="M12 8l-8.5 6.2a1.5 1.5 0 00.9 2.8h15.2a1.5 1.5 0 00.9-2.8z" {...P} />
    </>
  ),
  Washroom: (
    <>
      <path d="M12 3v18" {...P} />
      <circle cx="6.5" cy="5.5" r="1.6" {...P} />
      <path d="M4.5 21v-6H3.8l1.2-6h3l1.2 6H8.5v6" {...P} />
      <circle cx="17.5" cy="5.5" r="1.6" {...P} />
      <path d="M15.5 21v-12h4v12" {...P} />
    </>
  ),
  "Drinking water": (
    <path d="M12 3.5s6 6.4 6 10.5a6 6 0 01-12 0c0-4.1 6-10.5 6-10.5z M9.5 14.5a2.5 2.5 0 002.5 2.5" {...P} />
  ),
  Parking: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" {...P} />
      <path d="M9.5 17V7h3.5a3 3 0 010 6H9.5" {...P} />
    </>
  ),
  "Lift access": (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" {...P} />
      <path d="M12 3v18M7 10l1.5-2L10 10M14 14l1.5 2 1.5-2" {...P} />
    </>
  ),
  Lockers: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" {...P} />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3M12 14.5v2.5" {...P} />
    </>
  ),
};

const FALLBACK = <circle cx="12" cy="12" r="4" {...P} />;

export function AmenityIcon({ value, size = 16, color = "currentColor", style }: { value: string; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={{ color, flexShrink: 0, display: "block", ...style }}>
      {GLYPHS[amenityLabel(value)] ?? FALLBACK}
    </svg>
  );
}

/** an amenity as a chip — the icon in the tool's colour, the words in ink. One
 *  look on the room card, the class page and anywhere else an amenity is shown. */
export function AmenityChip({ value, tint }: { value: string; tint: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        padding: "5px 11px 5px 8px",
        borderRadius: 999,
        background: `${tint}14`,
        color: "var(--text)",
        border: `1.5px solid ${tint}33`,
        whiteSpace: "nowrap",
      }}
    >
      <AmenityIcon value={value} size={15} color={tint} />
      {amenityLabel(value)}
    </span>
  );
}
