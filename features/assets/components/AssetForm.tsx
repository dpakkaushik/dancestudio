"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { saveAssetAction } from "@/features/assets/server-actions/assets";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { rupees } from "@/features/settings/components/settings-kit";
import { INK, SUB } from "@/lib/design/tokens";
import { ASSET_CATEGORIES } from "@/repositories/assets";

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

export function AssetForm({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(ASSET_CATEGORIES[0]);
  const [value, setValue] = useState("");

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
  if (!value.trim()) blockers.push("Say what it is worth — ₹0 if you already had it");
  const ready = blockers.length === 0;
  const worth = Number(value || 0);

  const save = () =>
    start(async () => {
      const out = await saveAssetAction({
        businessId,
        name,
        category: category as (typeof ASSET_CATEGORIES)[number],
        valueInr: worth,
      });
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire("📦 Asset added");
      /* the desk is already underneath: `back()` spends the `?new=1` entry that
         opened this, and `refresh()` re-runs the desk's own read so the row and
         the total behind the sheet are the new ones (22 Sep 2026) */
      setTimeout(() => {
        router.back();
        router.refresh();
      }, 600);
    });

  return (
    <FormPage title="Add asset" sheet onClose={() => router.back()} onBack={() => router.back()}>
      <>
        <div style={FORM_LABEL}>ASSET NAME</div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. PA system" aria-label="Asset name" style={FORM_INPUT} />

        <div style={FORM_LABEL}>TYPE OF ASSET</div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Type of asset"
          style={{ ...FORM_INPUT, fontWeight: 700, WebkitAppearance: "none", appearance: "none" }}
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div style={FORM_LABEL}>WHAT IT IS WORTH</div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="₹ (0 = one you already had)"
          aria-label="What it is worth — 0 means you already had it"
          inputMode="numeric"
          style={FORM_INPUT}
        />

        <FormNote blockers={blockers.length ? blockers : undefined}>
          {worth > 0
            ? `Counted as an expense on ${businessName}'s earnings, in the period it was added — an asset has no purchase date, so the screen does not pretend to one.`
            : "₹0 means one you already had. It goes on the inventory and adds nothing to what was spent, which is the whole point of counting it as zero."}
        </FormNote>
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? "Add asset" : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Add this asset?"
          title="Add this asset?"
          sub={`It goes on ${businessName}'s inventory. You can change what it is worth, or take it off, from the desk.`}
          confirmWord={pending ? "Adding…" : "Add it"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary tint={DOS_TOOLS.assets.c} head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>📦 {category}</span>}>
            <b style={{ fontSize: 15 }}>{name.trim()}</b>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: worth > 0 ? INK : SUB }}>{worth > 0 ? rupees(worth) : "₹0 (legacy)"}</div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
