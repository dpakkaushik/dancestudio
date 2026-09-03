"use client";

import { dosKey } from "@/features/classes/components/ShareSheet";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

/** Invoice — lifted from prototype DanceOSApp.jsx:6230-6255. The rows are real
 *  now: amount and method come off the captured payment. The prototype's
 *  "Download PDF" was a demo toast; printing a button that lies breaks the
 *  repo's honesty rule, so a real PDF arrives with the Step 13 money tooling
 *  (see UI parity backlog). */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* prototype dosHash (6388) — a stable reference number off the booking id */
const dosHash = (str: string): number => {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const bookingCodeOf = (enrollmentId: string): string =>
  `DOS-CL-${String((dosHash(enrollmentId) % 9000) + 1000)}`;

export interface InvoiceSheetProps {
  title: string;
  whenText: string;
  whereText: string;
  enrollmentId: string;
  amountInr: number | null; // null = free booking
  method: string | null;
  onClose: () => void;
}

export function InvoiceSheet({ title, whenText, whereText, enrollmentId, amountInr, method, onClose }: InvoiceSheetProps) {
  useCloseOnBack(onClose);
  const code = bookingCodeOf(enrollmentId);
  const num = `INV-2026-${String((dosHash(code) % 9000) + 1000)}`;
  const rows: Array<[string, string]> = [
    ["Item", title],
    ["Kind", "Class booking"],
    ["When", whenText || "—"],
    ["Where", whereText || "—"],
    ...(method ? ([["Paid by", method.toUpperCase()]] as Array<[string, string]>) : []),
    ["Reference", code],
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 600,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invoice"
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
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>Invoice</b>
        <div style={{ fontFamily: DOS_MONO, fontSize: 11.5, color: "var(--sub)", margin: "3px 0 14px" }}>{num}</div>
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "7px 0",
              borderBottom: "1px solid var(--el)",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "var(--sub)", flexShrink: 0 }}>{k}</span>
            <b style={{ textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</b>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>TOTAL PAID</span>
          <b style={{ fontSize: 20, fontFamily: DOS_MONO }}>
            {!amountInr ? "Free" : `₹${amountInr.toLocaleString("en-IN")}`}
          </b>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            onClick={onClose}
            style={{
              flex: 1,
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
            Close
          </div>
        </div>
      </div>
    </div>
  );
}
