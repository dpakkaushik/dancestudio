"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmSubscriptionAction, startSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { openCashfreeSubscription } from "@/lib/cashfree/checkout-client";

/** SUBSCRIBE (10 Sep 2026) — the one button that sets up a recurring plan: the
 *  Artist plan on the Subscription screen, and a studio's plan under its row on
 *  the hub. Three moves, one trust boundary: the server opens OUR subscription
 *  at the catalog's price (never a price from this screen) and asks Cashfree
 *  for a mandate session; the customer authorises UPI AutoPay or a card in
 *  Cashfree's window, which also pays the first period; when it closes the
 *  SERVER asks Cashfree what happened and applies it through the one function
 *  the webhook also calls. The browser's word for the outcome is never used. */
export function SubscribeButton({
  planKey,
  tenantId,
  label,
  onDone,
  style,
  disabled = false,
}: {
  planKey: string;
  /** the studio being subscribed; omitted for the payer's own Artist plan */
  tenantId?: string;
  /** what the button says, e.g. "Subscribe · ₹1,200/mo" */
  label: string;
  onDone?: (message: string) => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    const res = await startSubscriptionAction({ planKey, tenantId: tenantId ?? null });
    if (!res.checkout) {
      setBusy(false);
      setError(res.error ?? "Could not start the subscription");
      return;
    }
    let authorised = false;
    try {
      const result = await openCashfreeSubscription(res.checkout.subsSessionId, res.checkout.mode);
      authorised = !result.error;
      if (result.error) {
        setError(result.error.message ?? "The window closed before the mandate was set up — nothing was charged");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the payment window");
    }
    if (!authorised) {
      setBusy(false);
      return;
    }
    const out = await confirmSubscriptionAction({ subscriptionId: res.checkout.subscriptionId });
    setBusy(false);
    if (out.error || !out.outcome) {
      setError(out.error ?? "Could not confirm the subscription");
      return;
    }
    const said =
      out.outcome === "subscribed"
        ? "Subscribed — it renews on its own; cancel any time"
        : out.outcome === "pending"
          ? "Authorisation received — confirming with the bank…"
          : "The authorisation did not go through — nothing was charged";
    if (onDone) onDone(said);
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5, alignItems: "stretch", minWidth: 0 }}>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void go()}
        aria-label={label}
        style={{
          padding: "9px 15px",
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 900,
          border: "none",
          cursor: busy || disabled ? "default" : "pointer",
          fontFamily: "inherit",
          background: "var(--text)",
          color: "var(--solid)",
          opacity: busy || disabled ? 0.6 : 1,
          ...style,
        }}
      >
        {busy ? "One moment…" : label}
      </button>
      {error ? <span style={{ fontSize: 10.5, color: "#B42318", lineHeight: 1.4 }}>{error}</span> : null}
    </span>
  );
}
