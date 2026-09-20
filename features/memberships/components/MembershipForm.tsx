"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  EL,
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
  formSecondary,
} from "@/components/ui/FormPage";
import { saveMembershipAction } from "@/features/memberships/server-actions/memberships";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { INK, LILAC, SUB } from "@/lib/design/tokens";

/** NEW MEMBERSHIP — a page now, wearing the ADD CLASS anatomy (21 Sep 2026, the
 *  user: *"same should be for new routine and new membership"*).
 *
 *  ⚠ STILL EXACTLY FOUR THINGS (19 Sep 2026, the user: "Memberships can be
 *  created by just 4 things: Name, No. of hrs / No. of classes and price and
 *  total memberships count"). Moving the form to a page is not licence to grow
 *  it — the step split is what the class form does with the fields it already
 *  has, and this one splits the same four: what the pass IS, then what it costs
 *  and how many exist. No expiry, no tiers, nothing the user did not ask for. */

const STEPS = ["What it is", "Price & how many"] as const;

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function MembershipForm({ sellerId, sellerName }: { sellerId: string; sellerName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", unit: "classes" as "classes" | "hours", units: "10", price: "", total: "20" });

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const units = Number(f.units);
  const price = Number(f.price);
  const total = Number(f.total);

  const stepOneErr = !f.name.trim()
    ? "Name the membership first"
    : !Number.isFinite(units) || units <= 0
      ? `Say how many ${f.unit} it is worth`
      : null;

  const blockers: string[] = [];
  if (!Number.isFinite(price) || price < 0) blockers.push("Put a price on it — ₹0 is allowed");
  if (!Number.isFinite(total) || total < 1) blockers.push("Say how many of these may be sold");
  const ready = blockers.length === 0;

  const save = () => {
    start(async () => {
      const out = await saveMembershipAction({
        membershipId: null,
        businessId: sellerId,
        name: f.name,
        unit: f.unit,
        units,
        priceInr: price,
        totalCount: total,
        status: "live",
      });
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire("🎟 Membership on sale");
      setTimeout(() => router.push("/memberships"), 600);
    });
  };

  const unitWord = f.unit === "hours" ? "hours" : "classes";

  return (
    <FormPage title="Add membership" steps={STEPS} step={step} onBack={() => (step > 0 ? setStep(0) : router.back())}>
      {step === 0 ? (
        <>
          <div style={FORM_LABEL}>NAME</div>
          <input aria-label="Membership name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value.slice(0, 80) }))} placeholder="e.g. 10 classes" style={FORM_INPUT} />

          <div style={FORM_LABEL}>WHAT IT IS WORTH</div>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
            {([["classes", "Classes"], ["hours", "Hours"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setF((x) => ({ ...x, unit: k }))}
                aria-pressed={f.unit === k}
                style={{ flex: 1, padding: 10, borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.unit === k ? INK : EL, color: f.unit === k ? LILAC : SUB }}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            aria-label={f.unit === "hours" ? "How many hours" : "How many classes"}
            inputMode="decimal"
            value={f.units}
            onChange={(e) => setF((x) => ({ ...x, units: e.target.value }))}
            placeholder={f.unit === "hours" ? "How many hours" : "How many classes"}
            style={FORM_INPUT}
          />
        </>
      ) : (
        <>
          <div style={FORM_LABEL}>PRICE</div>
          <input aria-label="Price" inputMode="numeric" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} placeholder="₹ — 0 for a free one" style={FORM_INPUT} />

          <div style={FORM_LABEL}>HOW MANY MAY BE SOLD</div>
          <input aria-label="Total memberships" inputMode="numeric" value={f.total} onChange={(e) => setF((x) => ({ ...x, total: e.target.value }))} placeholder="e.g. 20" style={FORM_INPUT} />

          <FormNote blockers={blockers.length ? blockers : undefined}>
            {price > 0
              ? `Sold from ${sellerName}'s page through the same payment window a class seat uses. A pass keeps the price it was bought at, so changing this later never rewrites what somebody already holds.`
              : `Sold from ${sellerName}'s page. A free one is active the moment somebody takes it — there is no payment step to wait on.`}
          </FormNote>
        </>
      )}

      <FormBar>
        {step === 0 ? (
          <button type="button" aria-disabled={Boolean(stepOneErr)} onClick={() => (stepOneErr ? fire(stepOneErr) : setStep(1))} style={{ ...formPrimary(!stepOneErr), flex: 1 }}>
            {stepOneErr ?? "Continue"}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setStep(0)} style={formSecondary}>
              Back
            </button>
            <button type="button" aria-label="Put it on sale" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={formPrimary(ready)}>
              {ready ? "Put it on sale" : blockers[0]}
            </button>
          </>
        )}
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Put this on sale?"
          title="Put this on sale?"
          sub={`It appears on ${sellerName}'s public page straight away. You can take it off sale any time from the Memberships desk.`}
          confirmWord={pending ? "Saving…" : "Put it on sale"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary
            tint={DOS_TOOLS.memberships.c}
            head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>🎟 {units} {unitWord} · {total} on sale</span>}
          >
            <b style={{ fontSize: 15 }}>{f.name.trim()}</b>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: price === 0 ? "#22C55E" : INK }}>{price === 0 ? "FREE" : rupees(price)}</div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>Sold by {sellerName}</div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
