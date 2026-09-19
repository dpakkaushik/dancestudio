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
 *  because a membership is a thing somebody HOLDS. */

const row: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--el)" };

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
  if (memberships.length === 0) return null;

  const take = (m: MembershipOnSale) =>
    start(async () => {
      setNote(null);
      const out = await buyMembershipAction({ membershipId: m.id });
      if (out.error) return setNote(out.error);
      if (!out.needsPayment) {
        setNote("🎟 It is yours — find it under Memberships");
        router.refresh();
        return;
      }
      const res = await startMembershipCheckoutAction({ passId: out.passId as string, businessName, description: m.name });
      if (res.error || !res.checkout) return setNote(res.error ?? "Could not start the payment — it is waiting under Memberships");
      try {
        const result = await openCashfreeCheckout(res.checkout.paymentSessionId, res.checkout.mode);
        if (result.error) return setNote("The payment window closed — it is waiting under Memberships");
      } catch (openError: unknown) {
        return setNote(openError instanceof Error ? openError.message : "Could not open the payment window");
      }
      const done = await confirmCheckoutAction({ orderId: res.checkout.orderId });
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
            <button type="button" disabled={pending} aria-label={`Take ${m.name}`} onClick={() => take(m)} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: accent, background: "none", border: "none", cursor: pending ? "wait" : "pointer", fontFamily: "inherit" }}>
              {pending ? "…" : "Take it ›"}
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
    </div>
  );
}
