"use client";

import { GOLD, GREEN, SUB } from "@/lib/design/tokens";
import { PROOF_MAX, PROOF_MIN } from "@/lib/media/proof";
import type { HeaderDraft } from "../headerDraft";
import { HeaderGrid, type GridTile } from "./HeaderGrid";

/** THE HEADER PICTURES BLOCK, INSIDE A SHEET THAT HAS A SAVE BUTTON.
 *
 *  Presentational on purpose: the draft belongs to the SHEET
 *  (`useHeaderDraft`), because the sheet's Save is what commits it and its
 *  Cancel is what discards it. A component that owned the state would have to
 *  hand a commit function back up through a ref to make that work.
 *
 *  Two lines under the grid do the arguing the deleted paragraph used to do,
 *  and only when there is something to say:
 *   - the studio's count badge, which is the ONE true thing that paragraph
 *     carried — DanceOS wants five, because a studio's header pictures really
 *     are the evidence an admin checks;
 *   - the dirty line, which is the answer to the bug the user hit: nothing
 *     happens until Save, and Cancel leaves the pictures alone. */

/** The tiles a draft draws, in the draft's own order — shared with the sheet,
 *  which needs the same list to feed the lightbox. A picture staged for removal
 *  KEEPS ITS PLACE rather than vanishing to the end: a grid that reorders under
 *  the finger is how somebody removes the wrong one next. */
export function headerTiles(draft: HeaderDraft, subject: string): GridTile[] {
  return draft.items.map((item, i) => ({
    key: item.key,
    url: item.kind === "new" ? item.previewUrl : item.row.url,
    alt: `Header picture ${i + 1} of ${subject}`,
    signed: item.kind === "new" ? false : item.row.signed,
    marked: item.kind === "stored" && item.removed,
    removable: draft.canRemove(item),
    failed: item.failed,
  }));
}

export function HeaderPictures({
  draft,
  tiles,
  kind,
  canWrite,
  addLabel,
  onOpen,
  busy = false,
}: {
  draft: HeaderDraft;
  tiles: GridTile[];
  /** ⚠ only `"studio"` branches — it alone draws the 5-of-10 counter, because a
   *  studio's posters ARE the evidence an admin checked. `"crew"` joined the
   *  union on 21 Sep 2026 rather than a crew being passed `"person"`: the only
   *  thing a wrong word here costs is the next reader, and there is no reason
   *  to make them work out that a crew is a person. */
  kind: "studio" | "person" | "crew";
  canWrite: boolean;
  /** the Add tile's accessible name — "Add photos of your space" for a studio,
   *  "Add picture" for a person. Both are pressed by name in the harness. */
  addLabel: string;
  onOpen: (index: number) => void;
  busy?: boolean;
}) {
  const { keeping, error, canAdd, stage, unstage } = draft;
  const enough = keeping >= PROOF_MIN;

  return (
    <div>
      {kind === "studio" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <span
            role="status"
            aria-label={`${keeping} of ${PROOF_MIN} to ${PROOF_MAX} photos added`}
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 0.6,
              padding: "3px 8px",
              borderRadius: 6,
              background: enough ? `${GREEN}22` : `${GOLD}22`,
              color: enough ? GREEN : GOLD,
            }}
          >
            {keeping} / {PROOF_MIN}–{PROOF_MAX}
          </span>
          <span style={{ fontSize: 10.5, color: SUB, lineHeight: 1.4 }}>
            {enough ? "enough for DanceOS to check" : `at least ${PROOF_MIN - keeping} more to be verified`}
          </span>
        </div>
      ) : null}

      <HeaderGrid
        tiles={tiles}
        canWrite={canWrite}
        busy={busy}
        onOpen={onOpen}
        onRemove={unstage}
        addLabel={addLabel}
        onFiles={stage}
        full={!canAdd}
      />

      {/* ⚠ NO PARAGRAPH HERE, AND NO UNDO LINK (16 Sep 2026, the user: "why undo
          the last removal — at the end of form there [is] cancel, also there is
          [an] undo button over [the] selected image"). Right: three ways to
          reverse one thing, and a paragraph explaining what Save and Cancel
          mean. What is staged is already said twice, where a person is looking:
          the tile wears REMOVING, and the Save button counts the changes. */}
      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 8, lineHeight: 1.45 }}>{error}</div> : null}
      {tiles.some((t) => t.failed) ? (
        <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 6, lineHeight: 1.45 }}>
          {tiles.find((t) => t.failed)?.failed}
        </div>
      ) : null}
    </div>
  );
}
