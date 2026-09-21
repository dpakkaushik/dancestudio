import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
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

/** THE HEADING OVER EVERY TOOL GRID (18 Sep 2026, the user: "all tools in the
 *  home tab should have the heading in the same way"). One shape on all four
 *  homes — the account's own word, then "Tools", at the prototype's 17px display
 *  scale — with whatever the page hangs on its right (the plan badge). Until
 *  today a user's Home was headed "Artist Tools" (the prototype's word for a grid
 *  that carried artist tools, 2497), an organization's "Studio Tools" (a studio
 *  owner's word, 7616), and a studio's own home drew its own copy of the line. */
export type ToolsKind = HomeKind | "studio" | "crew";
export const TOOLS_HEADING: Record<ToolsKind, string> = { user: "User Tools", artist: "Artist Tools", org: "Organization Tools", studio: "Studio Tools", crew: "Crew Tools" };
export function ToolsHead({ kind }: { kind: ToolsKind }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      {/* `currentColor`, not INK (21 Sep 2026) — the panel below inverts the
          theme, so the heading takes its colour from whatever ground it is on
          rather than from the page's own ink, which would vanish into it */}
      <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: "currentColor", fontFamily: DOS_DISPLAY }}>{TOOLS_HEADING[kind]}</span>
    </div>
  );
}

/** THE TOOLS PANEL — ONE SQUIRCLE, INVERTED AGAINST THE THEME (21 Sep 2026).
 *
 *  The user: *"give the tools section on all profiles like squircle seprator and
 *  make it look opposite according to the dark and light theme. make sure only
 *  heading on top nothing else."*
 *
 *  Three things, and each is a real separation rather than decoration:
 *  · **A SQUIRCLE.** The grid used to sit on the page's own ground with a 17px
 *    line over it, so on a long Home the tools and whatever was above them ran
 *    together — there was nothing to say where one section ended.
 *  · **INVERTED.** `--text` and `--solid` are already the theme's own opposite
 *    pair (near-black and near-white, swapped by `html.dark` / `html.light`), so
 *    the panel is one declaration that follows the toggle by construction rather
 *    than a second palette to keep in step. The tiles are opaque gradients of
 *    their own colour, so what changes underneath them is the ground and the
 *    gaps — which is the whole point: the colours read louder against it.
 *  · **ONLY THE HEADING.** ⚠ The plan badge that sat on the head's right —
 *    ARTIST PLAN ACTIVE / 🔒 PRO · UNLOCK, the prototype's own at 2500-2520 —
 *    is GONE, and the `right` prop with it rather than left unread. Settings →
 *    Subscription is the door to the plan, and has been since 19 Sep; the badge
 *    was a second one on a line the user has now asked to hold one thing.
 *
 *  ⚠ **AND IT STANDS ON `InvertedPanel` SINCE 21 Sep 2026, rather than carrying
 *    its own two colours.** The literal here said `background: var(--text)` and
 *    nothing more, which is right ONLY for opaque tiles — the moment the user
 *    asked for the same treatment on Discover's shelf it turned out to hide every
 *    card in the app. The panel swaps the whole palette now, so both sections are
 *    one declaration rather than two copies drifting apart, which is this repo's
 *    own recurring bill (`linkChip` declared twice, the figure row written out
 *    three times, three copies of the identity band). */
