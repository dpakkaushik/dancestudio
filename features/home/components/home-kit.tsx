import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CrewI, dosToolPaint } from "@/features/crews/components/crew-kit";
import { EventI } from "@/features/discovery/components/discover-kit";
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
  /* stats: the bars, as the tab bar drew them until 15 Sep 2026 */
  stats: I(
    <>
      <path d="M4 19.5h16" />
      <path d="M5 16.5V12M9.5 16.5V8.5M14 16.5v-6" />
      <path d="m18.5 16.5-.01-9" />
      <path d="m16.4 6.6 2.1-2.1 2.1 2.1" />
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
};

export interface Tile {
  name: string;
  href: string;
  k: keyof typeof GLYPH;
  c: string;
}

/** The tiles, in the prototype's order and colours (DOS_TOOLS 2931), each mapped
 *  to a door that exists in the app. Events is not an artist tool (2531-2540);
 *  Routines and Reports have no page yet, so they are not drawn — a tile that
 *  opens nothing is a lie. Students and Team are a business's own, so they need
 *  one to point at.
 *
 *  EVENTS IS AN ORGANIZATION'S TOOL (11 Sep 2026, the user: "I told you events
 *  are gonna be at org level — right now I can't see events on my org page").
 *  R15 made an event belong to the organization, hosted on its own hidden
 *  tenant row, and the desk for it has existed at /business/{host}/events since
 *  — but the only door was a row inside the studios hub, two taps away, and an
 *  organization's Home never mentioned it. Now it is a tile, where the other
 *  tools are, pointing at the organization's ONE events desk.
 *
 *  AN ORGANIZATION'S TOOLS ARE THE THINGS IT IS (17 Sep 2026, the user:
 *  "organization home tab should not have classes options. classes can only be
 *  created by users with artist subscription and studios"). It runs studios, it
 *  hosts events, it reads the board across them — Studios · Events · Stats. A
 *  class, a room, a student, a team member and a studio calendar are a STUDIO's,
 *  and live on the studio's own home one tap inside Studios; a person's calendar,
 *  crews and earnings are a person's, and an organization is not one
 *  (`guard_person_only`). Every tile that used to open the FIRST studio's desk is
 *  gone with them — an organization with two studios was being pointed at one of
 *  them by accident. The database keeps the rule too: a class on the hosting row
 *  is refused (`20260917180000`). */
const tilesFor = (role: ProfileRole, tenantId: string | null, eventsHostId: string | null, statsHref: string): Tile[] =>
  role === "org"
    ? [
        { name: "Studios", href: "/business", k: "studios", c: "#3B82F6" },
        ...(eventsHostId ? [{ name: "Events", href: `/business/${eventsHostId}/events`, k: "events", c: "#F59E0B" } as Tile] : []),
        { name: "Stats", href: statsHref, k: "stats", c: "#A855F7" },
      ]
    : personTiles(tenantId, eventsHostId, statsHref);

/** a person's grid — a user's, or an artist's with their page's desks */
const personTiles = (tenantId: string | null, eventsHostId: string | null, statsHref: string): Tile[] => [
  { name: "Calendar", href: "/calendar", k: "calendar", c: "#5AC8FA" },
  /* Stats left the tab bar for the grid (15 Sep 2026) — the record, the history
     and the boards. AN ORGANIZATION'S STATS ARE ITS STUDIOS' (17 Sep 2026): it
     does not dance, so its tile opens the combined dashboard, not a person's record */
  { name: "Stats", href: statsHref, k: "stats", c: "#A855F7" },
  ...(eventsHostId ? [{ name: "Events", href: `/business/${eventsHostId}/events`, k: "events", c: "#F59E0B" } as Tile] : []),
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
export function BizSection({ role, tenantId, eventsHostId = null, plan = null, children }: { role: ProfileRole; tenantId: string | null; /** R15: the organization's own events host — the Events tile points at its desk; null draws no tile */ eventsHostId?: string | null; /** the Artist plan's state — the badge on the head (2500-2520); null draws none (a studio) */ plan?: "active" | "locked" | null; children?: ReactNode }) {
  const tiles = tilesFor(role, tenantId, eventsHostId, role === "org" ? "/business/stats" : "/stats");
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_DISPLAY }}>
          {role === "org" ? "Studio Tools" : "Artist Tools"}
        </span>
        {plan === "active" ? (
          <Link href="/subscription" aria-label="Artist plan active" style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "rgba(236,72,153,.16)", color: "#EC4899", textDecoration: "none" }}>
            ARTIST PLAN ACTIVE
          </Link>
        ) : plan === "locked" ? (
          <Link href="/subscription" aria-label="Unlock the Artist plan" style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "var(--el)", color: "var(--sub)", textDecoration: "none" }}>
            🔒 PRO · UNLOCK
          </Link>
        ) : null}
      </div>
      {children}
      <ToolGrid tiles={tiles} />
    </div>
  );
}

/** THE GRID ITSELF, on its own (14 Sep 2026) so a studio's own home can draw
 *  ITS set of doors with the same tile, the same paint and the same glyph chip.
 *  The glyph keeps its own ground: a black chip outlined in the tile's colour, so
 *  on a tile that IS the colour the icon has an edge to sit against (2556-2566). */
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
  );
}
