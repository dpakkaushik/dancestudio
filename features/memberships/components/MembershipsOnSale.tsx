"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { buyMembershipAction } from "@/features/memberships/server-actions/memberships";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { confirmCheckoutAction, startMembershipCheckoutAction } from "@/features/payments/server-actions/payments";
import { openCashfreeCheckout } from "@/lib/cashfree/checkout-client";
import { INK, SUB } from "@/lib/design/tokens";
import type { MembershipOnSale } from "@/repositories/memberships";

/** MEMBERSHIPS ON A PUBLIC PAGE (19 Sep 2026, the user: "Users should be able
 *  to buy from Studio and Artist Profile Pages").
 *
 *  A row per membership: what it is worth, what it costs, how many are left, and
 *  one button. A free one is granted on the press; a priced one opens the same
 *  Cashfree window a class seat does and is confirmed by OUR server reading OUR
 *  order — never by the browser's word. A stranger's press leads to sign-in,
 *  because a membership is a thing somebody HOLDS.
 *
 *  ⚠ THE BUTTON IS A BUTTON, AND IT ASKS BEFORE IT CHARGES (19 Sep 2026, the
 *  user: "Membership on profiles to have a better pay button and should take to
 *  payment option"). "Take it ›" was a text link that jumped straight into the
 *  Cashfree window with nothing said about the money. It is a filled pill now —
 *  Buy · ₹X — over the class page's own payment step (`PayFlow`, S_class
 *  12456-12573): what it is, what it is worth, what it costs, and what it is
 *  being paid with, then one Pay button. A free one says "no payment" in the
 *  same sheet rather than pretending there is a step. */

const row: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--el)" };
const sheetBackdrop: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 700 };
const sheetBody: CSSProperties = { background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "16px 16px 30px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" };

export function MembershipsOnSale({
  memberships,
  businessName,
  accent,
  signedIn,
  canBuy,
}: {
  memberships: MembershipOnSale[];
  businessName: string;
  accent: string;
  signedIn: boolean;
  /** false for the seller's own team — the database refuses them anyway */
  canBuy: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  /* the payment step — the membership being bought, or nothing open */
  const [paying, setPaying] = useState<MembershipOnSale | null>(null);
  if (memberships.length === 0) return null;

  const take = (m: MembershipOnSale) =>
    start(async () => {
      setNote(null);
      const out = await buyMembershipAction({ membershipId: m.id });
      if (out.error) {
        setPaying(null);
        return setNote(out.error);
      }
      if (!out.needsPayment) {
        setPaying(null);
        setNote("🎟 It is yours — find it under Memberships");
        router.refresh();
        return;
      }
      const res = await startMembershipCheckoutAction({ passId: out.passId as string, businessName, description: m.name });
      if (res.error || !res.checkout) {
        setPaying(null);
        return setNote(res.error ?? "Could not start the payment — it is waiting under Memberships");
      }
      try {
        const result = await openCashfreeCheckout(res.checkout.paymentSessionId, res.checkout.mode);
        if (result.error) {
          setPaying(null);
          return setNote("The payment window closed — it is waiting under Memberships");
        }
      } catch (openError: unknown) {
        setPaying(null);
        return setNote(openError instanceof Error ? openError.message : "Could not open the payment window");
      }
      const done = await confirmCheckoutAction({ orderId: res.checkout.orderId });
      setPaying(null);
      if (done.error) return setNote(done.error);
      setNote("🎟 It is yours — find it under Memberships");
      router.refresh();
    });

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginTop: 10 }} data-testid="memberships-on-sale">
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: accent, marginBottom: 6 }}>MEMBERSHIPS</div>
      {memberships.map((m) => (
        <div key={m.id} style={row}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
            <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
              {m.unit === "hours" ? `${m.units} hours` : `${m.units} classes`} · {m.leftCount > 0 ? `${m.leftCount} left` : "all taken"}
            </span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 900 }}>{m.priceInr === 0 ? "Free" : rupees(m.priceInr)}</span>
          {!signedIn ? (
            <a href="/login" aria-label={`Take ${m.name}`} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: accent, textDecoration: "none" }}>
              Take it ›
            </a>
          ) : canBuy && m.leftCount > 0 ? (
            /* A REAL BUTTON, AND IT OPENS THE PAYMENT STEP (19 Sep 2026) */
            <button
              type="button"
              disabled={pending}
              aria-label={m.priceInr === 0 ? `Take ${m.name}` : `Buy ${m.name} for ${rupees(m.priceInr)}`}
              onClick={() => { setNote(null); setPaying(m); }}
              style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: "#fff", background: accent, border: "none", borderRadius: 999, padding: "8px 14px", cursor: pending ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap", boxShadow: `0 3px 10px ${accent}44` }}
            >
              {m.priceInr === 0 ? "Take it" : `Buy · ${rupees(m.priceInr)}`}
            </button>
          ) : (
            /* ⚠ SAY WHY, NOT "—" (19 Sep 2026, found by the e2e). The only
               signed-in person who cannot take one is somebody on the seller's
               own team, and `why_no_membership` says exactly that — "a
               membership is for the people who come to dance". A dash made a
               real rule look like a broken button. */
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--muted)", textAlign: "right", maxWidth: 96, lineHeight: 1.35 }}>
              {m.leftCount === 0 ? "All taken" : "You are on this team"}
            </span>
          )}
        </div>
      ))}
      {note ? (
        <div role="status" style={{ fontSize: 10.5, color: INK, marginTop: 8, lineHeight: 1.45 }}>
          {note}
        </div>
      ) : null}

      {/* ── THE PAYMENT STEP (S_class 12456-12573, the class page's own) ── */}
      {paying ? (
        <div onClick={pending ? undefined : () => setPaying(null)} style={sheetBackdrop}>
          <div role="dialog" aria-modal="true" aria-label={paying.priceInr === 0 ? "Confirm — no payment" : "Confirm payment"} onClick={(e) => e.stopPropagation()} style={sheetBody}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 16.5, fontWeight: 900 }}>{paying.priceInr === 0 ? "Confirm — no payment" : "Confirm payment"}</b>
            <div style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>
              {paying.name} · {businessName}
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "11px 13px", margin: "12px 0" }}>
              {[
                ["Worth", paying.unit === "hours" ? `${paying.units} hours` : `${paying.units} classes`],
                ["Paying with", paying.priceInr === 0 ? "—" : "UPI · Cards · Netbanking"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
                  <span style={{ color: SUB }}>{k}</span>
                  <b style={{ textAlign: "right" }}>{v}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--el)", marginTop: 6, paddingTop: 8 }}>
                <span style={{ fontSize: 12.5, color: SUB }}>Total</span>
                <b style={{ fontSize: 17, fontWeight: 900 }}>{paying.priceInr === 0 ? "Free" : rupees(paying.priceInr)}</b>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={pending} onClick={() => setPaying(null)} style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", color: INK, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={() => take(paying)} style={{ flex: 1.4, padding: 13, borderRadius: 999, background: accent, border: "none", color: "#fff", fontWeight: 900, fontSize: 13, cursor: pending ? "wait" : "pointer", fontFamily: "inherit" }}>
                {pending ? "Opening…" : paying.priceInr === 0 ? "Take it" : `Pay ${rupees(paying.priceInr)}`}
              </button>
            </div>
            {/* the rule that decides the money, said where the money is asked for */}
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>
              {paying.priceInr === 0
                ? "Nothing is charged. It appears under Memberships straight away."
                : "Paid through Cashfree. Your pass is only made once the payment lands — until then it waits, unpaid, under Memberships."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
