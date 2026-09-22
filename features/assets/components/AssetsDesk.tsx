"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { removeAssetAction, saveAssetAction } from "@/features/assets/server-actions/assets";
import { DeskHero, BizToast } from "@/features/tenants/components/biz-kit";
import { DeskAddButton, eyebrow, rupees } from "@/features/settings/components/settings-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { ASSET_CATEGORIES, type Asset } from "@/repositories/assets";

/** ASSETS — what a business owns and what it is worth (21 Sep 2026, the user:
 *  "Fix assets for both artist, studio and organization. Make sure to just add
 *  name type of asset and price/ Old asset").
 *
 *  The prototype's S_assets (16791) lifted, and the user's "just" honoured: an
 *  asset is three things — a name, the TYPE from a closed list, and a value.
 *  The desk is the ＋, then INVENTORY with the total, then a row each; ⚠ the
 *  three fields are `AssetForm`, opened over this desk at `?new=1` since 22 Sep
 *  2026, because they were a card standing here permanently whether or not
 *  anybody was adding anything.
 *
 *  ⚠ "₹0 = OLD ASSET" IS THE PRICE FIELD, not a second control. The prototype's
 *  own placeholder is `₹ (0 = old)` and its row prints "₹0 (legacy)" (16792,
 *  16812) — so an asset the business already had is a value of zero, said in
 *  words on the row. A checkbox beside the number would be the same fact twice
 *  and the two could disagree.
 *
 *  ⚠ AND THE TOTAL IS COUNTED, NEVER STORED — the prototype prints
 *  "INVENTORY · ₹1,72,500 total" over the very rows it adds up, which is Step
 *  25's rule: a figure and the list behind it are the same number.
 *
 *  ⚠ NO PHOTO, deliberately. The prototype's form has one (16802-16810) and the
 *  user's list is "just … name type of asset and price". A picture of a PA
 *  system is a storage folder, a policy and a cropper for a field nobody asked
 *  for; it is a backlog row instead. */

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: INK, outline: "none", fontFamily: "inherit" };
const primary: CSSProperties = { textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", width: "100%", fontFamily: "inherit" };

/** the prototype's own money grammar for this screen: a real value, or the words
 *  that say it is one the business already had (16812) */
const valueWords = (n: number) => (n > 0 ? rupees(n) : "₹0 (legacy)");

export function AssetsDesk({ businessId, businessName, assets }: { businessId: string; businessName: string; assets: Asset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  /** the row being edited, and the two fields it edits in place (16823-16830) */
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const total = assets.reduce((n, a) => n + a.valueInr, 0);

  const saveEdit = (a: Asset) =>
    start(async () => {
      const out = await saveAssetAction({
        assetId: a.id,
        businessId,
        name: editName.trim() || a.name,
        category: a.category as (typeof ASSET_CATEGORIES)[number],
        valueInr: Number(editValue || 0),
      });
      if (out.error) return fire(out.error);
      setEditing(null);
      fire("Asset updated");
      router.refresh();
    });

  const drop = (a: Asset) =>
    start(async () => {
      const out = await removeAssetAction({ assetId: a.id, businessId });
      if (out.error) return fire(out.error);
      fire(`${a.name} removed`);
      router.refresh();
    });

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "0 16px 40px", boxSizing: "border-box" }}>
      <DeskHero tool="assets" as="h1" margin="12px 0 8px" />
      {/* whose — an organization runs several businesses, and the tool hero names the tool */}
      <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, margin: "0 0 12px" }}>What {businessName} owns</div>

      {/* ⚠ THE ADD FORM LEFT THIS DESK (22 Sep 2026, the user: "form for adding
          asset and adding room should be same way"). It was a card sitting here
          permanently — three fields above the very list they add to, whether or
          not you were adding anything — which is exactly the shape the routine
          and membership forms were in before 21 Sep. The ＋ opens it over the
          desk now, like every other "add something" in the app. */}
      <DeskAddButton label="Add asset" href="?new=1" />

      {/* ⚠ the rule between the heading and its figure (22 Sep 2026) — a "·"
          reads as punctuation between two words, not as a heading and the total
          that belongs to it. The total is still COUNTED off the very rows below
          it, which is Step 25's rule. */}
      <FigureHead
        margin="4px 0 8px"
        title={<span style={eyebrow}>INVENTORY</span>}
        figure={
          <span style={{ ...eyebrow, fontVariantNumeric: "tabular-nums" }} data-testid="assets-total">
            {rupees(total)} total
          </span>
        }
      />

      {assets.map((a) => (
        <div key={a.id} style={{ ...card, padding: "11px 13px" }} data-testid="asset-row">
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
              <div style={{ fontSize: 10.5, color: SUB }}>{a.category}</div>
            </div>
            <b style={{ fontSize: 12.5, flexShrink: 0 }} data-testid="asset-value">
              {valueWords(a.valueInr)}
            </b>
            <button
              type="button"
              onClick={() => {
                const open = editing === a.id;
                setEditing(open ? null : a.id);
                setEditName(a.name);
                setEditValue(String(a.valueInr));
              }}
              aria-label={`Edit ${a.name}`}
              style={{ fontSize: 10, fontWeight: 800, color: SUB, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", flexShrink: 0 }}
            >
              Edit
            </button>
            <button type="button" onClick={() => drop(a)} disabled={pending} aria-label={`Remove ${a.name}`} style={{ color: "#F87171", fontSize: 15, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", flexShrink: 0, lineHeight: 1 }}>
              ✕
            </button>
          </div>
          {editing === a.id ? (
            <div style={{ marginTop: 9 }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={`Name of ${a.name}`} maxLength={80} style={{ ...field, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={editValue} onChange={(e) => setEditValue(e.target.value.replace(/[^\d]/g, ""))} aria-label={`What ${a.name} is worth`} inputMode="numeric" style={{ ...field, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, flex: 1, width: "auto" }} />
                <button type="button" onClick={() => saveEdit(a)} disabled={pending} style={{ ...primary, width: "auto", padding: "9px 16px", borderRadius: 10, fontSize: 12 }}>
                  Save
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {assets.length === 0 ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
          Nothing on the inventory yet. An asset is three things — what it is, what type it is, and what it cost. Put ₹0 on something you already had.
        </div>
      ) : null}

      <BizToast msg={toast} />
    </div>
  );
}
