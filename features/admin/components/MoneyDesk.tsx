import Link from "next/link";
import { dateWords } from "@/features/settings/components/settings-kit";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { AdminMoneySummary, AdminPayment, AdminPayout, AdminRefund } from "@/repositories/adminPanel";
import { agoWords } from "@/types/notification";
import { DeskNeedsMigration } from "./DeskNeedsMigration";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

export type MoneyTab = "payments" | "refunds" | "payouts";

const rupees = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `₹${n}`;
const exact = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "18px 0 8px" }}>{children}</div>
);

function Fig({ n, label, tone, href }: { n: string | number; label: string; tone?: string; href?: string }) {
  const body = (
    <>
      <span style={{ display: "block", fontSize: 21, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: tone ?? INK, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 4, lineHeight: 1.3 }}>{label}</span>
    </>
  );
  const style: React.CSSProperties = { background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "11px 12px", textDecoration: "none", display: "block", minWidth: 0 };
  return href ? <Link href={href} style={style}>{body}</Link> : <div style={style}>{body}</div>;
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{children}</div>
);

const Chip = ({ word, tone, faint }: { word: string; tone: string; faint?: boolean }) => (
  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: faint ? "var(--el)" : `${tone}22`, color: faint ? SUB : tone }}>{word}</span>
);

