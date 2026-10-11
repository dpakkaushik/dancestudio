"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { buyMembershipAction } from "@/features/memberships/server-actions/memberships";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { confirmCheckoutAction, startMembershipCheckoutAction } from "@/features/payments/server-actions/payments";
import { openCashfreeCheckout, preloadCheckout } from "@/lib/cashfree/checkout-client";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import { inkOn } from "@/components/ui/ToolCard";
import { SeatBar } from "@/features/classes/components/ClassTile";
import { unitWord } from "@/features/memberships/components/usage-kit";
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

const row: CSSProperties = { padding: "11px 0 12px", borderBottom: "1.5px solid var(--el)" };
/* the row's one action, as a full pill (11 Oct 2026) */
const buyBox: CSSProperties = { flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 118, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 900, fontFamily: "inherit", textDecoration: "none", whiteSpace: "nowrap" };
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
        router.push("/memberships?show=booked");
        return;
      }
      const res = await startMembershipCheckoutAction({ passId: out.passId as string, businessName, description: m.name });
      if (res.error || !res.checkout) {
        setPaying(null);
        return setNote(res.error ?? "Could not start the payment — it is waiting under Memberships");
      }
      try {
        const result = await openCashfreeCheckout(res.checkout.paymentSessionId, res.checkout.mode);
        if (result.redirect) return; // leaving for /pay/return, which confirms it
      } catch (openError: unknown) {
        setPaying(null);
        return setNote(openError instanceof Error ? openError.message : "Could not open the payment window");
      }
      /* ASK, whatever the window said — a UPI payment finished in another app
         can land after the window gave up (2 Oct 2026) */
      const done = await confirmCheckoutAction({ orderId: res.checkout.orderId });
      setPaying(null);
      if (done.error) return setNote(done.error === "No payment was made" ? "The payment window closed — it is waiting, unpaid, under Memberships" : done.error);
      /* AND THEN TO THE PASS ITSELF (2 Oct 2026, the user: "should take to …
         membership detail page after payment is done") */
      router.push("/memberships?show=booked");
    });

  return (
    <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginTop: 10 }} data-testid="memberships-on-sale">
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: accent, marginBottom: 6 }}>MEMBERSHIPS</div>
      {memberships.map((m, i) => (
        <div key={m.id} data-testid="membership-on-sale" style={{ ...row, borderBottom: i === memberships.length - 1 ? "none" : row.borderBottom }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
          </div>
          {/* ⚠ WHAT IT IS, WRITTEN PROPERLY (12 Oct 2026, the user: "membership
              hours and validity should be written properly in studio profile
              pages") — two labelled boxes, the size and how long it lasts, where
              one grey fragment ("10 hours · 60 days") said both and named neither */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            {[
              { k: "size", label: m.unit === "hours" ? "Hours" : "Classes", value: unitWord(m.unit, m.units) },
              { k: "validity", label: "Valid for", value: m.validityDays ? `${m.validityDays} days from purchase` : "Until used up" },
            ].map((b) => (
              <div key={b.k} data-testid={`membership-${b.k}`} style={{ background: "var(--el)", borderRadius: 12, padding: "7px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: SUB, textTransform: "uppercase" }}>{b.label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{b.value}</div>
              </div>
            ))}
          </div>
          {/* ⚠ A BAR, LIKE A CLASS CARD'S (11 Oct 2026, the user: "Membership
              should also have a bar like class cards for spots left") — the
              class's own `SeatBar`, its numbers and colours, in a membership's
              words: "3/20 Sold · 17 Left", amber at the last three, red when
              all are taken */}
          <div style={{ display: "flex", marginTop: 8 }}>
            <SeatBar
              taken={Math.max(0, m.totalCount - m.leftCount)}
              cap={m.totalCount}
              tint={accent}
              height={24}
              testId="membership-left"
              barTestId="membership-bar"
              words={{ taken: "Sold", left: "Left", full: "All taken" }}
            />
          </div>
          {/* ⚠ THE PRICE AND THE BUTTON, WRITTEN ANOTHER WAY (11 Oct 2026, the user:
              "price and buy now button written in a different way"). The price
              was a word squeezed beside a small pill; it is the row's own foot
              now — the figure at the size of a figure on the left with what it
              buys under it, and the button on the right as a full pill. Still
              ONE price (28 Sep 2026: never on the button as well). */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span data-testid="membership-price" style={{ display: "block", fontFamily: DOS_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.05 }}>
                {m.priceInr === 0 ? "Free" : rupees(m.priceInr)}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>{m.priceInr === 0 ? "no payment" : "one payment"}</span>
            </span>
            {!signedIn ? (
            <a href="/login" aria-label={`Buy ${m.name}`} style={{ ...buyBox, color: accent, background: `${accent}1f`, border: `1.5px solid ${accent}` }}>
              Sign in to buy
            </a>
          ) : m.held ? (
            /* ⚠ YOURS ALREADY — NOT A SECOND BUY (2 Oct 2026). The database
               refuses a second live pass; the button no longer offers one, and
               points at the pass instead */
            <Link href="/memberships?show=booked" aria-label={`${m.name} — yours, open it`} style={{ ...buyBox, color: accent, background: `${accent}1f`, border: `1.5px solid ${accent}` }}>
              ✓ Active
            </Link>
          ) : canBuy && m.leftCount > 0 ? (
            /* A REAL BUTTON, AND IT OPENS THE PAYMENT STEP (19 Sep 2026) */
            <button
              type="button"
              disabled={pending}
              /* ⚠ the accessible name follows the visible one (27 Sep 2026) — a
                 button that reads "Buy now" and is announced "Take …" is the
                 22 Sep mismatch, where a screen reader heard a different verb
                 from the one on the screen */
              aria-label={`Buy ${m.name}`}
              onClick={() => { setNote(null); setPaying(m); if (m.priceInr > 0) preloadCheckout(); }}
              style={{ ...buyBox, color: inkOn(accent), background: accent, border: `1.5px solid ${accent}`, cursor: pending ? "wait" : "pointer", boxShadow: `0 3px 10px ${accent}44` }}
            >
              {/* ⚠ "BUY NOW", NOT "TAKE IT" (27 Sep 2026, the user's own word).
                  A free pass reads "Buy now" too: what the button does is the
                  same act, and two verbs for one act is what this file has had
                  to undo before — the price beside it already says it is free.
                  ⚠⚠ AND THE PRICE IS NOT ON IT (28 Sep 2026, the user: "membership
                  price and buy button together and should not be repeated on
                  it"). It read `Buy · ₹1,500` while the span DIRECTLY TO ITS LEFT
                  already read `₹1,500` — the same number twice, 6px apart, which
                  is the "86 students over a list of five" complaint in miniature:
                  a figure said twice invites the reader to check whether the two
                  agree. One price, and the button beside it names the act. The
                  accessible name follows suit and says WHAT is being bought,
                  which the visible word cannot. */}
              Buy now
            </button>
          ) : (
            /* ⚠ SAY WHY, NOT "—" (19 Sep 2026, found by the e2e). The only
               signed-in person who cannot take one is somebody on the seller's
               own team, and `why_no_membership` says exactly that — "a
               membership is for the people who come to dance". A dash made a
               real rule look like a broken button. */
            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textAlign: "right", maxWidth: 130, lineHeight: 1.35 }}>
              {m.leftCount === 0 ? "All taken" : "You are on this team"}
            </span>
            )}
          </div>
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
            <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "11px 13px", margin: "12px 0" }}>
              {[
                ["Worth", paying.unit === "hours" ? `${paying.units} hours` : `${paying.units} classes`],
                /* the validity is said where the money is asked for — it is part of what is bought */
                /* unlimited (4 Oct 2026): "active till full consumed", said in the same row */
                ["Valid for", paying.validityDays ? `${paying.validityDays} days from purchase` : "Until the hours are used up"],
                ["Paying with", paying.priceInr === 0 ? "—" : "UPI · Cards · Netbanking"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
                  <span style={{ color: SUB }}>{k}</span>
                  <b style={{ textAlign: "right" }}>{v}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1.5px solid var(--el)", marginTop: 6, paddingTop: 8 }}>
                <span style={{ fontSize: 12.5, color: SUB }}>Total</span>
                <b style={{ fontSize: 17, fontWeight: 900 }}>{paying.priceInr === 0 ? "Free" : rupees(paying.priceInr)}</b>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={pending} onClick={() => setPaying(null)} style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--card)", border: "1.5px solid var(--el)", color: INK, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={() => take(paying)} style={{ flex: 1.4, padding: 13, borderRadius: 999, background: accent, border: "none", color: "#fff", fontWeight: 900, fontSize: 13, cursor: pending ? "wait" : "pointer", fontFamily: "inherit" }}>
                {pending ? "Opening…" : paying.priceInr === 0 ? "Buy now" : `Pay ${rupees(paying.priceInr)}`}
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
