"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PosterBlock } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  enrollAction,
  type EnrollActionState,
} from "@/features/enrollments/server-actions/enrollments";
import {
  confirmCheckoutAction,
  startCheckoutAction,
} from "@/features/payments/server-actions/payments";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";

/** HOW YOU ARE PAYING — the two-step booking flow lifted from prototype S_class
 *  (DanceOSApp.jsx:12456-12573): choose how you're paying, then see exactly what
 *  is being charged and agree to it. The prototype's saved methods (DOSDB.methods)
 *  are Razorpay Checkout here — one method row until passes arrive; a free class
 *  skips straight to the confirm sheet ({how:"free"}, 12439). Sheets wear the
 *  repo's corrected role="dialog" pattern, not the prototype's aria-hidden one. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      order_id: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      prefill: { name?: string; email?: string };
      theme: { color: string };
      handler: (response: RazorpayCheckoutResponse) => void;
      modal: { ondismiss: () => void };
    }) => RazorpayInstance;
  }
}

let checkoutLoader: Promise<void> | null = null;
const loadCheckoutJs = (): Promise<void> => {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve();
  }
  checkoutLoader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutLoader = null;
      reject(new Error("Could not load the payment window — check your connection"));
    };
    document.body.appendChild(script);
  });
  return checkoutLoader;
};

const sheetBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 610,
};

const sheetBody: React.CSSProperties = {
  background: "var(--solid)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 16px 30px",
  width: "100%",
  maxWidth: 430,
  boxSizing: "border-box",
  color: "var(--text)",
  fontFamily: DOS_UI,
};

const grabber = (
  <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
);

export interface PayFlowProps {
  sessionId: string;
  isFree: boolean;
  priceInr: number;
  /** poster kit inputs — the same poster the card showed you (12464) */
  posterItem: { title: string; style: string; styleColor: string };
  posterK: string;
  col: string;
  /** "style · time" and "room, city" lines under the sheet titles */
  metaTop: string;
  metaBottom: string;
  businessName: string;
  classLabel: string;
  onClose: () => void;
  /** booked/waitlisted/refund outcome — parent fires the toast */
  onDone: (message: string) => void;
}

const initialEnrollState: EnrollActionState = { error: null, outcome: null };

