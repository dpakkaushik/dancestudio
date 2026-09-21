"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { LINKS_ROW, linkChip } from "@/features/profiles/components/profile-band";
import { PlatformIcon, Sheet, dangerBtn, fieldInput, fieldLabel, sheetBtn } from "@/features/profiles/components/profile-kit";
import { PLATFORMS, handleOf, isPlatform } from "@/lib/constants/socials";
import { CARD, INK, LINE, PINK, SUB } from "@/lib/design/tokens";
import type { SocialLink } from "@/types/profile";

/** A STUDIO'S LINKS, EDITED WHERE A PERSON'S ARE (20 Sep 2026, the user: "edit
 *  profile for studio not consistent with how its done for Artist and users. for
 *  social media links, photos etc.").
 *
 *  A person's links live in the band on HOME with a ＋ beside them (`HomeBand`,
 *  19 Sep: "social media tiles also on home and should be editable only from
 *  here"); a studio's lived in a block halfway down its Edit sheet. Same row,
 *  same chips, same sheets — this is that control with the studio's one door
 *  behind it, `update_business_profile`, which re-checks ownership inside and
 *  refuses anything that is not an http(s) address.
 *
 *  ⚠ IT SENDS THE FIELDS IT IS NOT EDITING BACK UNCHANGED. The RPC takes the
 *  whole profile, so a save that omitted the styles would empty them — and a
 *  studio with no style is refused outright (19 Sep). Everything but `socials`
 *  rides through exactly as it came in.
 *
 *  ⚠ AND IT IS THE OWNER'S. A trainer may read the row and is offered no ＋:
 *  `update_business_profile` refuses them, and a control that exists only to be
 *  refused is noise. */
/** ⚠ EXACTLY THE FIELDS IT SENDS, AND NOT `PublicTenant` (20 Sep 2026). The row
 *  is drawn for the whole team off the studio's own `Tenant` and edited by the
 *  owner; naming the wider type would have meant a cast at the call site, and a
 *  cast is how a missing field becomes a runtime `undefined` that wipes a column
 *  the RPC then refuses. This is the contract, so the compiler checks it. */
export interface StudioLinkTarget {
  id: string;
  socials: SocialLink[];
  styles: string[];
  foundedYear: number | null;
  phone: string | null;
  contactEmail: string | null;
  enquiryTypes: string[] | null;
  accepts: { upi: boolean; cards: boolean; cash: boolean; bank: boolean };
}

export function StudioLinksRow({ tenant, canEdit }: { tenant: StudioLinkTarget; canEdit: boolean }) {
  const router = useRouter();
  const [socials, setSocials] = useState<SocialLink[]>(tenant.socials);
  const [listOpen, setListOpen] = useState(false);
  const [editor, setEditor] = useState<{ platform: string; url: string; isNew: boolean } | null>(null);
  const [custom, setCustom] = useState({ label: "", url: "" });
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const save = (next: SocialLink[], said: string, after?: () => void) =>
    start(async () => {
      const out = await updateTenantProfileAction({
        tenantId: tenant.id,
        socials: next,
        /* unchanged, and sent because the door takes the whole profile */
        styles: tenant.styles,
        foundedYear: tenant.foundedYear,
        phone: tenant.phone,
        contactEmail: tenant.contactEmail,
        enquiryTypes: tenant.enquiryTypes,
        accepts: tenant.accepts,
      });
      if (out.error) {
        fire(out.error);
        return;
      }
      setSocials(next);
      after?.();
      fire(said);
      router.refresh();
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= socials.length) return;
    const next = [...socials];
    [next[i], next[j]] = [next[j], next[i]];
    save(next, "Order saved");
  };

  return (
    <>
      <div style={LINKS_ROW}>
        {socials.map((l) =>
          canEdit ? (
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
            <span key={l.platform} style={linkChip}>
              <span style={{ flexShrink: 0, lineHeight: 0 }}>
                <PlatformIcon label={l.platform} size={15} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
            </span>
          )
        )}
        {canEdit ? (
          <button
            type="button"
            aria-label="Add a link"
            onClick={() => setListOpen(true)}
            style={{ ...linkChip, background: "transparent", border: "1px dashed var(--el)", fontSize: 12, fontWeight: 800, color: SUB }}
          >
            ＋ Add link
          </button>
        ) : null}
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
                <button type="button" aria-label={`Remove ${l.platform}`} onClick={() => save(arr.filter((x) => x.platform !== l.platform), `${l.platform} removed`)} style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", flexShrink: 0 }}>Remove</button>
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
                save([...socials, { platform: custom.label.trim(), url: custom.url.trim() }], "✓ Link added", () => setCustom({ label: "", url: "" }));
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
        <Sheet label={editor.isNew ? `Add ${editor.platform}` : `Edit ${editor.platform}`} onClose={() => setEditor(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PlatformIcon label={editor.platform} size={24} />
            <b style={{ fontSize: 16 }}>{editor.isNew ? `Add ${editor.platform}` : `Edit ${editor.platform}`}</b>
          </div>
          <div style={{ ...fieldLabel, margin: "16px 0 6px" }}>URL</div>
          <input aria-label="URL" value={editor.url} onChange={(e) => setEditor((d) => (d ? { ...d, url: e.target.value } : d))} placeholder="https://…" autoFocus style={fieldInput} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {!editor.isNew ? (
              <button type="button" onClick={() => save(socials.filter((l) => l.platform !== editor.platform), `${editor.platform} removed`, () => setEditor(null))} style={dangerBtn}>Remove</button>
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
                save(next, editor.isNew ? `✓ ${editor.platform} added` : `✓ ${editor.platform} updated`, () => setEditor(null));
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
