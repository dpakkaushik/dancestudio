import type { CSSProperties, ReactNode } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { ArrangeTools } from "@/features/home/components/ArrangeTools";
import { ToolGlyph, ToolGrid, ToolsHead, ToolsPanel, TOOLS_HEADING, type Tile, type ToolsKind } from "@/features/home/components/tool-grid";
import { arrangeTiles, orderOf, toolsLayoutKey } from "@/features/home/toolOrder";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
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
/* the head, the heading map and the panel moved to `tool-grid.tsx` on
   27 Sep 2026 so the arranging control could live ON the head — see the block
   there. They keep their old address here (re-exported at the foot). */

/** WHO THE GRID IS FOR. A person is a user, or an artist while the plan is live.
 *  ⚠ `org` was kept in this union through 26 Sep 2026, naming no login, so the
 *  types that share it kept compiling; it went with organizations on 29 Sep.
 *  A STUDIO's own grid is built beside the studio's home
 *  (`app/(app)/business/[businessId]/page.tsx`), because every one of its doors is
 *  that studio's. */
export type HomeKind = "user" | "artist";

/** THE HOME GRID (18 Sep 2026 — the user's list, verbatim in the deviations
 *  table, row R18). It replaces a grid that had grown by accretion: a plain user
 *  was offered Earnings and an artist's Students, and everybody a Classes tile
 *  that opened the Discover listing.
 *
 *  A. USER — Classes (booked, assist) · Calendar · Crews · Studios (taken
 *     classes at) · … · Subscription.
 *  B. ARTIST (the plan is live) — the same, then Team · Students · Routines ·
 *     Earnings · Memberships · Assets · Media. The desks that are their PAGE's
 *     (Team, Students) open that page, or the hub where the page is made when
 *     there is none yet; Media is their pictures, which live in the Profile tab's
 *     Edit sheet (16 Sep 2026); Routines, Memberships and Assets open the
 *     prototype's own "nothing here yet" until their desks exist.
 *  C. STUDIO — on its own home: Classes · Calendar · Team · Students · Earnings ·
 *     Memberships · Assets · Rooms · Media.
 *  ⚠ There was a fourth list until 29 Sep 2026 — an ORGANIZATION's, built beside
 *     its own home — and an Events and an Organizations tile on a person's.
 *
 *  ⚠ SUBSCRIPTION IS ON EVERY PERSON'S GRID (26 Sep 2026, the user:
 *  "subscriptions also become an option on home tab for all profiles and is
 *  removed from settings for all … subscribe to become an artist should not be
 *  a separate tab in settings like artist tools"). It is LAST, because it is the
 *  one tile that is about the account rather than about dancing.
 *
 *  ⚠ STATS IS NOT A TILE ANY MORE (18 Sep 2026, the user: "remove stats from
 *  tools and place like a button similar to the qr code in the same area on
 *  both home and profile"). It was on every one of the four lists; it is the
 *  `StatsChip` beside the QR in the hero now, on Home, the Profile tab and a
 *  studio's own home, pointing at the same board the tile did.
 *
 *  The prototype's list (DOS_TOOLS 2931) is the vocabulary — names, colours,
 *  glyphs; which tiles a kind gets is the user's decision. */