export function ToolsPanel({ kind, children }: { kind: ToolsKind; children: ReactNode }) {
  return <InvertedPanel head={<ToolsHead kind={kind} />}>{children}</InvertedPanel>;
}

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
 *     · Calendar · Crews · Studios (taken classes at).
 *  B. ARTIST (the plan is live) — the same five, then Team · Students · Routines ·
 *     Earnings · Memberships · Assets · Media. The desks that are their PAGE's
 *     (Team, Students) open that page, or the hub where the page is made when
 *     there is none yet; Media is their pictures, which live in the Profile tab's
 *     Edit sheet (16 Sep 2026); Routines, Memberships and Assets open the
 *     prototype's own "nothing here yet" until their desks exist.
 *  C. ORGANIZATION — Events · Studios · Team · Earnings (combined). Team is
 *     "nothing here yet": an organization is one login today.
 *  D. STUDIO — on its own home: Classes · Calendar · Team · Students · Earnings ·
 *     Memberships · Assets · Rooms · Media.
 *
 *  ⚠ STATS IS NOT A TILE ANY MORE (18 Sep 2026, the user: "remove stats from
 *  tools and place like a button similar to the qr code in the same area on
 *  both home and profile"). It was on every one of the four lists; it is the
 *  `StatsChip` beside the QR in the hero now, on Home, the Profile tab and a
 *  studio's own home, pointing at the same board the tile did.
 *
 *  The prototype's list (DOS_TOOLS 2931) is the vocabulary — names, colours,
 *  glyphs; which tiles a kind gets is the user's decision. Events on an
 *  organization points at its ONE events desk (R15). */
export const tilesFor = (kind: HomeKind, pageId: string | null, eventsHostId: string | null): Tile[] => {
  if (kind === "org") {
    return [
      { name: DOS_TOOLS.events.name, href: eventsHostId ? `/business/${eventsHostId}/events` : "/business", k: "events", c: DOS_TOOLS.events.c },
      { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
      /* 18 Sep 2026, the user: "only events calendar required here" — an
         organization's calendar IS its events (row R21), so the tile opens it */
      { name: DOS_TOOLS.calendar.name, href: "/calendar", k: "calendar", c: DOS_TOOLS.calendar.c },
      { name: DOS_TOOLS.team.name, href: "/business/team", k: "team", c: DOS_TOOLS.team.c },
      { name: DOS_TOOLS.earn.name, href: "/business/earnings", k: "earn", c: DOS_TOOLS.earn.c },
      /* ⚠ AN ORGANIZATION HAS ASSETS TOO (21 Sep 2026, the user: "fix assets for
         both artist, studio and organization"). It never had the tile — the
         18 Sep list gave Assets to an artist and a studio only — and an
         organization owns things a studio does not: a van, a PA that travels
         between its studios. They hang off its own hosting row, which is the one
         business an organization owns. */
      ...(eventsHostId ? [{ name: DOS_TOOLS.assets.name, href: `/business/${eventsHostId}/assets`, k: "assets", c: DOS_TOOLS.assets.c } as Tile] : []),
      /* ⚠ NO MANAGE TILE (19 Sep 2026, the user: "just need to remove manage as
         the tile in tools, nothing else changes") — /managed still exists and
         Home's empty day still offers it; it is simply not a tile */
    ];
  }
  const person: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: "/my-classes", k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.events.name, href: "/my-events", k: "events", c: DOS_TOOLS.events.c },
    { name: DOS_TOOLS.calendar.name, href: "/calendar", k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.crews.name, href: "/crews", k: "crews", c: DOS_TOOLS.crews.c },
    { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
    /* ⚠ ROUTINES IS A USER'S TILE TOO (20 Sep 2026, the user: "routines you
       learned … should be visible to user profiles as well in tools"). It was an
       artist's, because MAKING one is an artist's tool — but the desk has two
       sides now and a plain user opens it for the other one: what was taught in
       a class they turned up to. The making side says whose tool it is rather
       than offering a form the database would refuse. */
    { name: DOS_TOOLS.routines.name, href: "/routines", k: "routines", c: DOS_TOOLS.routines.c },
  ];
  /* ⚠ A PLAIN USER HAS EARNINGS TOO (21 Sep 2026, the user: "lets fix earnings
     for all profile types"). Their 18 Sep list had no Earnings tile, and the
     reasoning held while only an artist was ever paid — but a plain user seated
     as an ASSISTANT on a class is paid through the same `payouts` rows, and the
     one door left to `/earnings` was a link buried on an artist page's own desk.
     So somebody who has been paid had no way to see it. An ARTIST does not get
     this tile: theirs points at their page's desk, and the page's desk carries
     "What studios pay you ›" to this same ledger. */
  if (kind === "user") return [...person, { name: DOS_TOOLS.earn.name, href: "/earnings", k: "earn", c: DOS_TOOLS.earn.c }];
  /* an artist's page's desks — or the hub, which is where the page is made */
  const desk = (path: string) => (pageId ? `/business/${pageId}/${path}` : "/business");
  return [
    ...person,
    { name: DOS_TOOLS.team.name, href: desk("staff"), k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c },
    /* ⚠ AN ARTIST'S EARNINGS TILE OPENS THEIR PAGE'S DESK (20 Sep 2026, the
       user: "Earnings make sure to check all revenue sources mentioned for all
       types of profiles according to there revenue sources"). It pointed at
       `/earnings`, which is a PAYOUT LEDGER — what studios have paid them for
       sessions taught — so everything their OWN page took (class fees, the
       memberships they sell) was behind a door nothing on Home opened: you had
       to go to `/business/{pageId}` and press its own Earnings tile. The two
       tiles above already use `desk(...)` for exactly this reason. The payout
       ledger is not lost: the page's desk carries **What studios pay you ›** to
       it, which is where a teacher's own money belongs. */
    { name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c },
    { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
    /* ⚠ AN ARTIST'S ASSETS ARE THEIR PAGE'S (21 Sep 2026), like their Team,
       Students and Earnings tiles above — it pointed at `/assets`, a person-level
       address for a thing that belongs to a BUSINESS. `/assets` redirects here
       (Rule 14: an address handed out is a promise). */
    { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
    /* ⚠ NO MEDIA TILE (21 Sep 2026, the user: "remove media from all tool in all
       profiles"). It opened the Profile tab, because an artist's pictures are
       edited there — and since 20-21 Sep the disc's ⊕ and the posters' ⊕ ARE
       that editor, on the Profile tab and on Home alike. So the tile was a
       third door to a job that already has two controls sitting on the picture
       itself. `StudioMediaDesk` and its route stay (Rule 14). */
  ];
};

/** BizSection (2497-2583) — the ONE "Run your business" section on Home. The
 *  heading is `ToolsHead`, the same line every home's grid wears since 18 Sep
 *  2026, worded for the account. `children` sits between the heading and the
 *  grid — Home puts the pending team invites there. */
export function BizSection({
  kind,
  pageId,
  eventsHostId = null,
  children,
}: {
  kind: HomeKind;
  /** an artist's own page (the one they OWN), for the desks that are its */
  pageId: string | null;
  /** R15: the organization's own events host — the Events tile points at its desk */
  eventsHostId?: string | null;
  children?: ReactNode;
}) {
  const tiles = tilesFor(kind, pageId, eventsHostId);
  /* ⚠ THE `plan` PROP IS GONE, not left unread (21 Sep 2026) — the badge it
     drew was the "nothing else" the user asked off this head, and a prop no
     branch renders is the same lie as a field no screen reads. */
  return (
    <ToolsPanel kind={kind}>
      {children}
      <ToolGrid tiles={tiles} />
    </ToolsPanel>
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
