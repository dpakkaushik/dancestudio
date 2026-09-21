"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { dateWords } from "@/features/settings/components/settings-kit";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** WHAT A STUDIO'S SUBSCRIPTION IS DOING — the standing, the date, and the one
 *  control (15 Sep 2026).
 *
 *  ⚠ IT HAS MOVED TWICE, AND BOTH MOVES WERE THE SAME RISK (Rule 9: money). It
 *  began as a second card under the studio's row on the hub; the user collapsed
 *  the hub to ONE card per studio (15 Sep), and since the hub was the only door
 *  to cancelling — `/subscription` sent an organization straight back to it —
 *  it moved to the studio's own home rather than being lost. On 20 Sep the user
 *  asked for subscriptions to be off a studio's home "as already being handled
 *  from settings", and that premise was true of an artist's plan and not of a
 *  studio's, so it moved to `/subscription` — which Settings' Subscription tile
 *  opens — and the premise is true now. **There is exactly one Stop renewing in
 *  this app; it must always have a screen.**
 *
 *  Drawn for the OWNER only — a trainer neither pays nor cancels. */
export function StudioSubscriptionStrip({
  tenantId,
  tenantName,
  verified,
  state,
  studioPrice,
  heading,
}: {
  tenantId: string;
  tenantName: string;
  /** the badge — Subscribe is offered only once DanceOS has verified the studio */
  verified: boolean;
  state: StudioSubscriptionState;
  studioPrice: PlanCatalogRow | null;
  /** which studio this is, when several stack on one screen — on a page about
   *  ONE studio the eyebrow says SUBSCRIPTION and the page says whose */
  heading?: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const s = state.subscription;
  const live = Boolean(s?.hasAccess);
  const until = s?.currentPeriodEnd ? dateWords(s.currentPeriodEnd) : null;

  const standing = !s || !live
    ? { word: "NOT LIVE", tone: "#F59E0B", line: state.whyNotPublic ?? "Not on Discover yet." }
    : s.status === "past_due"
      ? { word: "PAYMENT PROBLEM", tone: "#EF4444", line: `The renewal did not go through — Cashfree is retrying; you keep Discover for three days past ${until}.` }
      : s.cancelAtPeriodEnd || s.status === "canceled"
        ? { word: "ENDING", tone: "#F59E0B", line: `Stays on Discover until ${until}, then stops. Nothing more will be charged.` }
        : s.granted
          ? { word: "GRANTED", tone: "#22C55E", line: `DanceOS set this up until ${until}. It does not renew on its own.` }
          : { word: "RENEWS", tone: "#22C55E", line: `Renews ${s.nextChargeOn ? dateWords(s.nextChargeOn) : until ?? ""} at ${priceWords(s.priceInr, s.period)} — you are told a day before each charge.` };

  const stop = () =>
    start(async () => {
      if (!s) return;
      const out = await cancelSubscriptionAction({ subscriptionId: s.id });
      if (out.error) return fire(out.error);
      setConfirm(false);
      fire(out.until ? `${tenantName} stays on Discover until ${dateWords(out.until)}, then stops` : "Cancelled");
      router.refresh();
    });

  return (
    <div data-testid="studio-subscription" style={{ background: CARD, border: `1.5px solid ${EL}`, borderRadius: 16, padding: "12px 13px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: heading ? 12.5 : 9.5, fontWeight: 900, letterSpacing: heading ? 0 : 0.9, color: heading ? INK : MUTED, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heading ?? "SUBSCRIPTION"}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 7px", borderRadius: 5, background: `${standing.tone}22`, color: standing.tone }}>
          {standing.word}
        </span>
      </div>
      <div style={{ fontSize: 11, color: SUB, marginTop: 6, lineHeight: 1.5 }}>{standing.line}</div>

      <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        {!live && studioPrice && verified ? (
          <SubscribeButton
            planKey={studioPrice.key}
            tenantId={tenantId}
            label={`Subscribe · ${priceWords(studioPrice.priceInr, studioPrice.period)}`}
            onDone={fire}
            style={{ background: "#3B82F6" }}
          />
        ) : null}
        {s && live && s.renews ? (
          confirm ? (
            <>
              <span style={{ fontSize: 10.5, color: SUB }}>Stop renewing? It stays on until {until}.</span>
              <button type="button" disabled={pending} onClick={stop} style={{ padding: "7px 12px", borderRadius: 999, border: "none", fontFamily: "inherit", fontSize: 11.5, fontWeight: 900, cursor: "pointer", background: "#EF4444", color: "#fff" }}>
                {pending ? "…" : "Yes, stop"}
              </button>
              <button type="button" onClick={() => setConfirm(false)} style={{ padding: "7px 12px", borderRadius: 999, fontFamily: "inherit", fontSize: 11.5, fontWeight: 900, cursor: "pointer", background: LILAC, border: `1.5px solid ${EL}`, color: INK }}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} aria-label={`Stop ${tenantName} renewing`} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, color: SUB, textDecoration: "underline", cursor: "pointer" }}>
              Stop renewing
            </button>
          )
        ) : null}
      </div>

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: 360, textAlign: "center" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