export const tilesFor = (kind: HomeKind, pageId: string | null): Tile[] => {
  const person: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: "/my-classes", k: "classesmod", c: DOS_TOOLS.classes.c },
    /* ⚠ THE EVENTS TILE (`/my-events`) AND THE ORGANIZATIONS TILE
       (`/organizations`, 26 Sep 2026) BOTH WENT ON 29 Sep 2026 */
    { name: DOS_TOOLS.calendar.name, href: "/calendar", k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.crews.name, href: "/crews", k: "crews", c: DOS_TOOLS.crews.c },
    /* ⚠ PRACTICE IS ITS OWN TILE (29 Sep 2026, the user: *"practice should be
       seprate tab in home tab not in crew"*). It was a SEGMENT of the Crews hub
       (28 Sep) and a section stacked under both crew lists before that, so the
       thing somebody opens most often — what am I rehearsing this week — was two
       presses inside a screen about something else.
       ⚠ `MyPractices`' own note argued the opposite and is superseded: it said a
       tile "would fail R20's colour test", which was TRUE of the green it wore
       and is why the tool is repainted indigo in the same push rather than the
       tile being squeezed onto a grid it clashes with. Its other argument — "a
       practice belongs to a crew, and /crews is the screen about your crews" —
       is the one the user has now answered: the person looking for a practice is
       asking what they are dancing, not a question about crews.
       ⚠ THE CREW'S OWN Practice tile STAYS on a crew's grid: that one is the
       LEADER's register for THAT crew, which is a different screen from this. */
    { name: DOS_TOOLS.practice.name, href: "/practice", k: "practice", c: DOS_TOOLS.practice.c },
    { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
    /* ⚠ ROUTINES IS A USER'S TILE TOO (20 Sep 2026, the user: "routines you
       learned … should be visible to user profiles as well in tools"). It was an
       artist's, because MAKING one is an artist's tool — but the desk has two
       sides now and a plain user opens it for the other one: what was taught in
       a class they turned up to. The making side says whose tool it is rather
       than offering a form the database would refuse. */
    { name: DOS_TOOLS.routines.name, href: "/routines", k: "routines", c: DOS_TOOLS.routines.c },
    /* ⚠ NO ENQUIRIES TILE (2 Oct 2026, the user: "shift back enquiries to inbox
       from home tools for all profiles"). It was a tool from 27 Sep (C70); it is
       the Inbox's third desk again, on every profile's Inbox, and `/enquiries`
       redirects there (Rule 14). */
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
  /* THE ACCOUNT'S OWN PLAN, LAST (26 Sep 2026) — Settings lost its Subscription
     tile and its Artist tools switch the same day, so this is the one door to
     `/subscription` for a user, an artist and an organization's owner alike */
  const subscription: Tile = { name: DOS_TOOLS.subscription.name, href: "/subscription", k: "subscription", c: DOS_TOOLS.subscription.c };
  if (kind !== "artist") {
    return [
      ...person,
      { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
      { name: DOS_TOOLS.earn.name, href: "/earnings", k: "earn", c: DOS_TOOLS.earn.c },
      subscription,
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
    subscription,
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
  order = null,
  children,
}: {
  kind: HomeKind;
  /** an artist's own page (the one they OWN), for the desks that are its */
  pageId: string | null;
  /** this person's own arrangement of THIS grid, or null for the code's order */
  order?: string[] | null;
  children?: ReactNode;
}) {
  /* `eventsHostId` left with the organization login (26 Sep 2026) — an
     organization's events desk is a tile on ITS home now, not on a person's */
  const base = tilesFor(kind, pageId);
  /* ⚠ THE `plan` PROP IS GONE, not left unread (21 Sep 2026) — the badge it
     drew was the "nothing else" the user asked off this head, and a prop no
     branch renders is the same lie as a field no screen reads. */
  /* ⚠ THE PANEL IS `ArrangeTools`' NOW (27 Sep 2026): its control sits on the
     head, and a child cannot reach into its parent's head. Anything a caller
     wants ABOVE the grid rides in as `children`. */
  return (
    <ArrangeTools
      kind={kind}
      tiles={arrangeTiles(base, order)}
      defaultOrder={orderOf(base)}
      layoutKey={toolsLayoutKey(kind)}
      arranged={Boolean(order && order.length > 0)}
    >
      {children}
    </ArrangeTools>
  );
}

/* the tile leaf moved to `tool-grid.tsx` on 22 Sep 2026 and keeps its old
   address here, because `StudioHome`, `CrewHome` and the studio's own page all
   import it from this kit (Rule 14's spirit, one level down: an import somebody
   was handed is a promise too) */
export { ToolGlyph, ToolGrid, ToolsHead, ToolsPanel, TOOLS_HEADING };
export type { ToolsKind };
export type { Tile };
