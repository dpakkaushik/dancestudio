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
  const [f, setF] = useState({ name: "", unit: "classes" as "classes" | "hours", units: "10", price: "", total: "20" });

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
  if (!Number.isFinite(units) || units <= 0) blockers.push(`Say how many ${f.unit} it is worth`);
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

  const unitWord = f.unit === "hours" ? "hours" : "classes";

  return (
    <FormPage title="Add membership" sheet={sheet} onClose={() => router.back()} onBack={() => router.back()}>
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

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? "Put it on sale" : blockers[0]}
        </button>
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
