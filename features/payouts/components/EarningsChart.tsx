"use client";

import type { CSSProperties } from "react";
import { SUB } from "@/lib/design/tokens";
import { bucketTickOf, type Period } from "@/lib/format/month";

/** THE SHAPE OF THE MONEY (21 Sep 2026, the user: "give day, week, month, year
 *  filters and toggles with graphs").
 *
 *  Paired bars per bucket — what came in beside what went out — with the two
 *  series as TOGGLES and every bucket a button that moves the figures above.
 *
 *  ⚠ EVERY BUCKET IS ALREADY LOADED, so a tap costs no round trip: the page
 *  reads the rows once over the whole window and buckets them in TypeScript
 *  (which is also why it must — this project's PostgREST has aggregates switched
 *  off, PGRST123). That is the same reasoning `SegmentedPanels` uses for the
 *  class columns: the tap is free because the server already answered.
 *
 *  ⚠ AND THE BARS ARE SCALED BY THE TALLEST BUCKET IN THE WINDOW, never by each
 *  bucket's own total — a chart whose columns are each scaled to themselves is
 *  four equal bars saying nothing. When everything is zero no bar is drawn at
 *  all, rather than a row of full-height bars from dividing by zero. */

export type Bucket = { key: string; revenue: number; expenses: number };

const GREEN = "#22C55E";
const RED = "#F87171";

const legendChip = (on: boolean, tint: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 999,
  border: `1.5px solid ${on ? tint : "var(--el)"}`,
  background: on ? `${tint}1f` : "transparent",
  color: on ? tint : SUB,
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
});

export function EarningsChart({
  buckets,
  period,
  selected,
  onSelect,
  showRevenue,
  showExpenses,
  onToggle,
}: {
  /** oldest first — the window the page read */
  buckets: Bucket[];
  period: Period;
  selected: string;
  onSelect: (key: string) => void;
  showRevenue: boolean;
  showExpenses: boolean;
  onToggle: (which: "revenue" | "expenses") => void;
}) {
  const tallest = Math.max(
    0,
    ...buckets.map((b) => Math.max(showRevenue ? b.revenue : 0, showExpenses ? b.expenses : 0))
  );
  const height = (n: number) => (tallest > 0 ? Math.max(n > 0 ? 2 : 0, Math.round((n / tallest) * 100)) : 0);

  return (
    <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 12px 8px", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button type="button" onClick={() => onToggle("revenue")} aria-pressed={showRevenue} style={legendChip(showRevenue, GREEN)}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, background: showRevenue ? GREEN : "var(--el)" }} /> Revenue
        </button>
        <button type="button" onClick={() => onToggle("expenses")} aria-pressed={showExpenses} style={legendChip(showExpenses, RED)}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, background: showExpenses ? RED : "var(--el)" }} /> Expenses
        </button>
      </div>

      <div role="group" aria-label="Earnings over time" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 116 }}>
        {buckets.map((b) => {
          const on = b.key === selected;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onSelect(b.key)}
              aria-pressed={on}
              aria-label={`${bucketTickOf(b.key, period)} — ₹${b.revenue.toLocaleString("en-IN")} in, ₹${b.expenses.toLocaleString("en-IN")} out`}
              data-bucket={b.key}
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 3,
                background: on ? "var(--el)" : "transparent",
                border: "none",
                borderRadius: 7,
                padding: "4px 1px 0",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
                {showRevenue ? <span style={{ width: 6, height: `${height(b.revenue)}%`, borderRadius: "2px 2px 0 0", background: GREEN }} /> : null}
                {showExpenses ? <span style={{ width: 6, height: `${height(b.expenses)}%`, borderRadius: "2px 2px 0 0", background: RED }} /> : null}
              </span>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: on ? "var(--text)" : SUB, whiteSpace: "nowrap" }}>{bucketTickOf(b.key, period)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
