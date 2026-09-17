import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CrewI, dosToolPaint } from "@/features/crews/components/crew-kit";
import { EventI } from "@/features/discovery/components/discover-kit";
import { StudioI } from "@/features/shell/components/shell-glyphs";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY, INK, MUTED } from "@/lib/design/tokens";

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

/** WHO THE GRID IS FOR. A person is a user, or an artist while the plan is live;
 *  an organization is the third. A STUDIO's own grid is built beside the studio's
 *  home (`app/(app)/business/[tenantId]/page.tsx`), because every one of its
 *  doors is that studio's. */
export type HomeKind = "user" | "artist" | "org";

/** THE HOME GRID, FOR ALL FOUR KINDS OF ACCOUNT (18 Sep 2026 — the user's list,
 *  verbatim in the deviations table, row R18). It replaces a grid that had grown
 *  by accretion: a plain user was offered Earnings and an artist's Students, an
 *  organization its first studio's register, everybody a Classes tile that
 *  opened the Discover listing.
 *
 *  A. USER — Classes (booked, assist) · Events (participant, spectator, assisting)
 *     · Calendar · Crews · Stats · Studios (taken classes at).
 *  B. ARTIST (the plan is live) — the same six, then Team · Students · Routines ·
 *     Earnings · Memberships · Assets · Media. The desks that are their PAGE's
 *     (Team, Students) open that page, or the hub where the page is made when
 *     there is none yet; Media is their pictures, which live in the Profile tab's
 *     Edit sheet (16 Sep 2026); Routines, Memberships and Assets open the
 *     prototype's own "nothing here yet" until their desks exist.
 *  C. ORGANIZATION — Events · Studios · Team · Earnings (combined) · Stats. Team
 *     is "nothing here yet": an organization is one login today.
 *  D. STUDIO — on its own home: Classes · Calendar · Stats · Team · Students ·
 *     Earnings · Memberships · Assets · Rooms · Media.
 *
 *  The prototype's list (DOS_TOOLS 2931) is the vocabulary — names, colours,
 *  glyphs; which tiles a kind gets is the user's decision. Events on an
 *  organization points at its ONE events desk (R15). */
export const tilesFor = (kind: HomeKind, pageId: string | null, eventsHostId: string | null): Tile[] => {
  if (kind === "org") {
    return [
      { name: DOS_TOOLS.events.name, href: eventsHostId ? `/business/${eventsHostId}/events` : "/business", k: "events", c: DOS_TOOLS.events.c },
      { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
      { name: DOS_TOOLS.team.name, href: "/business/team", k: "team", c: DOS_TOOLS.team.c },
      { name: DOS_TOOLS.earn.name, href: "/business/earnings", k: "earn", c: DOS_TOOLS.earn.c },
      { name: DOS_TOOLS.stats.name, href: "/business/stats", k: "stats", c: DOS_TOOLS.stats.c },
    ];
  }
  const person: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: "/my-classes", k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.events.name, href: "/my-events", k: "events", c: DOS_TOOLS.events.c },
    { name: DOS_TOOLS.calendar.name, href: "/calendar", k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.crews.name, href: "/crews", k: "crews", c: DOS_TOOLS.crews.c },
    { name: DOS_TOOLS.stats.name, href: "/stats", k: "stats", c: DOS_TOOLS.stats.c },
    { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
  ];
  if (kind === "user") return person;
  /* an artist's page's desks — or the hub, which is where the page is made */
  const desk = (path: string) => (pageId ? `/business/${pageId}/${path}` : "/business");
  return [
    ...person,
    { name: DOS_TOOLS.team.name, href: desk("staff"), k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c },
    { name: DOS_TOOLS.routines.name, href: "/routines", k: "routines", c: DOS_TOOLS.routines.c },
    { name: DOS_TOOLS.earn.name, href: "/earnings", k: "earn", c: DOS_TOOLS.earn.c },
    { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
    { name: DOS_TOOLS.assets.name, href: "/assets", k: "assets", c: DOS_TOOLS.assets.c },
    { name: DOS_TOOLS.media.name, href: "/profile", k: "media", c: DOS_TOOLS.media.c },
  ];
};

/** BizSection (2497-2583) — the ONE "Run your business" section on Home. The
 *  heading is the prototype's own word for the grid: "Artist Tools" on a
 *  dancer's or artist's Home, "Studio Tools" on a studio owner's (7616).
 *  `children` sits between the heading and the grid — Home puts the pending
 *  team invites there. */
export function BizSection({
  kind,
  pageId,
  eventsHostId = null,
  plan = null,
  children,
}: {
  kind: HomeKind;
  /** an artist's own page (the one they OWN), for the desks that are its */
  pageId: string | null;
  /** R15: the organization's own events host — the Events tile points at its desk */
  eventsHostId?: string | null;
  /** the Artist plan's state — the badge on the head (2500-2520); null draws none (an organization) */
  plan?: "active" | "locked" | null;
  children?: ReactNode;
}) {
  const tiles = tilesFor(kind, pageId, eventsHostId);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_DISPLAY }}>
          {kind === "org" ? "Studio Tools" : "Artist Tools"}
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
