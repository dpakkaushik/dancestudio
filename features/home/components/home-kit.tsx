import type { CSSProperties, ReactNode } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { ArrangeTools } from "@/features/home/components/ArrangeTools";
import { ToolGlyph, ToolGrid, ToolsHead, ToolsPanel, TOOLS_HEADING, type Tile, type ToolsKind } from "@/features/home/components/tool-grid";
import { arrangeTiles, orderOf, toolsLayoutKey } from "@/features/home/toolOrder";
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

/* WHO THE GRID IS FOR and THE HOME GRID moved to `features/home/tiles.ts` on
   12 Oct 2026, with the tools themselves, into the drawer the profile picture
   opens. Re-exported here so old imports still resolve. */
import { tilesFor, type HomeKind } from "@/features/home/tiles";
export { tilesFor, type HomeKind };

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
