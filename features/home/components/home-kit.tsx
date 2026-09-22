import type { CSSProperties, ReactNode } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { ArrangeTools } from "@/features/home/components/ArrangeTools";
import { ToolGlyph, ToolGrid, type Tile } from "@/features/home/components/tool-grid";
import { arrangeTiles, orderOf, toolsLayoutKey } from "@/features/home/toolOrder";
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

/* a shelf heading: sentence case, big, with whatever the shelf offers on the
   right (3446-3450) — ⚠ with a RULE between the two since 22 Sep 2026, the same
   ask as every other counted head ("a sprator between title and figure"). It was
   `marginLeft: auto`, so "3 today" was pushed to the far edge by empty space. */
export const DosShelfHead = ({ children, right, pad = "0 16px 10px" }: { children: ReactNode; right?: ReactNode; pad?: string }) => (
  <FigureHead
    padding={pad}
    title={<span style={{ ...HOME_TYPE.shelf, color: INK }}>{children}</span>}
    figure={right ? <span style={{ fontSize: 10, fontWeight: 800, color: MUTED }}>{right}</span> : undefined}
  />
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
  /* ⚠⚠ AND A MEMBERSHIPS TILE, BECAUSE A USER IS WHO A MEMBERSHIP IS FOR
     (21 Sep 2026). `my_memberships()` is scoped to `auth.uid()` with no artist
     check, and `why_no_membership` refuses only somebody on the seller's own
     team — a plain user is precisely the intended buyer. They had no door to it:
     the tile was on the ARTIST's list alone, so a pass they had bought was
     reachable only by typing the address. Three edges to that, all real: the
     buy toast says **"find it under Memberships"** and there was no such thing
     on their Home; the progress bar that is the whole point of a pass was
     unreachable; and ⚠ a pass left at `pending_payment` when the Cashfree window
     closed could NOT be paid for, because the "Pay ₹X" button to resume it
     exists only on that screen. */
  if (kind === "user") {
    return [
      ...person,
      { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
      { name: DOS_TOOLS.earn.name, href: "/earnings", k: "earn", c: DOS_TOOLS.earn.c },
    ];
  }
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
 *  grid — Home puts the pending team invites there.
 *
 *  ⚠ THE GRID IS ARRANGED HERE, ON THE SERVER (22 Sep 2026), so the first paint
 *  is already in this person's own order and nothing re-shuffles under them on
 *  hydration. `ArrangeTools` takes it from there. */
export function BizSection({
  kind,
  pageId,
  eventsHostId = null,
  order = null,
  children,
}: {
  kind: HomeKind;
  /** an artist's own page (the one they OWN), for the desks that are its */
  pageId: string | null;
  /** R15: the organization's own events host — the Events tile points at its desk */
  eventsHostId?: string | null;
  /** this person's own arrangement of THIS grid, or null for the code's order */
  order?: string[] | null;
  children?: ReactNode;
}) {
  const base = tilesFor(kind, pageId, eventsHostId);
  /* ⚠ THE `plan` PROP IS GONE, not left unread (21 Sep 2026) — the badge it
     drew was the "nothing else" the user asked off this head, and a prop no
     branch renders is the same lie as a field no screen reads. */
  return (
    <ToolsPanel kind={kind}>
      {children}
      <ArrangeTools tiles={arrangeTiles(base, order)} defaultOrder={orderOf(base)} layoutKey={toolsLayoutKey(kind)} arranged={Boolean(order && order.length > 0)} />
    </ToolsPanel>
  );
}

/* the tile leaf moved to `tool-grid.tsx` on 22 Sep 2026 and keeps its old
   address here, because `StudioHome`, `CrewHome` and the studio's own page all
   import it from this kit (Rule 14's spirit, one level down: an import somebody
   was handed is a promise too) */
export { ToolGlyph, ToolGrid };
export type { Tile };
