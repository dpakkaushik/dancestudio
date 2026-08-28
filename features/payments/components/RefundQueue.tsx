"use client";

import { useState } from "react";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  decideRefundAction,
  settleRefundOfflineAction,
} from "@/features/payments/server-actions/refunds";
import { GREEN, GOLD, RED, SUB } from "@/lib/design/tokens";
import { REFUND_TONE, REFUND_WORD, type RefundRequest } from "@/types/refund";

/** The class's refund queue, lifted from the prototype's REQUESTS section
 *  (DanceOSApp.jsx:12219-12262): the three tiles, the bulk approve when more
 *  than one is waiting, and one row per request that is settled right there —
 *  "Only this class. Settle each request here — nothing leaves this page."
 *
 *  Step 9 filed these rows and nothing could answer them. This is the answer. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const toneColour = (r: RefundRequest) => {
  const tone = REFUND_TONE[r.status];
  return tone === "done" ? GREEN : tone === "moving" ? GOLD : tone === "bad" ? "#F87171" : SUB;
};

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function RefundQueue({
  refunds,
  paidSeats,
}: {
  refunds: RefundRequest[];
  /** The prototype's third tile — seats actually paid for on this class. */
  paidSeats: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const run = async (op: () => Promise<{ message: string | null; error: string | null }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) setError(out.error);
    else if (out.message) fire(out.message);
  };

  const open = refunds.filter((r) => r.status === "requested");
  const owed = open.reduce((a, r) => a + r.amountInr, 0);

  const pill = (label: string, colour: string, onClick: () => void) => (
    <span
      role="button"
      tabIndex={0}
      onKeyDown={dosKey}
      key={label}
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "center",
        padding: "7px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        cursor: busy ? "wait" : "pointer",
        background: `${colour}1a`,
        color: colour,
        border: `1px solid ${colour}55`,
      }}
    >
      {label}
    </span>
  );

  return (
    <>
      <div style={{ fontSize: 11.5, color: SUB, marginBottom: 9 }}>
        Only this class. Settle each request here — nothing leaves this page.
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        {(
          [
            [String(open.length), "TO SETTLE"],
            [money(owed), "OWED"],
            [String(paidSeats), "PAID SEATS"],
          ] as Array<[string, string]>
        ).map(([v, l]) => (
          <div key={l} style={{ flex: 1, background: "var(--el)", borderRadius: 12, padding: "9px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_MONO }}>{v}</div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 0.5,
                color: "var(--muted)",
                marginTop: 2,
              }}
            >
              {l}
            </div>
          </div>
        ))}
      </div>

      {open.length > 1 && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError(null);
            let failed: string | null = null;
            for (const r of open) {
              const out = await decideRefundAction({ refundId: r.id, decision: "approve" });
              if (out.error) failed = out.error;
            }
            setBusy(false);
            if (failed) setError(failed);
            else fire(`↩️ ${open.length} refunds approved · ${money(owed)}`);
          }}
          style={{
            marginTop: 10,
            textAlign: "center",
            padding: "11px",
            borderRadius: 999,
            background: "#EF4444",
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Refund all {open.length} · {money(owed)}
        </div>
      )}

      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: 0.9,
          color: "var(--muted)",
          margin: "16px 0 6px",
        }}
      >
        REQUESTS
      </div>

      {refunds.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB }}>Nothing to refund for this class right now.</div>
      ) : (
        refunds.map((r) => (
          <div key={r.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--el)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.learnerName}
                </div>
                <div style={{ fontSize: 10, color: SUB, marginTop: 1 }}>
                  {r.reason ?? "No reason given"}
                  {r.settledOffline ? " · settled by hand" : ""}
                </div>
              </div>
              <b style={{ fontSize: 12, fontFamily: DOS_MONO, flexShrink: 0 }}>{money(r.amountInr)}</b>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  padding: "3px 8px",
                  borderRadius: 999,
                  flexShrink: 0,
                  background: "var(--el)",
                  color: toneColour(r),
                }}
              >
                {REFUND_WORD[r.status]}
              </span>
            </div>

            {/* settle it right here — approve, decline, or mark the money out */}
            <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
              {r.status === "requested" && (
                <>
                  {pill("Approve", GREEN, () =>
                    run(() => decideRefundAction({ refundId: r.id, decision: "approve" }))
                  )}
                  {pill("Decline", "#F87171", () =>
                    run(() => decideRefundAction({ refundId: r.id, decision: "decline" }))
                  )}
                </>
              )}
              {r.status === "pending" &&
                !r.hasRailReference &&
                pill("Mark refunded", GOLD, () => run(() => settleRefundOfflineAction({ refundId: r.id })))}
              {r.status === "pending" && r.hasRailReference && (
                <span style={{ fontSize: 10.5, color: SUB }}>
                  With Cashfree — its refund event closes this one.
                </span>
              )}
              {r.status === "declined" &&
                pill("Reopen", SUB, () => run(() => decideRefundAction({ refundId: r.id, decision: "reopen" })))}
            </div>
          </div>
        ))
      )}

      {error ? <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>{error}</div> : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--el)",
            border: `1.5px solid ${GREEN}`,
            color: "var(--text)",
            padding: "11px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            maxWidth: 390,
            textAlign: "center",
            zIndex: 800,
          }}
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