function Pills({ tab, options, param, current }: { tab: MoneyTab; options: Array<[string, string]>; param: string; current: string }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
      {options.map(([k, label]) => (
        <Link
          key={k}
          href={`/admin/payments?tab=${tab}${k === "all" ? "" : `&${param}=${k}`}`}
          style={{ flex: "0 0 auto", padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", background: current === k ? "var(--text)" : CARD, color: current === k ? "var(--solid)" : SUB, border: `1px solid ${current === k ? "var(--text)" : EL}`, whiteSpace: "nowrap" }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

const PAYMENT_STATUS: Record<string, { word: string; tone: string }> = {
  captured: { word: "CAPTURED", tone: "#22C55E" },
  failed: { word: "FAILED", tone: "#EF4444" },
  refunded: { word: "REFUNDED", tone: "#F59E0B" },
};
const REFUND_STATUS: Record<string, { word: string; tone: string }> = {
  requested: { word: "THE STUDIO DECIDES", tone: "#F59E0B" },
  pending: { word: "WITH THE BANK", tone: "#3B82F6" },
  processed: { word: "BACK", tone: "#22C55E" },
  failed: { word: "FAILED", tone: "#EF4444" },
};
const PAYOUT_STATUS: Record<string, { word: string; tone: string }> = {
  done: { word: "PAID", tone: "#22C55E" },
  in_transit: { word: "IN TRANSIT", tone: "#3B82F6" },
  on_hold: { word: "ON HOLD", tone: "#F59E0B" },
  failed: { word: "FAILED", tone: "#EF4444" },
};

/** THE MONEY DESK (11 Sep 2026) — the segment the panel did not have. The
 *  dashboard could say ₹40,000 had been captured and there was nowhere to go
 *  from the number: an admin could not find one person's payment, could not see
 *  the refund somebody had been waiting nine days for, and could not see what a
 *  studio had paid its trainers.
 *
 *  It is deliberately READ-ONLY. Deciding a refund belongs to the studio whose
 *  class it was — that is where the 48-hour window and the settlement rules
 *  live, and moving that decision here would quietly make DanceOS the
 *  counterparty. What an admin needs is to SEE it, and to see how long somebody
 *  has been waiting, which is the number that says which one to chase.
 *
 *  Three tabs on one page, because they are one question asked three ways:
 *  money in, money back, money on. */
export function MoneyDesk({
  tab,
  summary,
  payments,
  refunds,
  payouts,
  filter,
  needsMigration,
  nowIso,
}: {
  tab: MoneyTab;
  summary: AdminMoneySummary;
  payments: AdminPayment[];
  refunds: AdminRefund[];
  payouts: AdminPayout[];
  filter: string;
  needsMigration: boolean;
  nowIso: string;
}) {
  const waiting = summary.refundsWaiting;
  const alarm = waiting > 0 || summary.webhooksStuck > 0;

  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: alarm ? "linear-gradient(135deg,#B45309,#F59E0B)" : "linear-gradient(135deg,#166534,#22C55E)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85, position: "relative" }}>MONEY</div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>
          {waiting > 0
            ? `${waiting} refund${waiting === 1 ? "" : "s"} waiting${summary.refundsOldestDays > 0 ? `, oldest ${summary.refundsOldestDays} day${summary.refundsOldestDays === 1 ? "" : "s"}` : ""}`
            : `${exact(summary.capturedAllInr)} has come through DanceOS`}
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>
          {exact(summary.capturedTodayInr)} today · {exact(summary.capturedWeekInr)} this week
        </div>
      </div>

      {needsMigration ? <DeskNeedsMigration what="The money desk" /> : null}

      <Head>WHOSE MONEY IT IS</Head>
      <Grid>
        <Fig n={rupees(summary.platformAllInr)} label="DanceOS's own — plans" tone="#22C55E" href="/admin/subscriptions" />
        <Fig n={rupees(summary.classesAllInr)} label="studios' class income, passing through" />
        <Fig n={rupees(summary.refundedAllInr)} label="gone back" />
        <Fig n={rupees(summary.payoutsAllInr)} label="paid on to trainers" href="/admin/payments?tab=payouts" />
        <Fig n={summary.payoutsPending} label="payouts not landed" tone={summary.payoutsPending > 0 ? "#F59E0B" : undefined} href="/admin/payments?tab=payouts" />
        <Fig n={summary.paymentsFailedWeek} label="payments failed this week" tone={summary.paymentsFailedWeek > 0 ? "#EF4444" : undefined} href="/admin/payments?tab=payments&status=failed" />
      </Grid>

      {summary.webhooksStuck > 0 ? (
        <div style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #EF4444", borderRadius: 14, padding: "10px 12px", marginTop: 8 }}>
          <b style={{ fontSize: 12 }}>{summary.webhooksStuck} webhook delivery{summary.webhooksStuck === 1 ? "" : "s"} never finished</b>
          <div style={{ fontSize: 10.5, color: SUB, marginTop: 2, lineHeight: 1.5 }}>
            The delivery arrived and its work did not complete, so a payment on this page may be missing or behind. This is
            the one number here that means something might be WRONG rather than merely slow.
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 6, margin: "18px 0 12px" }}>
        {(
          [
            ["payments", "Money in", payments.length],
            ["refunds", "Money back", refunds.length],
            ["payouts", "Money on", payouts.length],
          ] as Array<[MoneyTab, string, number]>
        ).map(([k, word, n]) => {
          const on = tab === k;
          return (
            <Link
              key={k}
              href={`/admin/payments?tab=${k}`}
              aria-current={on ? "page" : undefined}
              style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "9px 4px 8px", borderRadius: 14, textDecoration: "none", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}` }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>{word}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>{n}</div>
            </Link>
          );
        })}
      </div>

      {tab === "payments" ? (
        <>
          <Pills
            tab="payments"
            param="status"
            current={filter}
            options={[
              ["all", "All"],
              ["captured", "Captured"],
              ["failed", "Failed"],
              ["refunded", "Refunded"],
            ]}
          />
          {payments.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>No payments match that.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payments.map((p) => {
                const st = PAYMENT_STATUS[p.status] ?? { word: p.status.toUpperCase(), tone: MUTED };
                const isPlan = p.kind !== "order";
                return (
                  <div key={p.id} data-testid="admin-payment" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${st.tone}`, borderRadius: 16, padding: "11px 12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{exact(p.amountInr)}</b>
                      <Chip word={st.word} tone={st.tone} />
                      <Chip word={isPlan ? "DANCEOS" : "STUDIO"} tone={isPlan ? "#22C55E" : "#1D4ED8"} faint={!isPlan} />
                      {p.refundedInr > 0 ? <Chip word={`${exact(p.refundedInr)} BACK`} tone="#F59E0B" /> : null}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 4, color: INK, fontWeight: 700 }}>{p.what}</div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
                      {p.payerName}
                      {p.payerEmail ? ` · ${p.payerEmail}` : ""}
                      {p.tenantName ? ` · to ${p.tenantName}` : ""}
                      {p.method ? ` · ${p.method}` : ""}
                      {` · ${agoWords(p.createdAt, nowIso)}`}
                    </div>
                    {p.providerPaymentId ? (
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontFamily: "ui-monospace, monospace" }}>
                        {p.provider} {p.providerPaymentId}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {tab === "refunds" ? (
        <>
          <Pills
            tab="refunds"
            param="status"
            current={filter}
            options={[
              ["all", "All"],
              ["requested", "Studio deciding"],
              ["pending", "With the bank"],
              ["processed", "Back"],
              ["failed", "Failed"],
            ]}
          />
          {refunds.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>No refunds match that.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refunds.map((r) => {
                const st = REFUND_STATUS[r.status] ?? { word: r.status.toUpperCase(), tone: MUTED };
                /* a week is where "waiting" becomes "ignored" */
                const late = r.waitingDays >= 7;
                return (
                  <div key={r.id} data-testid="admin-refund" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${late ? "#EF4444" : st.tone}`, borderRadius: 16, padding: "11px 12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{exact(r.amountInr)}</b>
                      <Chip word={st.word} tone={st.tone} />
                      {r.waitingDays > 0 ? <Chip word={`${r.waitingDays} DAY${r.waitingDays === 1 ? "" : "S"} WAITING`} tone={late ? "#EF4444" : "#F59E0B"} /> : null}
                      {r.settledOffline ? <Chip word="SETTLED OFF THE RAIL" tone={MUTED} faint /> : null}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 4, color: INK, fontWeight: 700 }}>{r.classTitle}</div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
                      {r.learnerName}
                      {r.tenantName ? ` · ${r.tenantName}` : ""}
                      {` · asked ${agoWords(r.createdAt, nowIso)}`}
                      {r.decidedAt ? ` · decided ${dateWords(r.decidedAt.slice(0, 10))}` : ""}
                    </div>
                    {r.reason ? <div style={{ fontSize: 11, color: SUB, marginTop: 5, lineHeight: 1.45 }}>&ldquo;{r.reason}&rdquo;</div> : null}
                    {r.decisionNote ? (
                      <div style={{ fontSize: 11, color: INK, marginTop: 5, lineHeight: 1.45, background: "var(--bg)", borderRadius: 10, padding: "6px 9px" }}>{r.decisionNote}</div>
                    ) : null}
                    {r.tenantName ? (
                      <div style={{ marginTop: 8 }}>
                        <Link href={`/admin/businesses?q=${encodeURIComponent(r.tenantName)}`} style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 11px", borderRadius: 10, fontSize: 11, fontWeight: 800, textDecoration: "none", border: `1px solid ${EL}`, background: CARD, color: INK }}>
                          Open the business
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 16, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
            This desk watches; it does not decide. A refund is the studio&apos;s to settle, on the class it was for — which is
            what keeps DanceOS out of the middle of it. What an admin can do from here is see who has been waiting too
            long, and go and ask.
          </div>
        </>
      ) : null}

      {tab === "payouts" ? (
        <>
          <Pills
            tab="payouts"
            param="status"
            current={filter}
            options={[
              ["all", "All"],
              ["done", "Paid"],
              ["in_transit", "In transit"],
              ["on_hold", "On hold"],
              ["failed", "Failed"],
            ]}
          />
          {payouts.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>No payouts match that.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payouts.map((p) => {
                const st = PAYOUT_STATUS[p.status] ?? { word: p.status.toUpperCase(), tone: MUTED };
                return (
                  <div key={p.id} data-testid="admin-payout" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${st.tone}`, borderRadius: 16, padding: "11px 12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{exact(p.amountInr)}</b>
                      <Chip word={st.word} tone={st.tone} />
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 4, color: INK, fontWeight: 700 }}>
                      {p.tenantName ?? "A business"} → {p.personName}
                    </div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
                      {p.method.replace("_", " ")} · {dateWords(p.paidOn)}
                      {p.providerRef ? ` · ${p.providerRef}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 16, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
            DanceOS does not move this money — a business pays its own trainers and records it here, which is why every
            row is a fact rather than an instruction. Platform payouts are deliberately unwired.
          </div>
        </>
      ) : null}
    </div>
  );
}
