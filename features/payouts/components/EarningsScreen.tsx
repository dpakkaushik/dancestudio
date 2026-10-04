"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
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
      {/* the rule between the heading and its figure (22 Sep 2026) — it was
          `justify-content: space-between`, so on a phone REVENUE and the number
          sat at opposite edges with a hand's width of nothing between them */}
      <FigureHead
        margin={`0 0 ${lines.length ? 10 : 0}px`}
        title={<span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" }}>{title}</span>}
        figure={
          <b style={{ fontSize: 17, fontWeight: 900, color: tone }} data-testid={`earn-${title.toLowerCase()}`}>
            {money(total)}
          </b>
        }
      />
      {lines.map((l) => (
        <BreakupLine key={l.key} line={l} max={max} tone={tone} />
      ))}
      {lines.length === 0 ? <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, marginTop: 6 }}>{empty}</div> : null}
    </div>
  );
}

/** ONE LINE OF A BREAKUP, AND THE ROWS BEHIND IT (2 Oct 2026, the user:
 *  "Revenue and expenses also give breakup of all parts as collapsible. should
 *  also be visible even if 0").
 *
 *  ⚠ The ROW is the disclosure now, so the desk link moved inside the opened
 *  panel — a link and a toggle cannot be the same press. A line that carried
 *  nothing in this period still opens, and says so, which is the point: you can
 *  see that DanceOS is counting it and that it was zero, rather than wondering
 *  whether it was counted at all. */
function BreakupLine({ line: l, max, tone }: { line: MoneyLine; max: number; tone: string }) {
  const [open, setOpen] = useState(false);
  const items = l.items ?? [];
  const tint = EARNING_TINT[l.key] ?? tone;
  return (
    <div style={{ marginBottom: 10 }} data-testid="earn-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${l.label} — ${money(l.amountInr)}${items.length ? `, ${items.length} ${items.length === 1 ? "entry" : "entries"}` : ""}`}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, color: INK, cursor: "pointer", font: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: l.amountInr === 0 ? SUB : INK }}>
            {l.label}
            <span style={{ color: "var(--muted)", fontWeight: 700 }}> · {items.length}</span>
          </span>
          <b style={{ flexShrink: 0, fontSize: 12.5, color: l.amountInr === 0 ? SUB : INK }}>{money(l.amountInr)}</b>
          <span aria-hidden style={{ flexShrink: 0, fontSize: 11, color: SUB, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
            ›
          </span>
        </div>
        {/* the bar is share of the BIGGEST line, so the breakup has a shape
            you can read at a glance rather than four numbers to compare */}
        <div style={{ height: 5, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 5 }}>
          <div style={{ width: `${Math.round((l.amountInr / max) * 100)}%`, height: "100%", borderRadius: 999, background: tint }} />
        </div>
      </button>
      {l.note ? <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4 }}>{l.note}</div> : null}
      {open ? (
        <div data-testid="earn-items" style={{ marginTop: 7, paddingLeft: 9, borderLeft: `2px solid ${tint}` }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, color: SUB, padding: "3px 0" }}>Nothing in this period.</div>
          ) : (
            items.map((it, i) => (
              <div key={`${it.at}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0", fontSize: 11.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--muted)" }}>{dayWords(it.at)}</span>
                <b style={{ flexShrink: 0, minWidth: 54, textAlign: "right" }}>{money(it.amountInr)}</b>
              </div>
            ))
          )}
          {l.href ? (
            <Link href={l.href} style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 800, color: SUB, textDecoration: "none" }}>
              Open the desk ›
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "2 Oct" in IST — a row's date, short enough to sit beside its amount */
const dayWords = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

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
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "8px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116): the hero and the period; the chart,
          the bucket and what is left are the middle; the breakups and whatever the
          desk adds are the lower section — Discover's and the Inbox's shapes. */}
      <DeskTop>
      {/* ⚠ THE TOOL'S OWN HERO (2 Oct 2026, the user: "better color scheme for
          all tools and headings inside their pages"). This was the one tile page
          headed by a bare 21px line while every other wears `DeskHero` in its
          tile's colour — so Earnings looked like a different app from Classes. */}
      {title === DOS_TOOLS.earn.name ? (
        <DeskHero tool="earn" as="h1" margin="0" />
      ) : (
        <h1 style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.4, margin: 0 }}>{title}</h1>
      )}
      {/* ⚠ NO LINE UNDER THE HEADING (4 Oct 2026, the user: "remove such headings
          from all tools in any profile") — `sub` is still accepted, and drawn
          only on a screen that is not the Earnings tool itself */}
      {sub && title !== DOS_TOOLS.earn.name ? <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, marginTop: 6 }}>{sub}</div> : null}

      {/* DAY · WEEK · MONTH · YEAR — the period is a LINK, so it is in the URL */}
      <div role="group" aria-label="Period" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginTop: 12 }}>
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
      </DeskTop>

      <DeskMiddle>
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

      {/* ⚠⚠ THE PROSE IS GONE (27 Sep 2026, the user: *"remove unessesary
          explanations from earnings … there should be no extra details for
          everything in the app unless things are very important"*).
          What each empty state said was WHERE money comes from, which is a
          description of the product on a screen that exists to print numbers —
          and the revenue one said it differently for a person, which is how it
          came to say the wrong thing in the first place (21 Sep). Four words
          each, and the same words for everybody.
          ⚠ The 4,000-row warning below STAYS: it is not an explanation, it is
          the one line that says a printed total is short. */}
      {/* WHAT IS LEFT — revenue minus expenses and nothing else: there is no
          DanceOS fee, no GST on a fee and no TDS rate anybody has set, so none
          is deducted. Said here rather than on the screen, which was the whole
          of what that paragraph did. ⚠ It is the middle section's headline
          figure (3 Oct 2026, C116); the two breakups it is the difference of
          open the lower section. */}
      <div style={{ ...card, marginBottom: 0, background: left < 0 ? "rgba(248,113,113,.10)" : "rgba(34,197,94,.10)", border: `1.5px solid ${left < 0 ? "#F87171" : "#22C55E"}55` }}>
        <FigureHead
          title={<span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" }}>WHAT IS LEFT</span>}
          figure={
            <b style={{ fontSize: 22, fontWeight: 900, color: left < 0 ? "#F87171" : "#22C55E" }} data-testid="earn-left">
              {money(left)}
            </b>
          }
        />
      </div>
      </DeskMiddle>

      <DeskBody>
      <Breakup title="REVENUE" lines={here.revenue} total={revenue} tone="#22C55E" empty="Nothing came in." />

      {noExpenses ? null : <Breakup title="EXPENSES" lines={here.expenses} total={expenses} tone="#F87171" empty="Nothing went out." />}

      {report.complete ? null : (
        <div role="status" style={{ ...card, fontSize: 11, color: "#F59E0B", lineHeight: 1.5 }}>
          Counting the latest 4,000 rows only — older money is not in these totals.
        </div>
      )}

      {children}
      </DeskBody>
    </div>
  );
}
