"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { removeAssetAction, saveAssetAction } from "@/features/assets/server-actions/assets";
import { DOS_TOOLS, DeskHero, BizToast } from "@/features/businesses/components/biz-kit";
import { DeskAddButton, eyebrow, rupees } from "@/features/settings/components/settings-kit";
import { Pick } from "@/components/ui/PickSheet";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
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
 *  ⚠ A PICTURE SINCE 3 Oct 2026 (the user: "do small extras"). It was left out
 *  on 21 Sep because the user's list was "just … name type of asset and price";
 *  it is added on an existing asset from Edit, not asked for in the add form,
 *  so adding one is still those three fields. */

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: INK, outline: "none", fontFamily: "inherit" };
const primary: CSSProperties = { textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", width: "100%", fontFamily: "inherit" };

/** the prototype's own money grammar for this screen: a real value, or the words
 *  that say it is one the business already had (16812) */
const valueWords = (n: number) => (n > 0 ? rupees(n) : "₹0 (legacy)");

/** the Assets tool's own colour — the card's face, wash and figures */
const TINT = DOS_TOOLS.assets.c;

export function AssetsDesk({ businessId, businessName, assets }: { businessId: string; businessName: string; assets: Asset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  /** the row being edited, and the two fields it edits in place (16823-16830) */
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editCategory, setEditCategory] = useState("");

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
        category: (editCategory || a.category) as (typeof ASSET_CATEGORIES)[number],
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
      <DeskTop style={{ paddingBottom: 2 }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116) — the hero, whose it is, and Add */}
      <DeskHero tool="assets" as="h1" margin="0 0 8px" />
      {/* whose — an organization runs several businesses, and the tool hero names the tool */}
      <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, margin: "0 0 12px" }}>What {businessName} owns</div>

      {/* ⚠ THE ADD FORM LEFT THIS DESK (22 Sep 2026, the user: "form for adding
          asset and adding room should be same way"). It was a card sitting here
          permanently — three fields above the very list they add to, whether or
          not you were adding anything — which is exactly the shape the routine
          and membership forms were in before 21 Sep. The ＋ opens it over the
          desk now, like every other "add something" in the app. */}
      <DeskAddButton label="Add asset" href="?new=1" />
      </DeskTop>

      {/* ⚠ THE MIDDLE SECTION (4 Oct 2026, the user: "total assets count and total
          amount in middle section below add asset button"). Both are COUNTED off
          the very cards below them, never stored (Step 25's rule). */}
      <DeskMiddle>
        <ToolFacts
          tint={TINT}
          items={[
            { label: assets.length === 1 ? "Asset" : "Assets", value: assets.length, testId: "assets-count" },
            { label: "Total value", value: rupees(total), testId: "assets-total" },
          ]}
        />
      </DeskMiddle>

      {/* ⚠ THE LOWER SECTION — a card per asset, its picture as the card's face */}
      <DeskBody head={<FigureHead margin="0 0 8px" title={<span style={eyebrow}>INVENTORY</span>} />}>

      {assets.map((a) => (
        /* ⚠⚠ AN ASSET CARD (4 Oct 2026, the user: "better redesigned asset card
           with photo") — the app's one card: the picture in its squircle and the
           name at a profile's size, its type over it; what it is worth as a
           figure; Edit and Remove on a bar of their own. */
        <ToolCard key={a.id} testId="asset-row">
          <ToolHead
            tint={TINT}
            name={a.name}
            photoPath={a.photoPath}
            eyebrow={a.category}
            icon={<span aria-hidden="true" style={{ fontSize: 24 }}>📦</span>}
          />
          <ToolBody>
            <ToolFacts
              tint={TINT}
              items={[
                { label: a.valueInr > 0 ? "Worth" : "Already had", value: valueWords(a.valueInr), testId: "asset-value", tint: a.valueInr > 0 ? undefined : SUB },
              ]}
            />
          </ToolBody>
          <ToolActions>
            <button
              type="button"
              onClick={() => {
                const open = editing === a.id;
                setEditing(open ? null : a.id);
                setEditName(a.name);
                setEditValue(String(a.valueInr));
                setEditCategory(a.category);
              }}
              aria-label={`Edit ${a.name}`}
              aria-expanded={editing === a.id}
              style={toolBtn("tinted", TINT)}
            >
              Edit
            </button>
            <button type="button" onClick={() => drop(a)} disabled={pending} aria-label={`Remove ${a.name}`} style={toolBtn("danger", TINT)}>
              Remove
            </button>
          </ToolActions>
          {editing === a.id ? (
            <div style={{ padding: "0 12px 12px" }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={`Name of ${a.name}`} maxLength={80} style={{ ...field, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, marginBottom: 8 }} />
              {/* ⚠ THE TYPE IS EDITABLE TOO (3 Oct 2026) — it was the one field of the
                  three that could only be fixed by deleting the asset and adding it again */}
              <Pick
                value={editCategory}
                rows={ASSET_CATEGORIES.map((k) => ({ value: k, label: k }))}
                onPick={setEditCategory}
                ariaLabel={`Type of ${a.name}`}
                style={{ ...field, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}
              />
              <div style={{ marginBottom: 8 }}>
                <PhotoPicker
                  owner={{ kind: "asset", id: businessId, assetId: a.id }}
                  hasPhoto={Boolean(a.photoPath)}
                  label={a.photoPath ? `Change the picture of ${a.name}` : `Add a picture of ${a.name}`}
                  cropLabel="Asset picture"
                  onSaved={() => {
                    fire("Picture saved");
                    router.refresh();
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={editValue} onChange={(e) => setEditValue(e.target.value.replace(/[^\d]/g, ""))} aria-label={`What ${a.name} is worth`} inputMode="numeric" style={{ ...field, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, flex: 1, width: "auto" }} />
                <button type="button" onClick={() => saveEdit(a)} disabled={pending} style={{ ...primary, width: "auto", padding: "9px 16px", borderRadius: 10, fontSize: 12 }}>
                  Save
                </button>
              </div>
            </div>
          ) : null}
        </ToolCard>
      ))}

      {assets.length === 0 ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
          Nothing on the inventory yet. An asset is three things — what it is, what type it is, and what it cost. Put ₹0 on something you already had.
        </div>
      ) : null}
      </DeskBody>

      <BizToast msg={toast} />
    </div>
  );
}
