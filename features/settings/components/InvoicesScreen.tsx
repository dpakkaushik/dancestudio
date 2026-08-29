"use client";

import Link from "next/link";
import { useState } from "react";
import type { InvoiceRow } from "@/repositories/invoices";
import { BizPage, bizCard, chip, dayWords, ghostBtn, rupees } from "./settings-kit";

/** S_invoices (16691-16720): the ledger — a filter row, a card per invoice with
 *  who · what · number · date on the left and the amount with its state on the
 *  right, and Export ledger. Every row is a payment Step 9 recorded: PAID when it
 *  was captured, REFUNDED when it went back. The prototype's SENT and OVERDUE
 *  are states of an invoice raised before payment — nothing here is raised
 *  unpaid (a seat is paid at booking), so those two filters are honest zeros. */

const TONE: Record<string, string> = { paid: "#22C55E", refunded: "#F59E0B" };

export function InvoicesScreen({ rows, side }: { rows: InvoiceRow[]; side: "mine" | "tenant" }) {
  const [f, setF] = useState<"all" | "paid" | "refunded">("all");
  const shown = f === "all" ? rows : rows.filter((r) => r.status === f);
  const csv = () => {
    const lines = [["number", "who", "what", "amount_inr", "method", "status", "paid_at"].join(","), ...rows.map((r) => [r.number, r.who, r.what, r.amountInr, r.method ?? "", r.status, r.paidAt].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "danceos-invoices.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <BizPage title="Invoices" sub={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`} grad="linear-gradient(135deg,#64748B,#0EA5E9)">
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(
          [
            ["all", "All"],
            ["paid", "Paid"],
            ["refunded", "Refunded"],
          ] as Array<["all" | "paid" | "refunded", string]>
        ).map(([k, l]) => (
          <button type="button" key={k} aria-pressed={f === k} onClick={() => setF(k)} style={{ ...chip(f === k), flex: 1, textAlign: "center" }}>
            {l}
          </button>
        ))}
      </div>
      {shown.map((r) => {
        const body = (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{r.what}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2 }}>
                {r.number} · {dayWords(r.paidAt)}
                {r.method ? ` · ${r.method}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 900 }}>{rupees(r.amountInr)}</div>
              <div style={{ fontSize: 9, fontWeight: 900, color: TONE[r.status], textTransform: "uppercase" }}>{r.status}</div>
            </div>
          </>
        );
        const style = { ...bizCard, borderLeft: `4px solid ${TONE[r.status]}`, display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", color: "var(--text)", textDecoration: "none" } as const;
        return r.classShareSlug ? (
          <Link key={r.id} href={`/c/${r.classShareSlug}`} aria-label={`Open ${r.number}`} style={style}>
            {body}
          </Link>
        ) : (
          <div key={r.id} style={style}>
            {body}
          </div>
        );
      })}
      {shown.length === 0 ? (
        <div style={{ ...bizCard, textAlign: "center", border: "1.5px dashed var(--el)", padding: "22px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 5 }}>{rows.length === 0 ? (side === "mine" ? "No invoices yet" : "Nothing collected yet") : "Nothing in that state"}</div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5 }}>{side === "mine" ? "Every paid booking leaves an invoice here, with its receipt on the class page." : "Every payment a student makes lands here the moment Cashfree confirms it."}</div>
        </div>
      ) : null}
      <button type="button" onClick={csv} disabled={rows.length === 0} style={{ ...ghostBtn, marginTop: 4, opacity: rows.length ? 1 : 0.5 }}>
        Export ledger
      </button>
    </BizPage>
  );
}
