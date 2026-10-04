"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
} from "@/components/ui/FormPage";
import { saveMembershipAction } from "@/features/memberships/server-actions/memberships";
import { UNLIMITED_WORD, VALIDITY_CHOICES, type ValidityDays } from "@/repositories/memberships";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { INK, SUB } from "@/lib/design/tokens";

/** NEW MEMBERSHIP — a page now, wearing the ADD CLASS anatomy (21 Sep 2026, the
 *  user: *"same should be for new routine and new membership"*).
 *
 *  ⚠ STILL EXACTLY FOUR THINGS (19 Sep 2026, the user: "Memberships can be
 *  created by just 4 things: Name, No. of hrs / No. of classes and price and
 *  total memberships count"). Moving the form to a page is not licence to grow
 *  it — the step split is what the class form does with the fields it already
 *  has, and this one splits the same four: what the pass IS, then what it costs
 *  and how many exist. No expiry, no tiers, nothing the user did not ask for. */

/* ⚠ ONE PAGE, NO STEPS (22 Sep 2026, the user: "apart from class and event form
   all forms should be for one page"). Four fields — the user's own four — do not
   need a step bar telling somebody there is more to come. */

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function MembershipForm({
  sellerId,
  sellerName,
  backTo = "/memberships",
  sheet = false,
}: {
  sellerId: string;
  sellerName: string;
  /** open over the desk that offered it rather than as a page (22 Sep 2026) */
  sheet?: boolean;
  /** ⚠ the desk that sent you (21 Sep 2026): a studio's own, or a person's.
   *  It pushed `/memberships` whatever opened it, so a studio owner saving a
   *  membership landed on a page that no longer lists it. */
  backTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /* ⚠⚠ HOURS ONLY (3 Oct 2026, the user: "membership only according to hours not
     classes"). A membership is sold as a number of HOURS and every seat spends
     the length of its class off it, so a 90-minute class and a 60-minute one cost
     what they are worth. The Classes / Hours switch is gone; `unit` is always
     "hours". ⚠ Passes already sold in classes keep working exactly as bought —
     a pass snapshots its unit (`membership_passes.unit`) and nothing rewrites it. */
  const [f, setF] = useState({ name: "", unit: "hours" as const, units: "10", price: "", total: "20", validity: 30 as ValidityDays | null });

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const units = Number(f.units);
  const price = Number(f.price);
  const total = Number(f.total);

  /* ⚠ ONE LIST, BECAUSE THERE IS ONE PAGE (22 Sep 2026) — the first two used to
     be the first step's own gate, and the bar names whichever is missing in the
     order the fields are asked */
  const blockers: string[] = [];
  if (!f.name.trim()) blockers.push("Name the membership first");
  if (!Number.isFinite(units) || units <= 0) blockers.push("Say how many hours it is worth");
  else if (Math.round(units * 2) !== units * 2) blockers.push("Hours go in halves — 1, 1.5, 2…");
  if (!Number.isFinite(price) || price < 0) blockers.push("Put a price on it — ₹0 is allowed");
  if (!Number.isFinite(total) || total < 1) blockers.push("Set the quantity");
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
        validityDays: f.validity,
      });
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire("🎟 Membership on sale");
      /* a sheet spends the `?new=1` entry that opened it and refreshes the desk
       underneath; a page goes to the desk that sent it (22 Sep 2026) */
    setTimeout(() => {
      if (sheet) {
        router.back();
        router.refresh();
        return;
      }
      router.push(backTo);
    }, 600);
    });
  };

  const unitWord = units === 1 ? "hour" : "hours";

  return (
    <FormPage title="Add Membership" sheet={sheet} onClose={() => router.back()} onBack={() => router.back()}>
      <>
          <div style={FORM_LABEL}>NAME</div>
          <input aria-label="Membership name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value.slice(0, 80) }))} placeholder="e.g. 10 hours" style={FORM_INPUT} />

          <div style={FORM_LABEL}>HOURS</div>
          <input aria-label="How many hours" inputMode="decimal" value={f.units} onChange={(e) => setF((x) => ({ ...x, units: e.target.value }))} placeholder="How many hours" style={FORM_INPUT} />

          {/* ⚠ VALID FOR (3 Oct 2026, the user: "membership should have a validity
              date in no. of days to use it from 30days, 60 days, 90 days") —
              counted from the day it is bought; hours left after it lapse.
              ⚠ 120 · 150 · UNLIMITED (4 Oct 2026, the user: "in unlimited
              subscription active till full consumed") — Unlimited sends no
              validity, so the pass never expires and lasts until its hours are
              used. Six choices, three to a row. */}
          <div style={FORM_LABEL}>VALID FOR</div>
          <div role="group" aria-label="Valid for" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7, marginBottom: 10 }}>
            {[...VALIDITY_CHOICES, null].map((d) => (
              <button
                key={d ?? "unlimited"}
                type="button"
                onClick={() => setF((x) => ({ ...x, validity: d }))}
                aria-pressed={f.validity === d}
                style={{ padding: "10px 4px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.validity === d ? INK : "var(--el)", color: f.validity === d ? "var(--solid)" : SUB }}
              >
                {d == null ? UNLIMITED_WORD : `${d} days`}
              </button>
            ))}
          </div>

          <div style={FORM_LABEL}>PRICE</div>
          <input aria-label="Price" inputMode="numeric" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} placeholder="₹ — 0 for a free one" style={FORM_INPUT} />

          {/* QUANTITY (4 Oct 2026, the user: "how many may be sold to be renamed to
              Quantity") — how many of these passes may be sold. ⚠ Nothing under it:
              the checklist box that stood here is gone ("remove lower section
              below how many may be sold"); the bar's button names what is missing. */}
          <div style={FORM_LABEL}>QUANTITY</div>
          <input aria-label="Quantity" inputMode="numeric" value={f.total} onChange={(e) => setF((x) => ({ ...x, total: e.target.value }))} placeholder="e.g. 20" style={FORM_INPUT} />
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? "Put it on sale" : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Put this on sale?"
          title="Put this on sale?"
          confirmWord={pending ? "Saving…" : "Put it on sale"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary
            tint={DOS_TOOLS.memberships.c}
            head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>🎟 {units} {unitWord} · {f.validity == null ? "until used up" : `valid ${f.validity} days`} · {total} on sale</span>}
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
