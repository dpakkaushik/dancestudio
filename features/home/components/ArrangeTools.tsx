"use client";

import { useState, useTransition, type ReactNode } from "react";
/* ⚠ FROM THE LEAF, NOT THE KIT (22 Sep 2026, and it matters more since this
   component started drawing its own panel): `home-kit` imports THIS file, so
   reading the head and the grid out of the kit would be an import cycle across
   the server/client boundary. `tool-grid.tsx` knows about neither of us. */
import { ToolGlyph, ToolGrid, ToolsPanel, type Tile, type ToolsKind } from "@/features/home/components/tool-grid";
import { setToolOrderAction } from "@/features/home/server-actions/toolOrder";
import { arrangeTiles, moveTile, orderOf } from "@/features/home/toolOrder";
import { useEditMode } from "@/features/profiles/components/EditMode";
import { CARD, DOS_DISPLAY, INK, LINE, SUB } from "@/lib/design/tokens";

/** ARRANGING THE TOOL GRID (22 Sep 2026) — the control on top of the storage
 *  `20260922090000` applied.
 *
 *  The user: *"all columns on such pages should be swapable so we can place them
 *  in order of our choice"*, and, asked where the order should live: **on the
 *  account, all devices**.
 *
 *  ⚠⚠ **IT ARRANGES IN A SINGLE COLUMN, AND THAT IS THE WHOLE DESIGN DECISION.**
 *  This app's own precedent for ordering anything is ▲▼ per row —
 *  `reorder_business_members` on the Team desk, `reorder_crew_members` on a
 *  crew's. But those are LISTS, and a tool grid is two columns: in a 2-up grid
 *  "▲" means *one place earlier*, which is visually up-**and-right**, and an
 *  arrow that moves a tile sideways is a control that lies about itself. So
 *  arranging opens the same tiles as one column, where up is up and the app's own
 *  ▲▼ is exactly right, and Done puts them back in two.
 *
 *  ⚠ **THE CONTROL IS AT THE FOOT, NOT ON THE HEAD.** The head carries the
 *  heading and nothing else — the user's own words on 21 Sep (*"make sure only
 *  heading on top nothing else"*), which is why the plan badge was deleted rather
 *  than moved. Directly under the grid it arranges is the next most findable
 *  place, and it is the only one that does not re-open a settled question.
 *
 *  ⚠⚠ **AND IT IS BEHIND THE PENCIL SINCE 27 Sep 2026** (the user: *"arrange
 *  tools on home also part of edit on top right"*). Arranging the grid IS
 *  editing the home, so it belongs with the disc's ⊕, the styles ＋ and Edit
 *  details rather than standing on a read-only screen — which is what C60
 *  decided for every other editor the day before and this one alone kept doing.
 *  All four homes already wrap their grid in `EditModeProvider`, so the gate is
 *  complete rather than partial.
 *
 *  ⚠ The open list is DERIVED (`open && editing`) rather than closed by an
 *  effect — this repo's lint forbids a setState in one, and more to the point a
 *  remount would throw away `order`, which is the only place the arrangement
 *  somebody just made lives until the next server read. Leaving edit mode hides
 *  the list; pressing the pencil again returns to it, which is where they were.
 *
 *  ⚠ **EVERY MOVE IS WRITTEN, one whole order at a time**, exactly as the two
 *  roster desks write theirs — `set_my_layout` is atomic (`jsonb_set` in one
 *  statement), so two tabs arranging two different grids cannot clobber each
 *  other. The list on screen is the local state, so a slow write never makes a
 *  tile appear to jump back. */
