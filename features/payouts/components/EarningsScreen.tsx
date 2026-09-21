"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { EarningsChart } from "@/features/payouts/components/EarningsChart";
import { money } from "@/features/payouts/components/earnings-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { PERIODS, bucketLabelOf } from "@/lib/format/month";
import { EARNING_TINT, sumLines, type EarningsReport, type MoneyLine } from "@/types/earnings";

/** EARNINGS — ONE SCREEN FOR EVERY KIND OF PROFILE (21 Sep 2026, the user:
 *  "lets fix earnings for all profile types. make sure to give day, week, month,
 *  year filters and toggles with graphs. earnings should consist of Revenue with
 *  breakup and Expenses with breakup. and what is left after that").
 *
 *  So it is four things in one order, and the order is the sentence: the period
 *  you are looking at, the shape of it, what came IN with its breakup, what went
 *  OUT with its breakup, and WHAT IS LEFT.
 *
 *  ⚠ WHAT THIS REPLACES, AND WHY IT HAD TO BE ONE SCREEN. There were four money
 *  pages and no two agreed. Two of them printed a MONTH in the heading over an
 *  ALL-TIME figure (`TEACHING · SEPTEMBER`, `WHAT YOU PAY YOUR PEOPLE ·
 *  SEPTEMBER`). The studio desk's period chips governed only its income half and
 *  UNMOUNTED the expense half when you picked a past month. The two organization
 *  screens summed different sets — one counted its studios and its events, the
 *  other only its studios. And **not one of the four ever subtracted what went
 *  out from what came in**, so "what is left" was a figure the app never printed.
 *
 *  ⚠ THE PERIOD IS IN THE URL (`?period=`), which none of the four had: a period
 *  was component state everywhere, so it could not be shared and was lost the
 *  moment you navigated. The BUCKET inside it is local state, because tapping a
 *  column is reading, not navigating — and it is free, since every bucket came
 *  back in the same read (the chart and the figures are the same rows counted
 *  once, so they cannot disagree). */

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const eyebrow: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "4px 0 8px" };

function Breakup({ title, lines, total, tone, empty }: { title: string; lines: MoneyLine[]; total: number; tone: string; empty: string }) {
  const max = Math.max(1, ...lines.map((l) => l.amountInr));
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: lines.length ? 10 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" }}>{title}</span>
        <b style={{ fontSize: 17, fontWeight: 900, color: tone }} data-testid={`earn-${title.toLowerCase()}`}>
          {money(total)}
        </b>
      </div>
      {lines.map((l) => {
        const row = (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.label}
                {l.href ? <span style={{ color: SUB, fontWeight: 700 }}> ›</span> : null}
              </span>
              <b style={{ flexShrink: 0, fontSize: 12.5 }}>{money(l.amountInr)}</b>
            </div>
            {/* the bar is share of the BIGGEST line, so the breakup has a shape
                you can read at a glance rather than four numbers to compare */}
            <div style={{ height: 5, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 5 }}>
              <div style={{ width: `${Math.round((l.amountInr / max) * 100)}%`, height: "100%", borderRadius: 999, background: EARNING_TINT[l.key] ?? tone }} />
            </div>
            {l.note ? <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4 }}>{l.note}</div> : null}
          </>
        );
        return (
          <div key={l.key} style={{ marginBottom: 10 }} data-testid="earn-line">
            {l.href ? (
              <Link href={l.href} aria-label={`${l.label} — ${money(l.amountInr)}`} style={{ display: "block", color: INK, textDecoration: "none" }}>
                {row}
              </Link>
            ) : (
              row
            )}
          </div>
        );
      })}
      {lines.length === 0 ? <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, marginTop: 6 }}>{empty}</div> : null}
    </div>
  );
}

