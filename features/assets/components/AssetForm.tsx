"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import {
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
} from "@/components/ui/FormPage";
import { Pick } from "@/components/ui/PickSheet";
import { saveAssetAction } from "@/features/assets/server-actions/assets";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { rupees } from "@/features/settings/components/settings-kit";
import { DISC_RADIUS, INK, SUB } from "@/lib/design/tokens";
import { PhotoPicker, uploadPhotoFile } from "@/features/media/components/PhotoPicker";
import { ASSET_CATEGORIES, assetCategoryWords, type Asset } from "@/repositories/assets";
import { photoUrl } from "@/lib/media/photo";

const stepBtn = (on: boolean): CSSProperties => ({
  width: 46,
  height: 46,
  flexShrink: 0,
  borderRadius: 14,
  border: "1.5px solid var(--el)",
  background: "var(--card)",
  color: on ? "var(--text)" : "var(--muted)",
  fontSize: 20,
  fontWeight: 800,
  cursor: on ? "pointer" : "default",
  fontFamily: "inherit",
});

/** ADD ASSET — the form, on the app's one form anatomy (22 Sep 2026, the user:
 *  *"form for adding asset and adding room should be same way"*).
 *
 *  It was a card sitting permanently on the Assets desk — three fields and a
 *  button, above the very list it adds to — which is the shape the routine and
 *  membership forms were in before 21 Sep, and the reason the user is asking:
 *  every OTHER "add something" in this app is now a sheet that comes up over the
 *  desk that offered it, and this was a box you scrolled past whether or not you
 *  were adding anything.
 *
 *  ⚠ ONE PAGE, NO STEPS — there are three fields, and the same message asked for
 *  that too ("apart from class and event form all forms should be for one page").
 *
 *  ⚠ THE FIELDS ARE UNCHANGED, which is the point: the user's own list is "just
 *  name type of asset and price/ Old asset", and moving a form onto a shared
 *  frame is not licence to grow it. ₹0 still MEANS one the business already had
 *  (the prototype's `₹ (0 = old)`, 16792) and is still the same field, because
 *  two ways to say one thing can disagree.
 *
 *  ⚠ AND IT IS A SHEET ONLY — there is no `/business/{id}/assets/new`. The other
 *  five forms keep their own address because one was handed out (Rule 14); this
 *  one never had an address to promise, so inventing one would add a page
 *  nothing links to and nothing checks. */

/* ⚠ `businessName` STAYS ON THE PROP and is no longer drawn (27 Sep 2026): the
   two sentences that named the business went with the explanations, and the
   desk this form opens over already says whose it is. Kept rather than removed
   because every caller passes it and the name is what a heading would use if
   this form ever grows one. */
/* ⚠⚠ AND IT IS THE EDIT FORM TOO (4 Oct 2026, the user: "edit should not open
   like a collapse should only be editable from the form") — an asset's card used
   to fold open three inputs and a picture picker in place; Edit opens this same
   sheet at `?edit={asset}` now, prefilled, and nothing is written until Save.
   ⚠ QUANTITY joined the fields the same day ("quantity in form with 1 minimum
   while adding") — a count, starting at 1, never a multiplier of the price. */
