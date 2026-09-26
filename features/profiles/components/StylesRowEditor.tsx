"use client";

import { useState, useTransition } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, SUB } from "@/lib/design/tokens";
import { useEditMode } from "./EditMode";
import { STYLES_ROW } from "./profile-band";
import { useRecordLists } from "./RecordLists";
import { StylesSheet } from "./StylesSheet";

/** ONE STYLES ROW, EVERY KIND OF PROFILE (26 Sep 2026) — the tiles, the ＋ and
 *  the prototype's Add-a-dance-style sheet (11217), with the DOOR passed in.
 *  `StudioStylesRow` (21 Sep) and `HomeBand`'s styles (19 Sep) were the same
 *  row; a crew's is the third caller and the reason it is one component now.
 *
 *  ⚠ THE ＋ APPEARS WITH THE PENCIL — the home is read-only until the corner's
 *  Edit is pressed — and never for somebody who may not edit.
 *
 *  ⚠ THE LIST IS THE HOME'S, NOT THIS ROW'S (`RecordLists`): the row draws
 *  `lists.styles`, the door merges from the same object, and a save that
 *  landed is `adopt`ed there — so the links row and the contact ⊕ beside it
 *  never write a stale copy of these styles back over the record. */
export function StylesRowEditor({
  canEdit,
  save,
  aria,
  lastWords,
  fallback = [],
  emptyWords = "No styles named yet.",
}: {
  canEdit: boolean;
  /** the door: an error sentence, or null when it landed */
  save: (next: string[]) => Promise<string | null>;
  aria: (s: string) => string;
  /** what the sheet says under the last style — the floor is the database's and differs by kind */
  lastWords: string;
  /** shown while the FIELD is empty (a studio's derived styles, 19 Sep 2026) */
  fallback?: string[];
  emptyWords?: string | null;
}) {
  const { lists, adopt } = useRecordLists();
  const styles = lists.styles;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { editing } = useEditMode();
  const showPlus = canEdit && editing;

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const commit = (next: string[], said: string) =>
    start(async () => {
      const err = await save(next);
      if (err) {
        fire(err);
        return;
      }
      adopt({ ...lists, styles: next });
      fire(said);
    });

  return (
    <>
      <div style={STYLES_ROW}>
        {(styles.length ? styles : fallback).map((s) => (
          <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={aria(s)} small />
        ))}
        {showPlus ? (
          <button
            type="button"
            aria-label="Add a dance style"
            onClick={() => setOpen(true)}
            style={{ width: 30, height: 30, borderRadius: 10, background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 800, color: SUB, flexShrink: 0, border: "none", fontFamily: "inherit" }}
          >
            ＋
          </button>
        ) : null}
        {styles.length === 0 && fallback.length === 0 && !showPlus && emptyWords ? <span style={{ fontSize: 11.5, color: SUB, fontWeight: 700 }}>{emptyWords}</span> : null}
      </div>
      {open ? <StylesSheet styles={styles} pending={pending} lastWords={lastWords} onSave={commit} onClose={() => setOpen(false)} /> : null}
      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 650, fontFamily: DOS_UI }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
