import { INK, MUTED, SUB } from "@/lib/design/tokens";

/** Discover's small shared parts, lifted from prototype S_discover: the place
 *  mark (DosPinIcon 1491), WHERE AS ONE FACT (DosWhere 4293), the follower
 *  figure with a mark in front of it (DosFollowers 4277), and the five entity
 *  marks the section tabs wear at 26px (ENTITY_TABS 4149). The icons are drawn
 *  here, not copied — the app owns its own glyphs. */

/** "1.2k" — the prototype's fmtF (4189) */
export const fmtF = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

/** "327 m" under a kilometre, "2.4 km" over it (kmLabel 4213) */
export const kmLabel = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** the app's own place mark — a ring and its point */
export function DosPinIcon({ size = 13, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.4" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="2.9" fill={color} />
    </svg>
  );
}

/** WHERE, AS ONE FACT (4293): the mark takes the line's own colour so it reads
 *  as punctuation, and the distance is set right against the city in tabular
 *  figures — "Pune  2.4 km" — because how far is part of where. */
export function DosWhere({ city, km, size = 11 }: { city: string; km?: string | null; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, fontSize: size, fontWeight: 700, color: SUB }}>
      <DosPinIcon size={size + 1} color="currentColor" />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {city}
        {km != null ? <span style={{ color: MUTED, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{"  " + km}</span> : null}
      </span>
    </span>
  );
}

/** A FOLLOWER COUNT, WITH SOMETHING TO HOLD ON TO (4277): the two-heads mark,
 *  then the figure set apart and tabular. `word` lets a crew print "4 members"
 *  in the same slot — a crew has no followers to count. */
export function DosFollowers({ n, size = 12, word }: { n: number; size?: number; word?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8.4" r="3.2" />
        <path d="M3 19.5c.7-3.2 3-4.9 6-4.9s5.3 1.7 6 4.9" />
        <circle cx="17.2" cy="9.4" r="2.4" />
        <path d="M15.8 14.4c2.4.2 4.1 1.6 4.7 4.3" />
      </svg>
      <span style={{ fontSize: size + 1, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2, whiteSpace: "nowrap" }}>
        {fmtF(n)}
        {word ? <span style={{ fontWeight: 700, color: SUB, marginLeft: 4 }}>{word}</span> : null}
      </span>
    </span>
  );
}

/* ── the entity marks the section tabs wear (26px) ── */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
type IconProps = { size?: number; color?: string };

/** a studio: the building, its door and four windows */
export function StudioI({ size = 26, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="16.5" rx="2" />
      <path d="M10 21v-4.5h4V21" />
      <path d="M8.5 8.5h2M13.5 8.5h2M8.5 12.5h2M13.5 12.5h2" />
    </svg>
  );
}

/** an artist: a head, shoulders, and the band across the brow */
export function ArtistI({ size = 26, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
      <circle cx="12" cy="9.8" r="3" />
      <path d="M5.5 20.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" />
      <path d="M7.5 6.8h9" />
      <path d="M9.6 6.8c0-1.8 1-2.9 2.4-2.9s2.4 1.1 2.4 2.9" />
    </svg>
  );
}

/** a class: the calendar leaf with a tick on the day */
export function ClassI({ size = 26, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8.5 5V2.8M15.5 5V2.8" />
      <path d="M8.5 15l2.3 2.3 4.7-4.8" />
    </svg>
  );
}

/** an event: a pennant on its pole */
export function EventI({ size = 26, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
      <path d="M6 21V3.5" />
      <path d="M6 4.5h11.5l-2.4 4.2 2.4 4.3H6" />
    </svg>
  );
}