export function ArrangeTools({
  tiles,
  defaultOrder,
  layoutKey,
  arranged = false,
  kind,
  children = null,
}: {
  /** already in the order this person put them — the server arranges, so the
      first paint is right and nothing re-orders under them on hydration */
  tiles: Tile[];
  /** ⚠ THE CODE'S OWN ORDER, which `tiles` is NOT once somebody has arranged.
      Reset needs to know what "arranged by nobody" looks like, and deriving it
      from `tiles` would make Reset a no-op on screen for exactly the people who
      have something to reset — it would still have stored the right thing, so
      the list would only snap back on the next navigation. Found by reading this
      back rather than by a run, and `shoot-tiles` asserts it now. */
  defaultOrder: string[];
  /** which grid this is (`tools:studio:{id}` …), or null when it cannot be
      keyed — then the grid draws and simply offers no arranging */
  layoutKey: string | null;
  /** is there something stored to reset? A Reset that can only be a no-op is the
      kind of control this file has deleted three times */
  arranged?: boolean;
  /** which grid this is, for the heading it now draws itself (27 Sep 2026) */
  kind: ToolsKind;
  /** whatever the caller wants ABOVE the grid, inside the same panel */
  children?: ReactNode;
}): ReactNode {
  const { editing } = useEditMode();
  const [order, setOrder] = useState<Tile[]>(tiles);
  const [open, setOpen] = useState(false);
  const [isStored, setIsStored] = useState(arranged);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: Tile[], stored: boolean) => {
    setOrder(next);
    setIsStored(stored);
    setErr(null);
    if (!layoutKey) return;
    start(async () => {
      const res = await setToolOrderAction({ key: layoutKey, order: stored ? orderOf(next) : [] });
      if (res.error) setErr(res.error);
    });
  };

  const move = (from: number, to: number) => save(moveTile(order, from, to), true);
  /* ⚠ RESET SENDS AN EMPTY ORDER, which is how the door is told to FORGET the
     key (`layout - p_key`) — so "back to the default" and "never arranged" are
     the same stored state rather than an empty array pretending to be a choice. */
  const reset = () => save(arrangeTiles(order, defaultOrder), false);

  /** THE CONTROL, ON THE HEAD (27 Sep 2026) — drawn only behind the pencil and
   *  only where the grid can be keyed, so a read-mode Home still carries the
   *  heading and nothing else. */
  const control =
    layoutKey && editing ? (
      <button type="button" onClick={() => setOpen((v) => !v)} aria-pressed={open} style={quietBtn}>
        {open ? "Done" : "Arrange"}
      </button>
    ) : null;

  if (!(open && editing)) {
    return (
      <ToolsPanel kind={kind} head={control}>
        {children}
        <ToolGrid tiles={order} />
      </ToolsPanel>
    );
  }

  return (
    <ToolsPanel kind={kind} head={control}>
      {children}
      {/* ⚠ NO PARAGRAPH (27 Sep 2026, the user: *"there should be no extra
          details for everything in the app unless things are very important"*).
          It said the arrows move a tool and the order is kept on the account —
          the arrows are labelled "Move Calendar up" and where the order lives
          is not something anybody has to be told before pressing one. */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {order.map((t, i) => (
          <li
            key={t.k}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: CARD,
              border: `1.5px solid ${LINE}`,
              borderLeft: `3px solid ${t.c}`,
              borderRadius: 14,
              padding: "8px 10px",
              boxSizing: "border-box",
            }}
          >
            <ToolGlyph k={t.k} c={t.c} size={30} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, letterSpacing: -0.2, color: INK, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>
              {t.name}
            </span>
            {/* ⚠ these DO carry an aria-label, and that is not the 22 Sep mistake
                in a new coat: a button whose visible content is a glyph has no
                accessible name without one. The lesson there was a FIXED label
                contradicting visible TEXT — there is no text here to contradict. */}
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0 || pending} aria-label={`Move ${t.name} up`} style={arrowBtn(i === 0)}>
              ▲
            </button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1 || pending} aria-label={`Move ${t.name} down`} style={arrowBtn(i === order.length - 1)}>
              ▼
            </button>
          </li>
        ))}
      </ul>

      {err ? (
        <p role="status" style={{ margin: "10px 0 0", fontSize: 11, fontWeight: 800, color: "#F87171" }}>
          {err}
        </p>
      ) : null}

      {/* Done is on the head now; Reset is the only thing left that belongs
          under the list it resets */}
      {isStored ? (
        <div style={{ display: "flex", marginTop: 12 }}>
          <button type="button" onClick={reset} style={quietBtn}>
            Reset to default
          </button>
        </div>
      ) : null}
    </ToolsPanel>
  );
}

/* the panel inverts the palette for its whole subtree, so these read against
   the ground they are actually on rather than against the page's (21 Sep) */
const quietBtn = {
  background: "transparent",
  border: `1.5px solid ${LINE}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 11.5,
  fontWeight: 900,
  letterSpacing: 0.2,
  color: INK,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
} as const;

const arrowBtn = (off: boolean) =>
  ({
    flexShrink: 0,
    width: 34,
    height: 34,
    borderRadius: 11,
    background: "transparent",
    border: `1.5px solid ${LINE}`,
    color: off ? SUB : INK,
    fontSize: 12,
    lineHeight: 1,
    cursor: off ? "default" : "pointer",
    opacity: off ? 0.45 : 1,
    WebkitTapHighlightColor: "transparent",
  }) as const;
