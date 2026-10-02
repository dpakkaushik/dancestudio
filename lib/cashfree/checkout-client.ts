"use client";

/** The Cashfree JS SDK v3, loaded once — the browser half of every checkout in
 *  the app: a class seat's payment (since 28 Aug), and since 10 Sep 2026 the
 *  MANDATE a subscription is authorised on. Lifted out of PayFlow so the two
 *  share one loader rather than two copies of it.
 *
 *  What the window reports is never trusted for money: after it closes, the
 *  SERVER asks Cashfree what happened on our order or subscription. This module
 *  only opens the window and says whether it closed on a completion or a cancel. */

export interface CashfreeCheckoutResult {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}

interface CashfreeInstance {
  checkout: (options: { paymentSessionId: string; redirectTarget: "_modal" | "_self" | "_blank" }) => Promise<CashfreeCheckoutResult>;
  subscriptionsCheckout: (options: { subsSessionId: string; redirectTarget: "_modal" | "_self" | "_blank" }) => Promise<CashfreeCheckoutResult>;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

let loader: Promise<void> | null = null;

export const loadCheckoutJs = (): Promise<void> => {
  if (typeof window !== "undefined" && window.Cashfree) {
    return Promise.resolve();
  }
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("Could not load the payment window — check your connection"));
    };
    document.body.appendChild(script);
  });
  return loader;
};

/** START FETCHING THE SDK BEFORE THE PRESS (2 Oct 2026, the user: "the page
 *  loading is slow"). The script was only requested when somebody pressed Pay, so
 *  every first payment waited on a cold download of Cashfree's bundle before the
 *  window could even begin to open. A payment sheet calls this the moment it is
 *  drawn; a failure here is swallowed, because the press will try again and say
 *  so in words. */
export function preloadCheckout(): void {
  if (typeof window === "undefined") return;
  loadCheckoutJs().catch(() => {});
}

/** A one-off payment (a class seat). Resolves when the modal closes; `error`
 *  means it closed without a payment and nothing was charged. */
export async function openCashfreeCheckout(paymentSessionId: string, mode: "sandbox" | "production"): Promise<CashfreeCheckoutResult> {
  await loadCheckoutJs();
  if (!window.Cashfree) {
    throw new Error("Could not load the payment window");
  }
  return window.Cashfree({ mode }).checkout({ paymentSessionId, redirectTarget: "_modal" });
}

/** A subscription's mandate (UPI AutoPay / card). The authorisation also pays
 *  the first period. Same contract: `error` means nothing was set up. */
export async function openCashfreeSubscription(subsSessionId: string, mode: "sandbox" | "production"): Promise<CashfreeCheckoutResult> {
  await loadCheckoutJs();
  if (!window.Cashfree) {
    throw new Error("Could not load the payment window");
  }
  return window.Cashfree({ mode }).subscriptionsCheckout({ subsSessionId, redirectTarget: "_modal" });
}
