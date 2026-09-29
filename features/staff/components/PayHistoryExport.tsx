"use client";

import { SUB } from "@/lib/design/tokens";
import { PAYOUT_METHOD_LABEL, type PayoutWithSessions } from "@/types/payout";

/** EXPORT WHAT THIS PERSON WAS PAID (29 Sep 2026).
 *
 *  The Invoices ledger and the month statements have both offered a real CSV
 *  since 29 Aug; this page is a ledger too and had no way out of it. A studio
 *  reconciling a year of somebody's pay against its own books was reading
 *  twelve cards on a phone.
 *
 *  ⚠ IT WRITES ONE LINE PER SESSION, NOT ONE PER PAYMENT, which is the whole
 *  reason it is worth having here rather than pointing at the Earnings desk's
 *  export: that one knows a payment covered "3 sessions" and this page is the
 *  only place that knows WHICH. A payment recorded through `record_team_payment`
 *  carries no lines by design (R35), so it writes a single row with an empty
 *  session — the same fact the card states in words, in a shape a spreadsheet
 *  can hold.
 *
 *  ⚠ THE FILE IS WHAT THE PAGE SHOWS AND NOTHING MORE. If the read was capped
 *  the page already says so in amber; exporting cannot quietly turn a short
 *  list into a complete-looking file, because both come off the same rows.
 *
 *  ⚠ A CLIENT CHILD ON A SERVER PAGE, deliberately: a Blob needs the browser,
 *  and making the whole history page a client component to get one button would
 *  ship the ledger's markup twice. */
export function PayHistoryExport({
  personName,
  businessName,
  payouts,
}: {
  personName: string;
  businessName: string;
  payouts: PayoutWithSessions[];
}) {
  if (payouts.length === 0) return null;

  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "person";

  const download = () => {
    const head = [
      "paid_on",
      "amount_inr",
      "status",
      "method",
      "reference",
      "note",
      "session_class",
      "session_starts_at",
      "session_rate_inr",
    ];
    const lines: string[] = [head.join(",")];
    for (const p of payouts) {
      const base = [p.paidOn, p.amountInr, p.status, PAYOUT_METHOD_LABEL[p.method] ?? p.method, p.providerRef ?? "", p.note ?? ""];
      if (p.sessions.length === 0) {
        /* ⚠ recorded as an amount, not against sessions (R35) — one row, and the
           three session columns left empty rather than invented */
        lines.push([...base, "", "", ""].map(q).join(","));
        continue;
      }
      for (const s of p.sessions) {
        lines.push([...base, s.classTitle, s.startsAt, s.rateInr].map(q).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `danceos-${slug(businessName)}-${slug(personName)}-payments.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <button
      type="button"
      onClick={download}
      aria-label={`Export what ${businessName} has paid ${personName} as a CSV`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        width: "100%",
        marginTop: 12,
        padding: "11px",
        borderRadius: 999,
        background: "var(--card)",
        border: "1.5px solid var(--el)",
        color: "var(--text)",
        fontFamily: "inherit",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      <span>Export these payments</span>
      <span aria-hidden="true" style={{ color: SUB }}>↓</span>
    </button>
  );
}
