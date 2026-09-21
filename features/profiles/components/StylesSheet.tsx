"use client";

import { Sheet, fieldLabel, sheetBtn } from "./profile-kit";
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
 *  `updateTenantProfileAction`, and the sheet itself knows nothing about either.
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
  max = 12,
  onClose,
}: {
  styles: string[];
  /** hand back the whole new list — the caller owns the door and the toast */
  onSave: (next: string[], said: string) => void;
  pending: boolean;
  /** why the last one cannot be removed, in this profile's own words */
  lastWords: string;
  max?: number;
  onClose: () => void;
}) {
  const move = (arr: string[], i: number, dir: -1 | 1): string[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const out = [...arr];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  return (
    <Sheet label="Add a dance style" onClose={onClose} maxHeight="78vh">
      <b style={{ fontSize: 16 }}>＋ Add a dance style</b>
      <div style={{ fontSize: 12, color: SUB, margin: "4px 0 6px" }}>Reorder with ↑↓ — this is the order shown on the profile.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {styles.map((s, i, arr) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 14, background: CARD, border: `1.5px solid ${LINE}` }}>
            <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button type="button" aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => onSave(move(arr, i, -1), "Order saved")} style={{ lineHeight: 1, fontSize: 10, padding: "1px 4px", borderRadius: 5, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, color: INK, fontFamily: "inherit" }}>
                ▲
              </button>
              <button type="button" aria-label={`Move ${s} down`} disabled={i === arr.length - 1} onClick={() => onSave(move(arr, i, 1), "Order saved")} style={{ lineHeight: 1, fontSize: 10, padding: "1px 4px", borderRadius: 5, background: "none", border: "none", cursor: i === arr.length - 1 ? "default" : "pointer", opacity: i === arr.length - 1 ? 0.3 : 1, color: INK, fontFamily: "inherit" }}>
                ▼
              </button>
            </span>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: dosStyleColor(s), flexShrink: 0 }} />
            <b style={{ flex: 1, fontSize: 13.5, color: INK }}>{s}</b>
            <button
              type="button"
              aria-label={arr.length === 1 ? `${s} is the last style — add another first` : `Remove ${s}`}
              disabled={arr.length === 1}
              title={arr.length === 1 ? lastWords : undefined}
              onClick={() => onSave(arr.filter((x) => x !== s), `${s} removed`)}
              style={{ opacity: arr.length === 1 ? 0.35 : 1, fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: arr.length === 1 ? "default" : "pointer", flexShrink: 0, background: "none", border: "none", fontFamily: "inherit" }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
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
