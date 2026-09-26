"use client";

import { useState, useTransition } from "react";
import { PLATFORMS, handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { CARD, INK, LINE, PINK, SUB } from "@/lib/design/tokens";
import type { SocialLink } from "@/types/profile";
import { useEditMode } from "./EditMode";
import { LINKS_ROW, linkChip } from "./profile-band";
import { PlatformIcon, Sheet, dangerBtn, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";
import { useRecordLists } from "./RecordLists";

/** ONE LINKS ROW, EVERY KIND OF PROFILE (26 Sep 2026).
 *
 *  The user: *"all profiles should have both dance style edits and social media
 *  edit options and option to add multiple."* A studio's row (`StudioLinksRow`,
 *  20 Sep) and a person's (`HomeBand`, 19 Sep) were the same 230 lines with a
 *  different door behind them, and a crew's was about to be the third copy —
 *  this repo's own recurring bill. The row, the list sheet with its ↑↓ and its
 *  removals (11161) and the one-platform editor (11140) live HERE now; what a
 *  caller passes is the list and the DOOR (`save`), which is the only thing that
 *  ever differed.
 *
 *  ⚠ THE ＋ AND THE CHIPS' EDITORS APPEAR WITH THE PENCIL. In read mode a chip
 *  is a link OUT to where it points, exactly as on the public page; while the
 *  home is being edited a chip is a button onto its editor. Neither the row nor
 *  the sheets draw a control for somebody who may not edit (`canEdit` false —
 *  a trainer on a studio's team). */
/** ⚠ THE LIST IS THE HOME'S, NOT THIS ROW'S (`RecordLists`, 26 Sep 2026). The
 *  contact ⊕ writes the WhatsApp entry into the same `socials` from OUTSIDE
 *  this row — `shoot-hero` read the Message button drawn and the chip missing
 *  while the row held a `useState` seeded once — and the styles row beside it
 *  sends these links back with every save of its own. One list on the home,
 *  read and adopted by all three, is what makes both of those true without a
 *  remount and without a stale copy. */
export function LinksRowEditor({
  canEdit,
  save,
  emptyWords = null,
}: {
  canEdit: boolean;
  /** the door: resolves to an error sentence, or null when it landed */
  save: (next: SocialLink[]) => Promise<string | null>;
  /** what an empty row says in read mode, if anything */
  emptyWords?: string | null;
}) {
  const { lists, adopt } = useRecordLists();
  const socials = lists.socials;
  const [listOpen, setListOpen] = useState(false);
  const [editor, setEditor] = useState<{ platform: string; url: string; isNew: boolean } | null>(null);
  const [custom, setCustom] = useState({ label: "", url: "" });
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { editing } = useEditMode();
  const canChange = canEdit && editing;

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const commit = (next: SocialLink[], said: string, after?: () => void) =>
    start(async () => {
      const err = await save(next);
      if (err) {
        fire(err);
        return;
      }
      adopt({ ...lists, socials: next });
      after?.();
      fire(said);
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= socials.length) return;
    const next = [...socials];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next, "Order saved");
  };

  if (!socials.length && !canChange && !emptyWords) return null;

  return (
    <>
      <div style={LINKS_ROW}>
        {socials.map((l) =>
          canChange ? (
            <button
              type="button"
              key={l.platform}
              aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`}
              onClick={() => setEditor({ platform: l.platform, url: l.url, isNew: false })}
              style={linkChip}
            >
              <span style={{ flexShrink: 0, lineHeight: 0 }}>
                <PlatformIcon label={l.platform} size={15} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
            </button>
          ) : (
            <a
              key={l.platform}
              href={safeHref(l.url) ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`}
              style={{ ...linkChip, textDecoration: "none" }}
            >
              <span style={{ flexShrink: 0, lineHeight: 0 }}>
                <PlatformIcon label={l.platform} size={15} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
            </a>
          )
        )}
        {canChange ? (
          <button
            type="button"
            aria-label="Add a link"
            onClick={() => setListOpen(true)}
            style={{ ...linkChip, background: "transparent", border: "1px dashed var(--el)", fontSize: 12, fontWeight: 800, color: SUB }}
          >
            ＋ Add link
          </button>
        ) : null}
        {!socials.length && !canChange && emptyWords ? <span style={{ fontSize: 11.5, color: SUB, fontWeight: 700 }}>{emptyWords}</span> : null}
      </div>

      {/* the list, with its order and its removals (11161) */}
      {listOpen ? (
        <Sheet label="Add a social link" onClose={() => setListOpen(false)}>
          <b style={{ fontSize: 16 }}>Add a social link</b>
          <div style={{ fontSize: 12, color: SUB, margin: "4px 0 12px" }}>Reorder with ↑↓ · tap a platform below to add it.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {socials.map((l, i, arr) => (
              <div key={l.platform} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 14, background: CARD, border: `1.5px solid ${LINE}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ fontSize: 10, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▲</button>
                  <button type="button" aria-label="Move down" disabled={i === arr.length - 1} onClick={() => move(i, 1)} style={{ fontSize: 10, cursor: i === arr.length - 1 ? "default" : "pointer", color: i === arr.length - 1 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▼</button>
                </div>
                <PlatformIcon label={l.platform} size={24} />
                <button type="button" onClick={() => setEditor({ platform: l.platform, url: l.url, isNew: false })} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <b style={{ fontSize: 13.5, color: INK, display: "block" }}>{l.platform}</b>
                  <span style={{ fontSize: 11, color: SUB, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</span>
                </button>
                <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <button type="button" aria-label={`Edit ${l.platform}`} onClick={() => setEditor({ platform: l.platform, url: l.url, isNew: false })} style={{ fontSize: 12, fontWeight: 700, color: SUB, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Edit</button>
                  <button type="button" aria-label={`Remove ${l.platform}`} onClick={() => commit(arr.filter((x) => x.platform !== l.platform), `${l.platform} removed`)} style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Remove</button>
                </span>
              </div>
            ))}
          </div>
          {PLATFORMS.some((p) => !socials.find((l) => l.platform === p)) ? (
            <>
              <div style={fieldLabel}>Add a platform</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PLATFORMS.filter((p) => !socials.find((l) => l.platform === p)).map((p) => (
                  <button type="button" key={p} aria-label={`Add ${p}`} onClick={() => setEditor({ platform: p, url: "", isNew: true })} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "7px 13px 7px 7px", borderRadius: 999, cursor: "pointer", background: CARD, border: `1.5px solid ${LINE}`, color: INK, fontFamily: "inherit" }}>
                    <PlatformIcon label={p} size={20} />
                    {p}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ ...fieldLabel, margin: "18px 0 6px" }}>Something else?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input aria-label="Link label" value={custom.label} onChange={(e) => setCustom((d) => ({ ...d, label: e.target.value }))} placeholder="Label, e.g. Linktree" style={{ ...fieldInput, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13 }} />
            <input aria-label="Link URL" value={custom.url} onChange={(e) => setCustom((d) => ({ ...d, url: e.target.value }))} placeholder="https://…" style={{ ...fieldInput, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setListOpen(false)} style={sheetBtn(false)}>Done</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!custom.label.trim() || !custom.url.trim()) return fire("Add a label and URL first");
                commit([...socials, { platform: custom.label.trim(), url: custom.url.trim() }], "✓ Link added", () => setCustom({ label: "", url: "" }));
              }}
              style={sheetBtn(true)}
            >
              Add this link
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* one platform's URL (11140) */}
      {editor ? (
        <Sheet label={editor.isNew ? `Add your ${editor.platform}` : `Edit ${editor.platform}`} onClose={() => setEditor(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PlatformIcon label={editor.platform} size={24} />
            <b style={{ fontSize: 16 }}>{editor.isNew ? `Add your ${editor.platform}` : `Edit ${editor.platform}`}</b>
          </div>
          <div style={{ ...fieldLabel, margin: "16px 0 6px" }}>URL</div>
          <input aria-label="URL" value={editor.url} onChange={(e) => setEditor((d) => (d ? { ...d, url: e.target.value } : d))} placeholder="https://…" autoFocus style={fieldInput} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {!editor.isNew ? (
              <button type="button" onClick={() => commit(socials.filter((l) => l.platform !== editor.platform), `${editor.platform} removed`, () => setEditor(null))} style={dangerBtn}>Remove</button>
            ) : null}
            <button type="button" onClick={() => setEditor(null)} style={sheetBtn(false)}>Cancel</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const url = editor.url.trim();
                if (!url) return fire("Add a URL first");
                /* the same http(s) rule the database keeps, said before it refuses */
                if (!/^https?:\/\//i.test(url)) return fire("A link is a web address — it starts with https://");
                const rest = socials.filter((l) => l.platform !== editor.platform);
                const at = socials.findIndex((l) => l.platform === editor.platform);
                const next = at >= 0 ? [...rest.slice(0, at), { platform: editor.platform, url }, ...rest.slice(at)] : [...rest, { platform: editor.platform, url }];
                commit(next, editor.isNew ? `✓ ${editor.platform} added` : `✓ ${editor.platform} updated`, () => setEditor(null));
              }}
              style={sheetBtn(true)}
            >
              Save
            </button>
          </div>
        </Sheet>
      ) : null}

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "calc(90px + var(--dos-safe-bottom, 0px))", transform: "translateX(-50%)", zIndex: 800, background: "var(--solid)", border: "1.5px solid #0EA5E9", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 800, color: INK, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
