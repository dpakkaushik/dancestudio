"use client";

import { Sheet, fieldLabel, sheetBtn } from "./profile-kit";
import { DragList } from "@/components/ui/DragList";
import { DOS_STYLE_NAMES, dosStyleColor } from "@/lib/constants/styles";
import { CARD, INK, LINE, SUB } from "@/lib/design/tokens";

/** ADD A DANCE STYLE — the prototype's own sheet (11217), extracted (21 Sep 2026).
 *
 *  The user: *"make sure all profile types have similar ways to edit the
 *  profile, the segments like social media, dance styles, pictures and
 *  posters."*
 *
 *  ⚠ A STUDIO'S STYLES WERE A `<select>` IN ITS EDIT SHEET while a person's
 *  were a ＋ on their own band — two controls for one idea, and the studio's
 *  could not reorder, could not remove, and did not say what the database
 *  refuses. Rather than write this editor a second time, it is one component
 *  and both call it: a person passes `updateMyProfileAction`, a studio passes
 *  `updateBusinessProfileAction`, and the sheet itself knows nothing about either.
 *
 *  ⚠ THE FLOOR IS THE DATABASE'S AND THE CALLER STATES IT. `update_my_profile`
 *  refuses a person with no style and `update_business_profile` refuses a studio
 *  with none, so Remove is DISABLED on the last one with the reason on it —
 *  which is that rule said on the screen rather than a press that can only be
 *  refused. The words differ ("a user names at least one style" / "a studio
 *  names at least one"), so they are the caller's too. */
export function StylesSheet({
  styles,
  onSave,
  pending,
  lastWords,
  /* no limit (10 Oct 2026, the user) — 100 is the database's safety ceiling */
  max = 100,
  onClose,
  label = "Add a dance style",
  title = "＋ Add a dance style",
  allowEmpty = false,
  intro,
}: {
  /** one line under the title saying what the list is for */
  intro?: string;
  styles: string[];
  /** hand back the whole new list — the caller owns the door and the toast */
  onSave: (next: string[], said: string) => void;
  pending: boolean;
  /** why the last one cannot be removed, in this profile's own words */
  lastWords: string;
  max?: number;
  onClose: () => void;
  /** the dialog's accessible name — the styles a person dances keep the old one */
  label?: string;
  title?: string;
  /** a list with no floor — the styles somebody wants to LEARN (11 Oct 2026) */
  allowEmpty?: boolean;
}) {
  const locked = (arr: string[]) => !allowEmpty && arr.length === 1;

  return (
    <Sheet label={label} onClose={onClose} maxHeight="78vh">
      <b style={{ fontSize: 16 }}>{title}</b>
      {intro ? <div style={{ fontSize: 12.5, color: INK, marginTop: 4, lineHeight: 1.45 }}>{intro}</div> : null}
      {/* ⚠ DRAG, NOT ARROWS (11 Oct 2026, the user: "pressing on the tiles and
          dragging them up and down … should be smooth") */}
      <div style={{ fontSize: 12, color: SUB, margin: "4px 0 6px" }}>{styles.length > 1 ? "Press and drag a style to reorder — this is the order shown." : allowEmpty && styles.length === 0 ? "Nothing picked yet — add from the list below." : " "}</div>
      <DragList
        items={styles}
        keyOf={(s) => s}
        nameOf={(s) => s}
        disabled={pending}
        onReorder={(next) => onSave(next, "Order saved")}
        render={(s, grip) => (
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px 8px 6px", borderRadius: 14, background: "var(--solid)", border: `1.5px solid ${LINE}`, color: INK }} data-testid="style-row">
            {grip}
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: dosStyleColor(s), flexShrink: 0 }} />
            <b style={{ flex: 1, fontSize: 13.5, color: INK }}>{s}</b>
            <button
              type="button"
              aria-label={locked(styles) ? `${s} is the last style — add another first` : `Remove ${s}`}
              disabled={locked(styles)}
              title={locked(styles) ? lastWords : undefined}
              onClick={() => onSave(styles.filter((x) => x !== s), `${s} removed`)}
              style={{ opacity: locked(styles) ? 0.35 : 1, fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: locked(styles) ? "default" : "pointer", flexShrink: 0, background: "none", border: "none", fontFamily: "inherit" }}
            >
              Remove
            </button>
          </div>
        )}
      />
      {DOS_STYLE_NAMES.some((s) => !styles.includes(s)) ? (
        <>
          <div style={fieldLabel}>Add more styles</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DOS_STYLE_NAMES.filter((s) => !styles.includes(s)).map((s) => (
              <button
                type="button"
                key={s}
                disabled={pending || styles.length >= max}
                aria-label={`Add ${s}`}
                onClick={() => onSave([...styles, s], `✓ ${s} added`)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "6px 13px 6px 6px", borderRadius: 999, cursor: "pointer", background: CARD, border: `1.5px solid ${LINE}`, color: INK, fontFamily: "inherit" }}
              >
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: dosStyleColor(s) }} />
                {s}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button type="button" onClick={onClose} style={{ ...sheetBtn(true), width: "100%", marginTop: 14 }}>
        Done
      </button>
    </Sheet>
  );
}
