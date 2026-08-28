import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CrewI, dosToolPaint } from "@/features/crews/components/crew-kit";
import { StudioI } from "@/features/shell/components/shell-glyphs";
import { DOS_DISPLAY, INK, MUTED } from "@/lib/design/tokens";
import type { ProfileRole } from "@/types/profile";

/** Home's small parts, lifted from the prototype: the type scale a shelf is
 *  headed in (DOS_TYPE 3427), the shelf head itself (DosShelfHead 3446) and the
 *  tool grid under "Artist Tools" (BizSection 2497-2583). */

export const HOME_TYPE = {
  shelf: { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY } as CSSProperties,
  meta: { fontSize: 11, fontWeight: 600, lineHeight: 1.45 } as CSSProperties,
  micro: { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" } as CSSProperties,
};

/* a shelf heading: sentence case, big, with whatever the shelf offers on the right (3446-3450) */
export const DosShelfHead = ({ children, right, pad = "0 16px 10px" }: { children: ReactNode; right?: ReactNode; pad?: string }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: pad }}>
    <span style={{ ...HOME_TYPE.shelf, color: INK }}>{children}</span>
    {right ? <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: MUTED }}>{right}</span> : null}
  </div>
);

/* ── the tool glyphs (2510-2530) ── */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const I = (p: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...S} aria-hidden="true">
    {p}
  </svg>
);

const GLYPH: Record<string, ReactNode> = {
  calendar: I(
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
    </>
  ),
  crews: <CrewI size={20} color="currentColor" />,
  studios: <StudioI size={20} color="currentColor" />,
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
};

interface Tile {
  name: string;
  href: string;
  k: keyof typeof GLYPH;
  c: string;
}

/** The tiles, in the prototype's order and colours (DOS_TOOLS 2931), each mapped
 *  to a door that exists in the app. Events is not an artist tool (2531-2540);
 *  Routines and Reports have no page yet, so they are not drawn — a tile that
 *  opens nothing is a lie. Students and Team are a business's own, so they need
 *  one to point at. */
const tilesFor = (tenantId: string | null): Tile[] => [
  { name: "Calendar", href: "/calendar", k: "calendar", c: "#5AC8FA" },
  { name: "Crews", href: "/crews", k: "crews", c: "#DC2626" },
  { name: "Studios", href: "/business", k: "studios", c: "#3B82F6" },
  { name: "Classes", href: tenantId ? `/business/${tenantId}/classes` : "/classes", k: "classesmod", c: "#0D9488" },
  { name: "Earnings", href: "/earnings", k: "earn", c: "#22C55E" },
  ...(tenantId
    ? [
        { name: "Students", href: `/business/${tenantId}/students`, k: "students", c: "#8B5CF6" } as Tile,
        { name: "Team", href: `/business/${tenantId}/staff`, k: "team", c: "#F97316" } as Tile,
      ]
    : []),
];

/** BizSection (2497-2583) — the ONE "Run your business" section on Home. The
 *  heading is the prototype's own word for the grid: "Artist Tools" on a
 *  dancer's or artist's Home, "Studio Tools" on a studio owner's (7616). The
 *  artist-plan lock is a product decision nobody has made, so every tile is
 *  open. `children` sits between the heading and the grid — Home puts the
 *  pending team invites there. */
export function BizSection({ role, tenantId, children }: { role: ProfileRole; tenantId: string | null; children?: ReactNode }) {
  const tiles = tilesFor(tenantId);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_DISPLAY }}>
          {role === "studio" ? "Studio Tools" : "Artist Tools"}
        </span>
      </div>
      {children}
      {/* the glyph keeps its own ground: a black chip outlined in the tile's colour, so
          on a tile that IS the colour the icon has an edge to sit against (2556-2566) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {tiles.map((t) => (
          <Link
            key={t.name}
            href={t.href}
            aria-label={t.name}
            style={{
              background: dosToolPaint(t.c),
              border: `1px solid ${t.c}`,
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
            <span
              style={{
                flexShrink: 0,
                width: 38,
                height: 38,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#0A0A0A",
                border: `1.5px solid ${t.c}`,
                color: t.c,
                lineHeight: 0,
              }}
            >
              {GLYPH[t.k]}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span
                  style={{
                    minWidth: 0,
                    fontSize: 14.5,
                    fontWeight: 900,
                    letterSpacing: -0.3,
                    lineHeight: 1.1,
                    color: "#fff",
                    fontFamily: DOS_DISPLAY,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
