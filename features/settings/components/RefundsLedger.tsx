"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideRefundAction, settleRefundOfflineAction } from "@/features/payments/server-actions/refunds";
import type { RefundLedgerRow } from "@/repositories/refunds";
import { REFUND_WORD, type RefundStatus } from "@/types/refund";
import { BizPage, BizToast, bizCard, chip, dayWords, ghostBtn, rupees } from "./settings-kit";

/** S_refunds (16621-16690): the refunds ledger — the hero's "₹X refunded · ₹Y
 *  pending", the four counted tiles (Paid · Processing · Requested · Declined),
 *  the state chips, and a card per refund: who, what, the id · date · rail, the
 *  amount in its state's colour, the learner's reason, Approve / Decline on a
 *  request, Download receipt on a paid one. A business's ledger settles
 *  (Step 13b's RPCs decide who may); a person's ledger reads their own. */

const TONE: Record<RefundStatus, string> = { processed: "#22C55E", pending: "#F59E0B", requested: "#3B82F6", declined: "#F87171", failed: "#F87171" };
const WORD: Record<RefundStatus, string> = { ...REFUND_WORD, failed: "FAILED" };

export function RefundsLedger({ rows, side, canSettle = false, focusClassId = null }: { rows: RefundLedgerRow[]; side: "mine" | "tenant"; canSettle?: boolean; focusClassId?: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | RefundStatus>(focusClassId ? "requested" : "all");
  const [scope, setScope] = useState<"focus" | "all">(focusClassId ? "focus" : "all");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  const inScope = (r: RefundLedgerRow) => scope === "all" || !focusClassId || r.classId === focusClassId;
  const list = rows.filter((r) => (tab === "all" || r.status === tab) && inScope(r));
  const sum = (st: RefundStatus[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.amountInr, 0);
  const count = (st: RefundStatus) => rows.filter((r) => r.status === st).length;
  const focusTitle = focusClassId ? rows.find((r) => r.classId === focusClassId)?.classTitle ?? "this class" : null;
  const openInFocus = rows.filter((r) => r.status === "requested" && inScope(r));

  const decide = (id: string, decision: "approve" | "decline", said: string) =>
    start(async () => {
      const out = await decideRefundAction({ refundId: id, decision });
      if (out.error) return fire(out.error);
      fire(out.message ?? said);
      router.refresh();
    });
  const approveAll = () =>
    start(async () => {
      let n = 0;
      for (const r of openInFocus) {
        const out = await decideRefundAction({ refundId: r.id, decision: "approve" });
        if (!out.error) n += 1;
      }
      fire(`${n} refund${n === 1 ? "" : "s"} approved · ${rupees(openInFocus.reduce((a, r) => a + r.amountInr, 0))} processing`);
      router.refresh();
    });

  return (
    <BizPage title="Refunds" sub={focusTitle && scope === "focus" ? `Settling ${focusTitle}` : `${rupees(sum(["processed"]))} refunded · ${rupees(sum(["requested", "pending"]))} pending`} grad="linear-gradient(135deg,#F59E0B,#EF4444)">
      {focusTitle ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(
            [
              ["focus", focusTitle.length > 22 ? focusTitle.slice(0, 22) + "…" : focusTitle],
              ["all", "All refunds"],
            ] as Array<["focus" | "all", string]>
          ).map(([k, l]) => (
            <button type="button" key={k} aria-pressed={scope === k} onClick={() => setScope(k)} style={{ ...chip(scope === k), flex: k === "focus" ? 1.4 : 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis" }}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
      {canSettle && focusTitle && scope === "focus" && openInFocus.length > 0 ? (
        <button type="button" disabled={pending} onClick={approveAll} style={{ ...ghostBtn, background: "var(--text)", color: "var(--solid)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          Refund all {openInFocus.length} · {rupees(openInFocus.reduce((a, r) => a + r.amountInr, 0))}
        </button>
      ) : null}
      <div style={{ ...bizCard, display: "flex", gap: 8 }}>
        {(
          [
            [count("processed"), "Paid", "#22C55E"],
            [count("pending"), "Processing", "#F59E0B"],
            [count("requested"), "Requested", "#3B82F6"],
            [count("declined") + count("failed"), "Declined", "#F87171"],
          ] as Array<[number, string, string]>
        ).map(([v, l, c]) => (
          <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "9px 3px", borderTop: `3px solid ${c}` }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>{v}</div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 10 }}>
        {(
          [
            ["all", "All"],
            ["requested", "Requested"],
            ["pending", "Processing"],
            ["processed", "Paid"],
            ["declined", "Declined"],
          ] as Array<["all" | RefundStatus, string]>
        ).map(([k, l]) => (
          <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)} style={chip(tab === k)}>
            {l}
          </button>
        ))}
      </div>
      {list.map((r) => (
        <div key={r.id} style={{ ...bizCard, borderLeft: `4px solid ${TONE[r.status]}`, padding: "12px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{side === "mine" ? r.tenantName : r.learnerName}</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                {r.classShareSlug ? (
                  <Link href={`/c/${r.classShareSlug}`} style={{ color: "var(--sub)", textDecoration: "none" }}>
                    {r.classStyle} · {r.classTitle}
                  </Link>
                ) : (
                  `${r.classStyle} · ${r.classTitle}`
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                RF-{r.id.slice(0, 4).toUpperCase()} · {dayWords(r.createdAt)} · {r.settledOffline ? "cash at the desk" : r.hasRailReference ? "Cashfree" : "awaiting the rail"}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 900, color: TONE[r.status] }}>{rupees(r.amountInr)}</div>
              <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, color: TONE[r.status] }}>{WORD[r.status]}</div>
            </div>
          </div>
          {r.reason || r.decisionNote ? <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--el)" }}>{r.reason ?? r.decisionNote}</div> : null}
          {canSettle && r.status === "requested" ? (
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <button type="button" disabled={pending} onClick={() => decide(r.id, "approve", "Approved — processing")} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 800, padding: 9, borderRadius: 999, cursor: "pointer", background: "#22C55E22", color: "#22C55E", border: "none", fontFamily: "inherit" }}>
                Approve
              </button>
              <button type="button" disabled={pending} onClick={() => decide(r.id, "decline", "Declined")} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 800, padding: 9, borderRadius: 999, cursor: "pointer", background: "#F8717122", color: "#F87171", border: "none", fontFamily: "inherit" }}>
                Decline
              </button>
            </div>
          ) : null}
          {canSettle && r.status === "pending" && !r.hasRailReference ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const out = await settleRefundOfflineAction({ refundId: r.id });
                  if (out.error) return fire(out.error);
                  fire(out.message ?? "Marked refunded");
                  router.refresh();
                })
              }
              style={{ marginTop: 9, width: "100%", textAlign: "center", fontSize: 11, fontWeight: 800, padding: 9, borderRadius: 999, background: "var(--el)", color: "var(--text)", cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Mark refunded at the desk
            </button>
          ) : null}
          {r.status === "processed" && r.classShareSlug ? (
            <Link href={`/c/${r.classShareSlug}`} style={{ display: "block", marginTop: 9, textAlign: "center", fontSize: 11, fontWeight: 800, padding: 9, borderRadius: 999, background: "var(--el)", color: "var(--text)", textDecoration: "none" }}>
              Receipt on the class page ›
            </Link>
          ) : null}
        </div>
      ))}
      {list.length === 0 ? (
        <div style={{ ...bizCard, textAlign: "center", border: "1.5px dashed var(--el)", padding: "22px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 5 }}>{rows.length === 0 ? "No refunds yet" : "Nothing in that state"}</div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5 }}>{side === "mine" ? "Cancel a paid booking from its class page and the request lands here." : "A learner's cancellation inside the 48-hour window lands here for you to decide; outside it the rail refunds by itself."}</div>
        </div>
      ) : null}
      <BizToast msg={toast} />
    </BizPage>
  );
}
