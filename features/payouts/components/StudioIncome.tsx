"use client";

import { CARD, GOLD, GREEN, LINE, MUTED, PINK, RED, SUB } from "@/lib/design/tokens";
import type { MonthIncome, TenantIncome } from "@/types/income";
import { DOS_MONO, MoneyCard, SectionLabel, bizCard, money } from "./earnings-kit";

/** The money-IN half of the studio's earnings screen, lifted from prototype
 *  S_earn: the period chips (17988-17992), the GROSS card with its ▲/▼ badge
 *  (17993-18048), HOW STUDENTS PAID (18171-18178) and the month statements
 *  (18055-18082). Everything printed here is counted from Step 9's payments and
 *  refunds — the prototype's rule for this screen is that a number which can
 *  only ever be good news is not a measurement (17996-18002).
 *
 *  What is NOT here, on purpose (CLAUDE.md, Step 13b part 2b buckets b and c):
 *  the source bar / SHARE OF GROSS (one source exists today — Classes at 100%
 *  is a legend with nothing to say until Step 21 brings tickets), and the fee /
 *  GST / bank-settlement lines, which need a live (KYC'd) Cashfree account to be true. */

/* the prototype's softer red for money going back out (18075) */
const SOFT_RED = "#F87171";

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** The rail's method words → the prototype's labels and tints (18130). Cashfree
 *  reports a `payment_group` (upi, credit_card, debit_card, net_banking, wallet,
 *  pay_later, emi …); the first cut's Razorpay words stay so its rows still read.
 *  Methods the prototype never named get the kit's spare colours; anything
 *  unknown prints as itself rather than being hidden. */
const METHOD_WORDS: Record<string, [string, string]> = {
  upi: ["UPI", "#22C55E"],
  upi_credit_card: ["UPI", "#22C55E"],
  card: ["Cards", "#3B82F6"],
  credit_card: ["Cards", "#3B82F6"],
  debit_card: ["Cards", "#3B82F6"],
  prepaid_card: ["Cards", "#3B82F6"],
  cash: ["Cash at studio", "#F59E0B"],
  netbanking: ["Netbanking", "#8B5CF6"],
  net_banking: ["Netbanking", "#8B5CF6"],
  wallet: ["Wallets", "#0EA5E9"],
  emi: ["EMI", "#0D9488"],
  cardless_emi: ["Cardless EMI", "#0EA5E9"],
  paylater: ["Pay later", "#DC2626"],
  pay_later: ["Pay later", "#DC2626"],
  bank_transfer: ["Bank transfer", "#8E44AD"],
};

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const methodWords = (method: string): [string, string] =>
  METHOD_WORDS[method] ?? [method === "other" ? "Other" : titleCase(method), MUTED];