export function EarningsScreen({
  report,
  title,
  sub,
  basePath,
  noExpenses = false,
  children,
}: {
  report: EarningsReport;
  title: string;
  sub?: string;
  /** ⚠ THIS PAGE'S OWN ADDRESS, as a STRING — the period is appended here.
   *  It was a `(p: Period) => string` builder for about ten minutes, which
   *  typechecks and builds and then dies in the browser: *"Functions cannot be
   *  passed directly to Client Components"*. Every one of these four pages is a
   *  server component, so a callback prop is not a thing it can hand over.
   *  Caught by driving it, which is the only thing that could have. */
  basePath: string;
  /** a person employs nobody, so "what is left" IS what came in — said, not drawn empty */
  noExpenses?: boolean;
  /** whatever else a kind adds under the figures (an organization's studio list) */
  children?: ReactNode;
}) {
  const last = report.buckets[report.buckets.length - 1];
  /* ⚠ THE PICKED BUCKET IS A PREFERENCE, NOT STATE, and that is a bug fixed
     rather than a style: holding it in `useState` meant switching Day → Year
     kept a DAY key selected, which is in no year's window, so every figure on
     the page read ₹0 while the chart beside it drew real bars. It is honoured
     only while this period actually has that bucket, and the current one is the
     answer otherwise — no effect, no setState-in-effect (which this repo lints
     against), and the same fallback covers the window scrolling past it. */
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && report.lines[picked] ? picked : (last?.key ?? "");
  const setSelected = setPicked;
  const [showRevenue, setShowRevenue] = useState(true);
  const [showExpenses, setShowExpenses] = useState(!noExpenses);

  const here = report.lines[selected] ?? { revenue: [], expenses: [] };
  const revenue = sumLines(here.revenue);
  const expenses = sumLines(here.expenses);
  const left = revenue - expenses;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "12px 16px 40px", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.4, margin: "0 0 2px" }}>{title}</h1>
      {sub ? <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, marginBottom: 12 }}>{sub}</div> : <div style={{ marginBottom: 12 }} />}

      {/* DAY · WEEK · MONTH · YEAR — the period is a LINK, so it is in the URL */}
      <div role="group" aria-label="Period" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
        {PERIODS.map(([p, label]) => {
          const on = report.period === p;
          return (
            <Link
              key={p}
              href={`${basePath}?period=${p}`}
              replace
              scroll={false}
              aria-current={on ? "true" : undefined}
              style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? "var(--solid)" : "transparent", color: on ? INK : SUB }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <EarningsChart
        buckets={report.buckets.map((b) => ({ key: b.key, revenue: b.revenueInr, expenses: b.expensesInr }))}
        period={report.period}
        selected={selected}
        onSelect={setSelected}
        showRevenue={showRevenue}
        showExpenses={showExpenses}
        onToggle={(which) => (which === "revenue" ? setShowRevenue((v) => !v) : setShowExpenses((v) => !v))}
      />

      <div style={eyebrow} data-testid="earn-bucket">
        {selected ? bucketLabelOf(selected, report.period).toUpperCase() : ""}
      </div>

      <Breakup
        title="REVENUE"
        lines={here.revenue}
        total={revenue}
        tone="#22C55E"
        empty="Nothing came in this time. When somebody books a class, takes a membership or buys a ticket, it shows up here — each source on its own."
      />

      {noExpenses ? null : (
        <Breakup
          title="EXPENSES"
          lines={here.expenses}
          total={expenses}
          tone="#F87171"
          empty="Nothing went out this time. What you pay your people, what you refunded and what you bought all land here."
        />
      )}

      {/* ⚠ WHAT IS LEFT — the figure none of the four old screens ever printed.
          It is revenue minus expenses and nothing else: there is no DanceOS fee,
          no GST on a fee and no TDS rate anybody has set, so none is deducted.
          The prototype's S_earn prints all three; printing them at ₹0 would be a
          claim about money rather than a measurement of it. */}
      <div style={{ ...card, background: left < 0 ? "rgba(248,113,113,.10)" : "rgba(34,197,94,.10)", border: `1.5px solid ${left < 0 ? "#F87171" : "#22C55E"}55` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" }}>WHAT IS LEFT</span>
          <b style={{ fontSize: 22, fontWeight: 900, color: left < 0 ? "#F87171" : "#22C55E" }} data-testid="earn-left">
            {money(left)}
          </b>
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
          {noExpenses
            ? "Everything a studio has paid you. DanceOS records it, it does not move the money."
            : "What came in, less what went out. No platform fee, no GST on one and no TDS is taken off — DanceOS charges none of them."}
        </div>
      </div>

      {report.complete ? null : (
        <div role="status" style={{ ...card, fontSize: 11, color: "#F59E0B", lineHeight: 1.5 }}>
          Counting the latest 4,000 rows only — older money is not in these totals.
        </div>
      )}

      {children}
    </div>
  );
}
