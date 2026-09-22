"use client";

import { useState, useTransition } from "react";
import { ToolGlyph, ToolGrid, type Tile } from "@/features/home/components/home-kit";
import { setToolOrderAction } from "@/features/home/server-actions/toolOrder";
import { arrangeTiles, moveTile, orderOf } from "@/features/home/toolOrder";
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
}) {
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

  if (!open) {
    return (
      <>
        <ToolGrid tiles={order} />
        {layoutKey ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(true)} style={quietBtn}>
              Arrange tools
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div>
      {/* one line saying what the arrows do — the rows carry glyphs and arrows,
          and neither says which direction is "first" on its own */}
      <p style={{ margin: "0 0 10px", fontSize: 11, lineHeight: 1.5, color: SUB }}>
        Move a tool up or down. The order is saved to your account, so it is the same on every device.
      </p>

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

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => setOpen(false)} style={{ ...quietBtn, flex: 1, background: INK, color: CARD, borderColor: INK }}>
          Done
        </button>
        {isStored ? (
          <button type="button" onClick={reset} style={quietBtn}>
            Reset to default
          </button>
        ) : null}
      </div>
    </div>
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