/** Period filter — This month is live, past months open their statement. */
export function PeriodChips({
  months,
  view,
  openKey,
  onNow,
  onMonth,
}: {
  months: MonthIncome[];
  view: "now" | "hist";
  openKey: string | null;
  onNow: () => void;
  onMonth: (key: string) => void;
}) {
  const chips: Array<{ key: string | null; label: string }> = [
    { key: null, label: "This month" },
    ...months.map((m) => ({ key: m.key, label: m.monthName })),
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
      {chips.map((chip) => {
        const isNow = chip.key === null;
        const on = isNow === (view === "now") && (isNow || openKey === chip.key);
        const pick = () => (chip.key === null ? onNow() : onMonth(chip.key));
        return (
          <span
            key={chip.label}
            role="button"
            tabIndex={0}
            onKeyDown={pressKey(pick)}
            onClick={pick}
            style={{
              padding: "7px 13px",
              borderRadius: 999,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: "nowrap",
              flexShrink: 0,
              background: on ? "var(--text)" : "var(--card)",
              color: on ? "var(--solid)" : "var(--sub)",
              border: `1px solid ${LINE}`,
            }}
          >
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}

/** ▲/▼ vs last month — COUNTED AGAINST THE MONTH IT NAMES (prototype
 *  17996-18011): computed from the same month the statements print, and it goes
 *  down as readily as up. Nothing is drawn when last month took nothing, because
 *  a percentage of zero is not a comparison. */
function GrowthBadge({ current, previous }: { current: MonthIncome; previous: MonthIncome | undefined }) {
  const prev = previous?.grossInr ?? 0;
  if (!previous || prev <= 0) return null;
  const pct = Math.round((1000 * (current.grossInr - prev)) / prev) / 10;
  const up = pct >= 0;
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 900,
        padding: "2px 7px",
        borderRadius: 999,
        background: up ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
        color: up ? GREEN : SOFT_RED,
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs {previous.monthName}
    </span>
  );
}

/** GROSS · {MONTH}: what students paid this month, and the three counted tiles.
 *  The prototype's Settled / In transit tiles count bank settlements, which do
 *  not exist without a live Cashfree account; the two real states of this money
 *  today are what stayed (Net) and what is being asked back — so those are the
 *  tiles, beside the prototype's own REFUNDED. */
export function GrossCard({ income }: { income: TenantIncome }) {
  const { current, previous, openRefundsInr } = income;
  const net = current.grossInr - current.refundedInr;
  return (
    <>
      <MoneyCard
        label={`GROSS · ${current.monthName.toUpperCase()}`}
        amount={current.grossInr}
        badge={<GrowthBadge current={current} previous={previous[0]} />}
        note="Counted from the payments students made this month · refunds come off it below"
        tiles={[
          [money(net), "Net", GREEN],
          [money(openRefundsInr), "Asked back", GOLD],
          [money(current.refundedInr), "Refunded", RED],
        ]}
      />
      {!income.complete ? (
        <div style={{ fontSize: 10.5, color: SUB, margin: "-4px 0 10px" }}>
          Counting the latest 4,000 rows only — older payments are not in these totals.
        </div>
      ) : null}
    </>
  );
}

/** HOW STUDENTS PAID — one stacked bar off the real `payments.method`, with the
 *  legend underneath (prototype 18171-18178). Shares are of the money, not of
 *  the count, because this is a money screen. */
export function HowStudentsPaid({ month }: { month: MonthIncome }) {
  const total = month.byMethod.reduce((a, s) => a + s.amountInr, 0);
  return (
    <>
      <SectionLabel>HOW STUDENTS PAID</SectionLabel>
      <div
        style={{
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: 16,
          padding: "12px 14px",
          marginBottom: 10,
        }}
      >
        {total <= 0 ? (
          <div style={{ fontSize: 12, color: SUB, lineHeight: 1.5 }}>
            No payments yet this month — when students pay through DanceOS, how they paid shows up here.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 10 }}>
              {month.byMethod.map((s) => (
                <div
                  key={s.method}
                  style={{ width: `${(100 * s.amountInr) / total}%`, background: methodWords(s.method)[1] }}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              {month.byMethod.map((s) => {
                const [label, colour] = methodWords(s.method);
                return (
                  <span
                    key={s.method}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: SUB,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: colour }} />
                    {label} {Math.round((100 * s.amountInr) / total)}%
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** A real statement, not a toast: the figures on screen, as a CSV the studio can
 *  hand to its accountant. The prototype's control fires a demo toast (18081);
 *  ours writes the file and then says so. */
function downloadStatement(tenantName: string, month: MonthIncome) {
  const net = month.grossInr - month.refundedInr;
  const rows: Array<Array<string | number>> = [
    ["DanceOS statement", tenantName],
    ["Month", month.label],
    [],
    ["WHERE IT CAME FROM", ""],
    ["Classes", month.grossInr],
    [],
    ["DEDUCTIONS", ""],
    ["Refunds", -month.refundedInr],
    [],
    ["Gross collected", month.grossInr],
    ["Net settled", net],
    ["Payments", month.paymentCount],
    ["Refunds processed", month.refundCount],
    [],
    ["HOW STUDENTS PAID", ""],
    ...month.byMethod.map((s): Array<string | number> => [methodWords(s.method)[0], s.amountInr]),
  ];
  const quote = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(quote).join(",")).join("\r\n");
  /* a BOM so spreadsheets open the rupee sign as UTF-8 */
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `danceos-statement-${month.key}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The past months' statements (prototype 18055-18082): each card opens into
 *  WHERE IT CAME FROM, DEDUCTIONS and Net settled. Deductions today hold only
 *  Refunds — we charge no fee — so Net settled = Gross − Refunds is a true
 *  sentence, and the fee / GST lines wait for a live Cashfree account rather than
 *  being printed as if they existed. The prototype's sub-line counts bank
 *  payouts; ours counts the payments that made the month, which is the real
 *  number we have. */
export function MonthStatements({
  tenantName,
  months,
  openKey,
  onToggle,
  onDownloaded,
}: {
  tenantName: string;
  months: MonthIncome[];
  openKey: string | null;
  onToggle: (key: string) => void;
  onDownloaded: (label: string) => void;
}) {
  return (
    <>
      {months.map((m) => {
        const net = m.grossInr - m.refundedInr;
        const sources: Array<[string, number]> = [["Classes", m.grossInr]];
        const deductions: Array<[string, number]> = [["Refunds", m.refundedInr]];
        const max = Math.max(1, ...sources.map((s) => s[1]));
        const open = openKey === m.key;
        const toggle = () => onToggle(m.key);
        const download = () => {
          downloadStatement(tenantName, m);
          onDownloaded(m.label);
        };
        return (
          <div key={m.key} style={{ ...bizCard, borderLeft: `4px solid ${GREEN}` }}>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={pressKey(toggle)}
              onClick={toggle}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <b style={{ fontSize: 13.5 }}>{m.label}</b>
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 2 }}>
                  {money(net)} net · {m.paymentCount} payment{m.paymentCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <b style={{ fontSize: 14, color: GREEN }}>₹{(m.grossInr / 1000).toFixed(1)}k</b>
                <div style={{ fontSize: 9, color: MUTED }}>{open ? "hide" : "breakup"}</div>
              </div>
            </div>
            {open ? (
              <div style={{ marginTop: 10, background: LINE, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: MUTED, marginBottom: 7 }}>
                  WHERE IT CAME FROM
                </div>
                {sources.map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 7 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11.5,
                        fontWeight: 800,
                        marginBottom: 3,
                      }}
                    >
                      <span>{k}</span>
                      <span style={{ color: SUB }}>
                        {money(v)} · {m.grossInr > 0 ? Math.round((100 * v) / m.grossInr) : 0}%
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: CARD }}>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 3,
                          width: `${Math.round((100 * v) / max)}%`,
                          background: "linear-gradient(90deg,#22C55E,#0D9488)",
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: MUTED, margin: "9px 0 6px" }}>
                  DEDUCTIONS
                </div>
                {deductions.map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11.5,
                      padding: "3px 0",
                      borderBottom: `1px solid ${CARD}`,
                    }}
                  >
                    <span style={{ color: SUB }}>{k}</span>
                    <b style={{ color: SOFT_RED }}>−{money(v)}</b>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, paddingTop: 8 }}>
                  <b>Net settled</b>
                  <b style={{ color: GREEN, fontFamily: DOS_MONO }}>{money(net)}</b>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={pressKey(download)}
                  onClick={download}
                  style={{ fontSize: 10.5, fontWeight: 800, color: PINK, marginTop: 9, cursor: "pointer" }}
                >
                  Download statement ↓
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