export function PayFlow({
  sessionId,
  isFree,
  priceInr,
  posterItem,
  posterK,
  col,
  metaTop,
  metaBottom,
  businessName,
  classLabel,
  onClose,
  onDone,
}: PayFlowProps) {
  // free classes skip the how-are-you-paying step (prototype 12439)
  const [step, setStep] = useState<"how" | "confirm">(isFree ? "confirm" : "how");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const priceText = `₹${priceInr.toLocaleString("en-IN")}`;

  const confirmFree = async () => {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("sessionId", sessionId);
    const out = await enrollAction(initialEnrollState, formData);
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    onDone(
      out.outcome === "waitlisted"
        ? "📋 On the waitlist — you get the next freed spot."
        : "🎉 Booked — your free trial is confirmed"
    );
    router.refresh();
  };

  const confirmPaid = async (response: RazorpayCheckoutResponse) => {
    const out = await confirmCheckoutAction({
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
    });
    setBusy(false);
    if (out.error || !out.outcome) {
      setError(out.error ?? "Could not confirm the payment");
      return;
    }
    onDone(
      out.outcome === "booked"
        ? "🎉 Paid — booking confirmed"
        : out.outcome === "processing"
          ? "Payment received — confirming your seat…"
          : "The class filled up — your money is on its way back"
    );
    router.refresh();
  };

  const startPaid = async () => {
    setBusy(true);
    setError(null);
    const res = await startCheckoutAction({ sessionId, businessName, description: classLabel });
    if (!res.checkout) {
      setBusy(false);
      setError(res.error ?? "Could not start the payment");
      return;
    }
    try {
      await loadCheckoutJs();
    } catch (loadError: unknown) {
      setBusy(false);
      setError(loadError instanceof Error ? loadError.message : "Could not load the payment window");
      return;
    }
    if (!window.Razorpay) {
      setBusy(false);
      setError("Could not load the payment window");
      return;
    }
    const checkout = res.checkout;
    const razorpay = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.businessName,
      description: checkout.description,
      prefill: {
        name: checkout.prefillName ?? undefined,
        email: checkout.prefillEmail ?? undefined,
      },
      theme: { color: col },
      handler: (response) => {
        void confirmPaid(response);
      },
      modal: {
        ondismiss: () => setBusy(false),
      },
    });
    razorpay.open();
  };

  const header = (title: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
      <PosterBlock item={posterItem} design={posterK} size={54} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>{title}</b>
        <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>
          {metaTop}
          <br />
          {metaBottom}
        </div>
      </div>
    </div>
  );

  if (step === "how") {
    return (
      <div onClick={onClose} style={sheetBackdrop}>
        <div role="dialog" aria-modal="true" aria-label="How are you paying?" onClick={(e) => e.stopPropagation()} style={sheetBody}>
          {grabber}
          {header("How are you paying?")}
          {/* the one method on the account until passes arrive — Razorpay Checkout */}
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-label="Pay by UPI, card or netbanking"
            onClick={() => setStep("confirm")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "12px 13px",
              borderRadius: 16,
              marginBottom: 8,
              cursor: "pointer",
              background: "var(--card)",
              border: "1.5px solid var(--el)",
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                flexShrink: 0,
                background: "var(--el)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
              }}
            >
              💳
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                UPI · Cards · Netbanking
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 8,
                    fontWeight: 900,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,.16)",
                    color: "#22C55E",
                  }}
                >
                  DEFAULT
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>Secure checkout via Razorpay</div>
            </div>
            <span style={{ flexShrink: 0, color: "var(--muted)", fontSize: 16 }}>›</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            onClick={onClose}
            style={{
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              marginTop: 6,
              background: "var(--card)",
              border: "1px solid var(--el)",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Cancel
          </div>
        </div>
      </div>
    );
  }

  // ── the confirm sheet: what is actually being charged, itemised (12512-12573) ──
  return (
    <div onClick={busy ? undefined : onClose} style={sheetBackdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isFree ? "Confirm — no payment" : "Confirm payment"}
        onClick={(e) => e.stopPropagation()}
        style={sheetBody}
      >
        {grabber}
        {header(isFree ? "Confirm — no payment" : "Confirm payment")}
        <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "11px 13px", marginBottom: 12 }}>
          {[
            ["Session", isFree ? "Free" : priceText],
            ["Paying with", isFree ? "—" : "UPI · Cards · Netbanking"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--sub)" }}>{k}</span>
              <b style={{ textAlign: "right" }}>{v}</b>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderTop: "1px solid var(--el)",
              marginTop: 6,
              paddingTop: 8,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>TO PAY NOW</span>
            <b style={{ fontSize: 19, fontFamily: DOS_MONO }}>{isFree ? "₹0" : priceText}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            onClick={() => {
              if (busy) return;
              if (isFree) onClose();
              else setStep("how");
            }}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: "var(--card)",
              border: "1px solid var(--el)",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              opacity: busy ? 0.5 : 1,
            }}
          >
            Back
          </div>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-disabled={busy}
            onClick={() => {
              if (busy) return;
              if (isFree) void confirmFree();
              else void startPaid();
            }}
            style={{
              flex: 1.3,
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: "var(--text)",
              color: "var(--solid)",
              fontWeight: 900,
              fontSize: 13.5,
              cursor: "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "One moment…" : isFree ? "Confirm free trial" : `Pay ${priceText}`}
          </div>
        </div>
        {error && (
          <div style={{ fontSize: 10.5, color: "#EF4444", fontWeight: 700, marginTop: 10, textAlign: "center" }}>{error}</div>
        )}
      </div>
    </div>
  );
}