export function AssetForm({ businessId, asset }: { businessId: string; businessName?: string; asset?: Asset | null }) {
  const router = useRouter();
  const editing = Boolean(asset);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState(asset?.name ?? "");
  const [category, setCategory] = useState<string>(asset && (ASSET_CATEGORIES as readonly string[]).includes(asset.category) ? asset.category : ASSET_CATEGORIES[0]);
  const [quantity, setQuantity] = useState(String(asset?.quantity ?? 1));
  const [value, setValue] = useState(asset ? String(asset.valueInr) : "");
  /* ⚠ ONE PICTURE, IN A SQUIRCLE, AT ADD TIME (4 Oct 2026, the user: "add asset
     to have a photo upload option in squircle 1 photo only"). The asset has no
     id until it is saved, and the picture's row needs one, so the cropped file
     is STAGED here (the picker's deferred mode, onboarding's own pattern) and
     uploaded against the id the save hands back. */
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(photoUrl(asset?.photoPath));

  const stage = (file: File) => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /* ⚠ THE VALUE IS ASKED FOR RATHER THAN DEFAULTED. On the desk an empty box
     became `Number(value || 0)` — so leaving it alone quietly filed the asset as
     one the business already had, which is a CLAIM about money made by not
     typing. The bar names it, and the placeholder says what ₹0 means. */
  const blockers: string[] = [];
  if (!name.trim()) blockers.push("Name the asset first");
  const qty = Number(quantity);
  if (!quantity.trim() || !Number.isFinite(qty) || qty < 1) blockers.push("A quantity is at least 1");
  else if (qty > 10000) blockers.push("That is more than one listing should hold");
  if (!value.trim()) blockers.push("Say what it is worth — ₹0 if you already had it");
  const ready = blockers.length === 0;
  const worth = Number(value || 0);
  const done = editing ? "Asset saved" : "📦 Asset added";

  const save = () =>
    start(async () => {
      const out = await saveAssetAction({
        assetId: asset?.id ?? null,
        businessId,
        name,
        category: category as (typeof ASSET_CATEGORIES)[number],
        valueInr: worth,
        quantity: qty,
      });
      setConfirm(false);
      if (out.error) return fire(out.error);
      /* the picture goes up against the row; a refused picture is said and does
         not undo the asset, which is already on the inventory */
      if (photo && out.id) {
        const up = await uploadPhotoFile({ kind: "asset", id: businessId, assetId: out.id }, photo);
        if (up.error) fire(`${editing ? "Asset saved" : "Asset added"} — the picture did not save: ${up.error}`);
        else fire(done);
      } else {
        fire(done);
      }
      /* the desk is already underneath: `back()` spends the `?new=1` entry that
         opened this, and `refresh()` re-runs the desk's own read so the row and
         the total behind the sheet are the new ones (22 Sep 2026) */
      setTimeout(() => {
        router.back();
        router.refresh();
      }, 600);
    });

  return (
    /* ⚠ "Add Asset" with a capital A (4 Oct 2026, the user: "button A capital for
       asset on both page and form") */
    <FormPage title={editing ? "Edit Asset" : "Add Asset"} sheet onClose={() => router.back()} onBack={() => router.back()}>
      <>
        <div style={FORM_LABEL}>PICTURE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            data-testid="asset-form-photo"
            style={{ position: "relative", width: 92, height: 92, borderRadius: 92 * DISC_RADIUS, overflow: "hidden", flexShrink: 0, border: `1.5px ${preview ? "solid" : "dashed"} var(--el)`, background: `${DOS_TOOLS.assets.c}14`, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL, before anything is uploaded
              <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span aria-hidden="true" style={{ fontSize: 30 }}>📦</span>
            )}
            <PhotoPicker
              owner={{ kind: "asset", id: businessId, assetId: "00000000-0000-0000-0000-000000000000" }}
              hasPhoto={Boolean(preview)}
              label="Change the asset's picture"
              cropLabel="Asset picture"
              overlay
              onPicked={stage}
            />
          </div>
          <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>One picture, optional.</div>
        </div>

        <div style={FORM_LABEL}>ASSET NAME</div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. PA system" aria-label="Asset name" style={FORM_INPUT} />

        <div style={FORM_LABEL}>TYPE OF ASSET</div>
        {/* ⚠ THE APP'S OWN SHEET, NOT THE PHONE'S (27 Sep 2026) — this form opens
            as a sheet over the Assets desk, and a native `<select>` inside it put
            the OS's own full-screen picker over the whole app. Same fourteen
            words, same value, same accessible name. */}
        <Pick
          value={category}
          rows={ASSET_CATEGORIES.map((c) => ({ value: c, label: assetCategoryWords(c) }))}
          onPick={setCategory}
          ariaLabel="Type of asset"
          style={{ ...FORM_INPUT, fontWeight: 700 }}
        />

        <div style={FORM_LABEL}>QUANTITY</div>
        {/* ⚠ at least 1, and the stepper cannot go under it (4 Oct 2026) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" aria-label="One fewer" disabled={!(qty > 1)} onClick={() => setQuantity(String(Math.max(1, (Number.isFinite(qty) ? qty : 1) - 1)))} style={stepBtn(qty > 1)}>
            −
          </button>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
            onBlur={() => setQuantity(String(Math.min(10000, Math.max(1, Number(quantity) || 1))))}
            aria-label="Quantity"
            inputMode="numeric"
            style={{ ...FORM_INPUT, textAlign: "center", fontWeight: 800, flex: 1 }}
          />
          <button type="button" aria-label="One more" onClick={() => setQuantity(String(Math.min(10000, (Number.isFinite(qty) && qty > 0 ? qty : 0) + 1)))} style={stepBtn(true)}>
            +
          </button>
        </div>

        <div style={FORM_LABEL}>WHAT IT IS WORTH{qty > 1 ? ` — ALL ${qty}` : ""}</div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="₹ (0 = one you already had)"
          aria-label="What it is worth — 0 means you already had it"
          inputMode="numeric"
          style={FORM_INPUT}
        />

        {/* ⚠ THE ₹0 RULE STAYS ON THE FIELD, NOT HERE — the placeholder reads
            "₹ (0 = old)" and the row prints "₹0 (legacy)", so the one fact this
            paragraph carried is said where the number is typed and where it is
            read. Blockers only. */}
        <FormNote blockers={blockers.length ? blockers : undefined} />
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? (editing ? "Save Asset" : "Add Asset") : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label={editing ? "Save this asset?" : "Add this asset?"}
          title={editing ? "Save this asset?" : "Add this asset?"}
          confirmWord={pending ? (editing ? "Saving…" : "Adding…") : editing ? "Save it" : "Add it"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary tint={DOS_TOOLS.assets.c} head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>📦 {assetCategoryWords(category)}</span>}>
            <b style={{ fontSize: 15 }}>
              {name.trim()}
              {qty > 1 ? ` × ${qty}` : ""}
            </b>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: worth > 0 ? INK : SUB }}>{worth > 0 ? rupees(worth) : "₹0 (legacy)"}</div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
