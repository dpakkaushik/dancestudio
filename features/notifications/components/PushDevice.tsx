"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/features/notifications/server-actions/push";
import { INK, SUB } from "@/lib/design/tokens";

/** PUSH ON THIS PHONE (3 Oct 2026, the user: "phone push notifications").
 *
 *  The account's Push switch says whether DanceOS may push to you at all; THIS
 *  is the device — a phone has to be asked, by its own browser, once. So the
 *  row says what is true of the phone in your hand, in words: on, off, blocked
 *  in the browser's settings, or a browser that cannot take pushes at all.
 *  ⚠ The permission prompt only appears from a PRESS — browsers refuse one that
 *  arrives on its own — which is why this is a button and not a side effect. */

type State = "checking" | "unsupported" | "denied" | "off" | "on";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && KEY.length > 0;

const keyBytes = (k: string): Uint8Array => {
  const pad = "=".repeat((4 - (k.length % 4)) % 4);
  const raw = atob((k + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

async function readState(): Promise<State> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "on" : "off";
}

export function PushDevice() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    readState().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource }));
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const out = await savePushSubscriptionAction({ endpoint: j.endpoint ?? "", p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", userAgent: navigator.userAgent.slice(0, 400) });
      if (out.error) {
        await sub.unsubscribe().catch(() => undefined);
        setError(out.error);
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setError("This phone would not take pushes just now — try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscriptionAction({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Could not turn it off just now — try again.");
    } finally {
      setBusy(false);
    }
  };

  const words: Record<State, string> = {
    checking: "Checking this phone…",
    unsupported: "This browser cannot take pushes. On iPhone, add DanceOS to the Home Screen first.",
    denied: "Blocked in this browser's settings — allow notifications for DanceOS there, then come back.",
    off: "Not on for this phone yet.",
    on: "On for this phone.",
  };

  return (
    <div data-testid="push-device" data-state={state} style={{ padding: "11px 0", borderBottom: "1.5px solid var(--el)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Push to this phone</div>
          <div style={{ fontSize: 10.5, color: SUB, marginTop: 2 }}>{words[state]}</div>
        </div>
        {state === "off" || state === "on" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void (state === "on" ? turnOff() : turnOn())}
            style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 999, border: "1.5px solid var(--el)", background: state === "on" ? "transparent" : INK, color: state === "on" ? INK : "var(--solid)", fontSize: 11.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
          >
            {busy ? "…" : state === "on" ? "Turn off" : "Turn on"}
          </button>
        ) : null}
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 10.5, color: "#F87171", marginTop: 6 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
