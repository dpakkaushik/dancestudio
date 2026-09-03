"use client";

import { useState } from "react";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { cancelBookingAction } from "@/features/payments/server-actions/payments";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

/** Cancelling is two things, and only one of them is about money — lifted from
 *  prototype DanceOSApp.jsx:6269-6327. The seat goes back the instant you
 *  confirm; the money follows the policy window the page printed (48 h — the
 *  POLICY section's number, S_class 12400): in full outside it, the studio
 *  decides inside it. The four common reasons are shortcuts, not a cage. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const REASONS = ["Injury or illness", "Schedule clash", "Travelling", "Changed my mind"];

export interface RefundSheetProps {
  enrollmentId: string;
  title: string;
  timeText: string;
  amountInr: number;
  onClose: () => void;
  /** fired with the action's outcome copy (or its error) once the cancel lands */
  onDone: (message: string) => void;
}

export function RefundSheet({ enrollmentId, title, timeText, amountInr, onClose, onDone }: RefundSheetProps) {
  useCloseOnBack(onClose);
  const [own, setOwn] = useState(false);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const file = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await cancelBookingAction({ enrollmentId, reason });
    setBusy(false);
    if (out.error || !out.message) {
      setError(out.error ?? "Could not cancel");
      return;
    }
    onDone(out.message);
  };

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 610 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancel this booking?"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--solid)",
          borderRadius: "24px 24px 0 0",
          padding: "18px 16px 28px",
          width: "100%",
          maxWidth: 430,
          boxSizing: "border-box",
          color: "var(--text)",
          fontFamily: DOS_UI,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>Cancel this booking?</b>
        <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 12px", lineHeight: 1.5 }}>
          {title} · {timeText}
        </div>
        {/* what actually happens, in the order it happens — the seat first,
            because that is the part that is certain */}
        <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 14, padding: "11px 12px", marginBottom: 14 }}>
          {(
            [
              ["Your place", "goes back on sale straight away"],
              ["Your money", "in full more than 48 h ahead; inside 48 h the studio decides"],
            ] as Array<[string, string]>
          ).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, padding: "4px 0" }}>
              <span style={{ width: 78, flexShrink: 0, fontSize: 11, fontWeight: 900, letterSpacing: 0.3, color: "var(--muted)", textTransform: "uppercase" }}>
                {k}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.45 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: "var(--muted)", marginBottom: 7 }}>
          WHY ARE YOU CANCELLING?
        </div>
        {REASONS.map((r) => (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            key={r}
            aria-disabled={busy}
            onClick={() => void file(r)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "12px 13px",
              borderRadius: 14,
              marginBottom: 8,
              background: "var(--card)",
              border: "1px solid var(--el)",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12.5,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {r}
            <span style={{ marginLeft: "auto", fontFamily: DOS_MONO, fontSize: 11, color: "var(--sub)" }}>
              ₹{amountInr.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
        {!own ? (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            onClick={() => setOwn(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "12px 13px",
              borderRadius: 14,
              marginBottom: 8,
              background: "var(--card)",
              border: "1px dashed var(--el)",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12.5,
              color: "var(--sub)",
            }}
          >
            Something else — write it<span style={{ marginLeft: "auto", fontSize: 14 }}>›</span>
          </div>
        ) : (
          <div style={{ marginBottom: 8 }}>
            <textarea
              autoFocus
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={3}
              placeholder="Tell the studio what happened — they read this before deciding."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--card)",
                border: "1px solid var(--el)",
                borderRadius: 14,
                padding: "11px 12px",
                color: "var(--text)",
                fontSize: 12.5,
                fontWeight: 600,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{why.trim().length}/300</span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-disabled={!why.trim() || busy}
                onClick={() => {
                  if (!why.trim() || busy) return;
                  void file(why.trim().slice(0, 300));
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: 999,
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                  background: why.trim() ? "var(--text)" : "var(--el)",
                  color: why.trim() ? "var(--solid)" : "var(--muted)",
                }}
              >
                {busy ? "Sending…" : "Send request"}
              </span>
            </div>
          </div>
        )}
        {error && (
          <div style={{ fontSize: 10.5, color: "#EF4444", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>{error}</div>
        )}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={busy ? undefined : onClose}
          style={{
            marginTop: 4,
            textAlign: "center",
            padding: "12px",
            borderRadius: 999,
            background: "var(--card)",
            border: "1px solid var(--el)",
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Keep my spot
        </div>
      </div>
    </div>
  );
}
