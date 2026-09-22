import Link from "next/link";
import type { ReactNode } from "react";
import { CrewI, dosToolPaint } from "@/features/crews/components/crew-kit";
import { EventI } from "@/features/discovery/components/discover-kit";
import { StudioI } from "@/features/shell/components/shell-glyphs";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/** THE TOOL TILE AND ITS GLYPHS, ON THEIR OWN (22 Sep 2026).
 *
 *  Lifted out of `home-kit` unchanged when the grid became arrangeable. The
 *  reason is a real one rather than tidiness: `ArrangeTools` is a CLIENT
 *  component that draws the same tiles as a list, and `home-kit` renders
 *  `ArrangeTools` — so leaving the tile in the kit made a cycle across the
 *  server/client boundary. Function hoisting would probably have carried it;
 *  "probably" is not a thing to build a Home render on. The leaf has no idea
 *  either of them exists now, and both read it. */

/* ── the tool glyphs (2510-2530) ── */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const I = (p: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...S} aria-hidden="true">
    {p}
  </svg>
);

export const GLYPH: Record<string, ReactNode> = {
  calendar: I(
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
    </>
  ),
  crews: <CrewI size={20} color="currentColor" />,
  studios: <StudioI size={20} color="currentColor" />,
  events: <EventI size={20} color="currentColor" />,
  classesmod: I(
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2M12 12.5v5M9.5 15h5" />
    </>
  ),
  earn: I(
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  /* a student is one person you are teaching; the team is several people standing together */
  students: I(
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c.8-3.7 3.4-5.6 6.5-5.6s5.7 1.9 6.5 5.6" />
    </>
  ),
  team: I(
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-2.9 2.8-4.5 5.5-4.5S13.9 16.1 14.5 19" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.5 14.6c2.5.2 4.3 1.6 5 4.4" />
    </>
  ),
  /* a room is a place on the floor — the prototype's Rooms mark is a pin (7373) */
  rooms: I(
    <>
      <path d="M12 21s-6.5-5.7-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.3-6.5 10-6.5 10z" />
      <circle cx="12" cy="10.8" r="2.3" />
    </>
  ),
  /* media is a picture: the frame, the sun, the hill (15 Sep 2026) */
  media: I(
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M20.5 15.5l-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6.5 18.2" />
    </>
  ),
  /* the three desks named on 18 Sep 2026 before they exist: a routine is a
     piece of music you move to, a membership is a card, an asset is a box */
  routines: I(
    <>
      <path d="M9 18V6l9-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="15.5" cy="16" r="2.5" />
    </>
  ),
  memberships: I(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10.5h18M7 14.5h4" />
    </>
  ),
  assets: I(
    <>
      <path d="M12 3.5 20 7.5v9l-8 4-8-4v-9z" />
      <path d="M4 7.5l8 4 8-4M12 11.5v9" />
    </>
  ),
};

export interface Tile {
  name: string;
  href: string;
  k: keyof typeof GLYPH;
  c: string;
}

/** THE GLYPH CHIP, ON ITS OWN (22 Sep 2026) — a black square outlined in the
 *  tile's own colour, so on a tile that IS that colour the icon has an edge to
 *  sit against (2556-2566). Extracted because the ARRANGING list draws the same
 *  chip beside the same name, and this repo's own recurring bill is the second
 *  copy: `linkChip` declared twice, the figure row written out three times,
 *  three copies of the identity band. One chip, two callers. */
export function ToolGlyph({ k, c, size = 38 }: { k: keyof typeof GLYPH; c: string; size?: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0A0A0A",
        border: `1.5px solid ${c}`,
        color: c,
        lineHeight: 0,
      }}
    >
      {GLYPH[k]}
    </span>
  );
}

/** THE GRID ITSELF, on its own (14 Sep 2026) so a studio's own home can draw
 *  ITS set of doors with the same tile, the same paint and the same glyph chip. */
export function ToolGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {tiles.map((t) => (
        <Link
          key={t.name}
          href={t.href}
          aria-label={t.name}
          style={{
            background: dosToolPaint(t.c),
            border: `1.5px solid ${t.c}`,
            borderRadius: 16,
            padding: "9px 11px",
            minHeight: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            cursor: "pointer",
            boxSizing: "border-box",
            WebkitTapHighlightColor: "transparent",
            boxShadow: `0 3px 12px ${t.c}33`,
            transition: "transform .12s",
            textDecoration: "none",
          }}
        >
          <ToolGlyph k={t.k} c={t.c} />
          {/* the name WRAPS rather than ellipsizing (18 Sep 2026, the user: "make
              sure nothing gets cut") — on a 360px phone a half-width tile has ~90px
              of text room after its chip, and "Memberships" is longer than that */}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14.5,
              fontWeight: 900,
              letterSpacing: -0.3,
              lineHeight: 1.1,
              color: "#fff",
              fontFamily: DOS_DISPLAY,
              overflowWrap: "anywhere",
            }}
          >
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
