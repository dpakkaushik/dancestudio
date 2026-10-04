import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead } from "@/components/ui/ToolCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { PayHistoryExport } from "./PayHistoryExport";
import { MemberManage } from "./MemberManage";
import { TeamClassesPanel } from "./TeamClassesPanel";
import type { BusinessType } from "@/types/business";
import { DOS_UI, GREEN, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { KIND_WORD, kindOf } from "@/types/profile";
import { PERIODS, bucketKeyOf, bucketLabelOf, bucketStartIso, type Period } from "@/lib/format/month";
import { MEMBER_LABEL, MEMBER_ROLE_WORD } from "@/types/staff";
import { PAYOUT_METHOD_LABEL, payoutTone, type PersonPayHistory } from "@/types/payout";
import type { TeamMember } from "@/repositories/businesses";
import type { TeamMemberWork } from "@/repositories/teamMemberWork";

/** ONE PERSON ON ONE TEAM (3 Oct 2026, the user: *"better designed team history
 *  page according to team member card — should have payment details, artist
 *  stats and performance for that team"*). It was a ledger of payments under a
 *  44px face; it is the team member's own card, opened.
 *
 *  THE SAME THREE BANDS THE CARD ON THE TEAM DESK HAS, then three segments:
 *   · PAYMENTS — every payment with the sessions it covered (29 Sep 2026, the
 *     page's first job, kept whole), now beside what is still OWED, counted by
 *     the pay ledger's own rule;
 *   · STATS — what they have taken and assisted here, in sessions and hours, by
 *     month, by style and class by class;
 *   · PERFORMANCE — how full their rooms were and how many of the people who
 *     booked actually came. All of it attendance, never bookings (Step 25).
 *
 *  ⚠ THIS BUSINESS'S ONLY — what they teach elsewhere is their own record's.
 *  ⚠ The OWNER's alone, re-checked by the route: what somebody is paid is not a
 *  manager's to read (29 Sep 2026). */

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const pctTint = (p: number | null, good = 75, ok = 50) => (p == null ? undefined : p >= good ? "#22C55E" : p >= ok ? "#F59E0B" : "#F87171");
const hoursWords = (min: number) => {
  const h = min / 60;
  return h === 0 ? "0" : h < 10 ? (Math.round(h * 10) / 10).toString() : String(Math.round(h));
};

/* a payout's `paid_on` is a DATE — the ledger's own grammar */
const dayWords = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};
const dateWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

const TONE: Record<"done" | "transit" | "held", { word: string; ink: string; ground: string }> = {
  done: { word: "PAID", ink: GREEN, ground: "rgba(34,197,94,.16)" },
  transit: { word: "IN TRANSIT", ink: "#F59E0B", ground: "rgba(245,158,11,.16)" },
  held: { word: "ON HOLD", ink: "#F87171", ground: "rgba(248,113,113,.16)" },
};

function Section({ title, figure, children }: { title: string; figure?: ReactNode; children: ReactNode }) {
  return (
    <div style={panel}>
      <FigureHead margin="0 0 10px" title={<span style={head}>{title}</span>} figure={figure == null ? undefined : <span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>{figure}</span>} />
      {children}
    </div>
  );
}

/** a thin bar, rounded at the data end — the one bar this page draws */
function Bar({ value, max, tint }: { value: number; max: number; tint: string }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
      <span style={{ display: "block", width: `${w}%`, height: "100%", borderRadius: 999, background: tint }} />
    </span>
  );
}

function MonthsChart({ months, tint }: { months: TeamMemberWork["months"]; tint: string }) {
  const max = Math.max(1, ...months.map((m) => m.n));
  return (
    <div role="list" aria-label="Sessions taken in each of the last six months" style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "0 2px" }}>
      {months.map((m) => {
        const h = Math.round((m.n / max) * 84);
        const words = `${m.label}: ${m.n} ${m.n === 1 ? "session" : "sessions"}`;
        return (
          <div key={m.key} role="listitem" title={words} aria-label={words} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: m.n ? INK : MUTED, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>{m.n}</span>
            <span style={{ width: "100%", maxWidth: 26, height: Math.max(m.n ? 6 : 2, h), borderRadius: "4px 4px 0 0", background: m.n ? tint : "var(--el)" }} />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, marginTop: 5, borderTop: "1.5px solid var(--el)", width: "100%", textAlign: "center", paddingTop: 4 }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* one line of the breakup: a label, a sub-line, and the figure on the right */
function Line({ label, sub, value, strong, tint, testId }: { label: ReactNode; sub?: ReactNode; value: string; strong?: boolean; tint?: string; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: strong ? "7px 0 3px" : "4px 0" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: strong ? 12.5 : 11.5, fontWeight: strong ? 900 : 700, color: strong ? INK : SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {sub ? <span style={{ display: "block", fontSize: 10.5, color: MUTED, marginTop: 1 }}>{sub}</span> : null}
      </span>
      <b style={{ flexShrink: 0, fontSize: strong ? 14 : 12, fontWeight: strong ? 900 : 800, color: tint ?? INK, fontVariantNumeric: "tabular-nums" }}>{value}</b>
    </div>
  );
}

const rule: CSSProperties = { borderTop: "1.5px solid var(--el)", margin: "8px 0 2px" };

/** ⚠ ONE SECTION OF THE STATEMENT, FOLDED (4 Oct 2026, the user: "Earnings all
 *  section I mentioned should be collapsible with entries for it"). Closed by
 *  default, like every class group on this page; the head carries the section's
 *  figure and how many entries are behind it, so the statement still reads at a
 *  glance with every section shut. A native `<details>`, so it needs no state. */
/* ⚠ AND EVERY OTHER SECTION OF THE EARNINGS COLUMN FOLDS TOO (4 Oct 2026, the
   user: "all sections in earnings should be collapsible … for team member
   detail") — the key stats and the total included. `sub` replaces the count
   line where a section has no entries to count; `open` is for the key stats
   alone, which are the summary the column opens on. */
function Fold({
  title,
  figure,
  count,
  noun,
  sub,
  open,
  figureTint,
  figureTestId,
  testId,
  children,
}: {
  title: string;
  figure?: string;
  count?: number;
  noun?: [string, string];
  sub?: string;
  open?: boolean;
  figureTint?: string;
  figureTestId?: string;
  testId: string;
  children: ReactNode;
}) {
  const line = sub ?? (count != null && noun ? `${count} ${count === 1 ? noun[0] : noun[1]}` : null);
  return (
    <details data-testid={testId} className="dos-fold" open={open}>
      <summary aria-label={[title, figure, line].filter(Boolean).join(" — ")} style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...head, display: "block" }}>{title}</span>
          {line ? <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{line}</span> : null}
        </span>
        {figure ? (
          <b data-testid={figureTestId} style={{ fontSize: 13, fontWeight: 900, color: figureTint ?? INK, fontVariantNumeric: "tabular-nums" }}>
            {figure}
          </b>
        ) : null}
        <span aria-hidden="true" className="dos-fold-chev" style={{ fontSize: 12, color: MUTED, width: 14, textAlign: "center" }}>
          ▾
        </span>
      </summary>
      <div style={{ paddingBottom: 6 }}>{children}</div>
    </details>
  );
}

/* the short date the folds print — "2 Oct", IST, no year, no hour */
const sessionWords = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "");

/* ── THE PERIOD (4 Oct 2026, the user: "there should be a time period filter
   above the stats boxes in earnings and a part of that section") ─────────
   The main Earnings desk's own words (Day · Week · Month · Year = the CURRENT
   one, IST) plus All, in the URL as `?period=`. A payment and a refund fall in
   the period they MOVED, a payout on its `paid_on` day, an owed session on the
   day it ran. ⚠ The clock is read in a module-level helper (react-hooks/purity). */
export type EarnPeriod = "all" | Period;
const EARN_PERIODS: ReadonlyArray<readonly [EarnPeriod, string]> = [["all", "All"], ...PERIODS];
export const parseEarnPeriod = (v: string | undefined): EarnPeriod => (v === "day" || v === "week" || v === "month" || v === "year" ? v : "all");
function periodWindow(period: EarnPeriod): { startMs: number | null; startDay: string | null; label: string } {
  if (period === "all") return { startMs: null, startDay: null, label: "All time" };
  const key = bucketKeyOf(new Date().toISOString(), period);
  const startIso = bucketStartIso(key, period);
  return { startMs: new Date(startIso).getTime(), startDay: startIso.slice(0, 10), label: bucketLabelOf(key, period) };
}

/* ── EARNINGS ─────────────────────────────────────────────────────────── */
/** ⚠ WHAT THIS PERSON EARNS THE TEAM (4 Oct 2026, the user: "Team member detail
 *  payment section should be renamed as Earnings — should show key stats on top
 *  and give break up first revenue for the team then break up of what was paid
 *  to them and what is still owed by them — whatever left is the Total
 *  earnings"). One statement, in that order:
 *    REVENUE  — what came in on the sessions they took here, less refunds
 *    − PAID TO THEM  — every payment recorded to them, settled and in transit
 *    − STILL OWED  — sessions taken and not paid yet, at each class's rate
 *    = TOTAL EARNINGS  — what is left for the team.
 *  ⚠ "Paid" is every payment to them on this team, including an amount recorded
 *  against no session (R35) — that is money out for them, so it comes off. */
function EarningsPanel({
  history: allHistory,
  work: allWork,
  personName,
  businessName,
  tint,
  period,
  base,
}: {
  history: PersonPayHistory;
  work: TeamMemberWork;
  personName: string;
  businessName: string;
  tint: string;
  period: EarnPeriod;
  base: string;
}) {
  /* the statement, narrowed to the period — every figure is summed off the same
     entries the sections list, so a figure and its list cannot disagree */
  const win = periodWindow(period);
  const inWin = (iso: string) => win.startMs == null || new Date(iso).getTime() >= win.startMs;
  const payoutsIn = win.startDay == null ? allHistory.payouts : allHistory.payouts.filter((p) => p.paidOn.slice(0, 10) >= win.startDay!);
  const history: PersonPayHistory =
    period === "all"
      ? allHistory
      : {
          ...allHistory,
          payouts: payoutsIn,
          paidInr: payoutsIn.filter((p) => p.status === "done").reduce((a, p) => a + p.amountInr, 0),
          pendingInr: payoutsIn.filter((p) => p.status !== "done").reduce((a, p) => a + p.amountInr, 0),
        };
  const revIn = allWork.revenueEntries.filter((e) => inWin(e.at));
  const owedIn = allWork.owedEntries.filter((e) => inWin(e.startsAt));
  const work: TeamMemberWork =
    period === "all"
      ? allWork
      : {
          ...allWork,
          revenueEntries: revIn,
          owedEntries: owedIn,
          revenueGrossInr: revIn.filter((e) => e.kind === "payment").reduce((a, e) => a + e.amountInr, 0),
          revenueRefundedInr: revIn.filter((e) => e.kind === "refund").reduce((a, e) => a + e.amountInr, 0),
          owedInr: owedIn.reduce((a, e) => a + e.rateInr, 0),
          owedSessions: owedIn.length,
        };
  const last = history.payouts[0]?.paidOn ?? null;
  const revenue = work.revenueGrossInr - work.revenueRefundedInr;
  const paid = history.paidInr + history.pendingInr;
  const total = revenue - paid - work.owedInr;
  const minus = (v: number) => (v > 0 ? `− ${rupees(v)}` : rupees(0));
  const totalWords = total < 0 ? `− ${rupees(-total)}` : rupees(total);
  const totalTint = total > 0 ? GREEN : total < 0 ? "#F87171" : undefined;
  const settledCount = history.payouts.filter((p) => payoutTone(p.status) === "done").length;
  return (
    <>
      {/* KEY STATS — the four figures of the statement, then the ledger's own;
          folded like the rest, and the one section that starts OPEN */}
      <div style={{ ...panel, padding: "5px 14px" }}>
        <Fold title="KEY STATS" sub={win.label} open testId="team-fold-stats">
        {/* ALL · DAY · WEEK · MONTH · YEAR — a link, so it is in the URL */}
        <div role="group" aria-label="Period" data-testid="team-period" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 10 }}>
          {EARN_PERIODS.map(([p, label]) => {
            const on = period === p;
            return (
              <Link
                key={p}
                href={p === "all" ? `${base}?show=earnings` : `${base}?show=earnings&period=${p}`}
                replace
                scroll={false}
                aria-current={on ? "true" : undefined}
                style={{ flex: 1, textAlign: "center", padding: "7px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? "var(--solid)" : "transparent", color: on ? INK : SUB }}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <ToolFacts
          tint={tint}
          items={[
            { label: "Revenue", value: rupees(revenue), testId: "team-revenue" },
            { label: "Paid them", value: rupees(paid), testId: "team-paid" },
            { label: "Still owed", value: rupees(work.owedInr), tint: work.owedInr > 0 ? "#F59E0B" : undefined, testId: "team-owed" },
          ]}
        />
        <ToolFacts
          tint={tint}
          style={{ marginTop: 6 }}
          items={[
            { label: "Total earnings", value: totalWords, tint: totalTint, testId: "team-total-earnings" },
            { label: history.payouts.length === 1 ? "Payment" : "Payments", value: history.payouts.length },
            { label: "Last paid", value: last ? dayWords(last).replace(/ \d{4}$/, "") : "—" },
          ]}
        />
        {/* ⚠ A CAPPED READ SAYS SO (21 Sep 2026) */}
        {!history.complete || !work.complete ? <div style={{ fontSize: 10.5, color: "#F59E0B", marginTop: 8, lineHeight: 1.45 }}>Counting the latest 4,000 rows only — the figures above may be short.</div> : null}
        </Fold>
      </div>

      {/* THE BREAKUP, in the user's own order — each section folded onto its
          entries (4 Oct 2026), the total folded onto its own sum */}
      <div style={panel} data-testid="team-earnings-breakup">
        <Fold title="REVENUE FOR THE TEAM" figure={rupees(revenue)} count={work.revenueEntries.length} noun={["entry", "entries"]} testId="team-fold-revenue">
          {work.revenueEntries.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB }}>Nothing yet.</div>
          ) : (
            work.revenueEntries.map((e) => (
              <Line
                key={e.id}
                testId={e.kind === "refund" ? "team-revenue-refund" : "team-revenue-entry"}
                label={e.kind === "refund" ? `Refund · ${e.classTitle}` : e.classTitle}
                sub={[e.payerName, e.sessionAt ? sessionWords(e.sessionAt) : null, e.method ? e.method.replace(/_/g, " ").toUpperCase() : null].filter(Boolean).join(" · ") || undefined}
                value={e.kind === "refund" ? minus(e.amountInr) : rupees(e.amountInr)}
                tint={e.kind === "refund" ? "#F87171" : undefined}
              />
            ))
          )}
          {work.revenueRefundedInr > 0 ? (
            <div style={{ ...rule, marginTop: 6 }}>
              <Line label="In" value={rupees(work.revenueGrossInr)} />
              <Line label="Refunded" value={minus(work.revenueRefundedInr)} />
            </div>
          ) : null}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>Membership seats not included.</div>
        </Fold>

        <div style={rule} />
        <Fold title="PAID TO THEM" figure={minus(paid)} count={history.payouts.length} noun={["payment", "payments"]} testId="team-fold-paid">
          {history.payouts.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
              Nothing paid yet.
            </div>
          ) : (
            <>
              <Line label="Settled" sub={`${settledCount} of ${history.payouts.length} ${history.payouts.length === 1 ? "payment" : "payments"}`} value={rupees(history.paidInr)} testId="team-settled" />
              {history.pendingInr > 0 ? <Line label="In transit" value={rupees(history.pendingInr)} /> : null}
              {history.payouts.map((p) => {
                const tone = TONE[payoutTone(p.status)];
                return (
                  <div key={p.id} data-testid="team-payment" style={{ borderTop: "1.5px solid var(--el)", marginTop: 6, paddingTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: "block", fontSize: 14, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>{rupees(p.amountInr)}</b>
                        <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
                          {dayWords(p.paidOn).replace(/ \d{4}$/, "")} · {PAYOUT_METHOD_LABEL[p.method]}
                        </span>
                      </span>
                      <ToolChip word={tone.word} fg={tone.ink} bg={tone.ground} />
                    </div>
                    {p.providerRef ? <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>Reference {p.providerRef}</div> : null}
                    {p.note ? <div style={{ fontSize: 12, marginTop: 5 }}>{p.note}</div> : null}
                    {/* WHAT IT COVERED — the half the desk's card only counts */}
                    {p.sessions.length > 0 ? (
                      <div style={{ marginTop: 6 }}>
                        {p.sessions.map((s) => (
                          <div key={s.sessionId} style={{ display: "flex", gap: 10, padding: "2px 0", fontSize: 11 }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: SUB }}>
                              {s.classTitle}
                              {s.startsAt ? ` · ${sessionWords(s.startsAt)}` : ""}
                            </span>
                            <b style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{rupees(s.rateInr)}</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ⚠ NOT AN EMPTY LIST — `record_team_payment` writes a payout with
                         no session lines ON PURPOSE (19 Sep 2026, R35) */
                      <div style={{ fontSize: 10.5, color: SUB, marginTop: 5 }}>Not against sessions.</div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </Fold>

        <div style={rule} />
        <Fold title="STILL OWED TO THEM" figure={minus(work.owedInr)} count={work.owedEntries.length} noun={["session", "sessions"]} testId="team-fold-owed">
          {work.owedEntries.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB }}>All paid up.</div>
          ) : (
            work.owedEntries.map((e) => <Line key={e.sessionId} label={e.classTitle} sub={sessionWords(e.startsAt)} value={rupees(e.rateInr)} testId="team-owed-entry" />)
          )}
        </Fold>

        <div style={{ ...rule, borderTopWidth: 2 }} />
        {/* the total folds onto its own arithmetic */}
        <Fold title="TOTAL EARNINGS" sub="Revenue − paid − owed" figure={totalWords} figureTint={totalTint} figureTestId="team-total-figure" testId="team-total-line">
          <Line label="Revenue" value={rupees(revenue)} />
          <Line label="Paid to them" value={minus(paid)} />
          <Line label="Still owed" value={minus(work.owedInr)} />
          <Line label="Total earnings" value={totalWords} strong tint={totalTint} />
        </Fold>
      </div>

      {/* one line per SESSION — the only screen that knows which (29 Sep 2026) */}
      <PayHistoryExport personName={personName} businessName={businessName} payouts={history.payouts} />
    </>
  );
}

/* ── STATS ───────────────────────────────────────────────────────────── */
function StatsPanel({ work, tint }: { work: TeamMemberWork; tint: string }) {
  const styleMax = Math.max(1, ...work.styles.map((s) => s.n));
  const turnUp = pct(work.dancers, work.booked);
  /* ⚠ ROOM FULL IS BOOKED OVER CAPACITY (4 Oct 2026) — the Classes section's
     bar measures the same thing, so one word means one figure on this page */
  const fill = pct(work.booked, work.seats);
  /* ⚠ THE TOP SECTION SAYS EACH FIGURE ONCE (4 Oct 2026, the user: "stats- top
     section should not have repeated figures, first class and last class
     mentioned in top part of stats"). Gone: Dancers in (the card above says
     it), the class and style counts (the Classes section and the style list
     below are those), Per session and Visits each (the same dancers, divided).
     First class and Last class LEAD, as boxes. */
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={tint}
          items={[
            { label: "First class", value: work.firstAt ? dateWords(work.firstAt) : "—", testId: "team-first-class" },
            { label: "Last class", value: work.lastAt ? dateWords(work.lastAt) : "—", testId: "team-last-class" },
          ]}
        />
        <ToolFacts
          tint={tint}
          style={{ marginTop: 6 }}
          items={[
            { label: "Took", value: work.taught, testId: "team-taught" },
            { label: "Assisted", value: work.assisted, testId: "team-assisted" },
            { label: "Hours", value: hoursWords(work.minutes) },
          ]}
        />
        <ToolFacts
          tint={tint}
          style={{ marginTop: 6 }}
          items={[
            { label: "People", value: work.distinctDancers },
            { label: "Turn-up", value: turnUp == null ? "—" : `${turnUp}%`, tint: pctTint(turnUp) },
            { label: "Room full", value: fill == null ? "—" : `${fill}%`, tint: pctTint(fill, 70, 40) },
          ]}
        />
      </div>

      <Section title="LAST 6 MONTHS" figure={work.months.reduce((s, m) => s + m.n, 0)}>
        <MonthsChart months={work.months} tint={tint} />
      </Section>

      <Section title="WHAT THEY TEACH HERE" figure={work.styles.length}>
        {work.styles.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB }}>Nothing yet.</div>
        ) : (
          work.styles.map((s) => (
            <div key={s.style} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.style}</span>
              <Bar value={s.n} max={styleMax} tint={tint} />
              <span style={{ flexShrink: 0, minWidth: 64, textAlign: "right", fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                {s.n} {s.n === 1 ? "session" : "sessions"}
              </span>
            </div>
          ))
        )}
      </Section>
    </>
  );
}

export type TeamMemberShow = "earnings" | "stats" | "classes";

export function TeamMemberPage({
  businessId,
  businessName,
  businessType,
  member,
  history,
  work,
  show,
  period = "all",
  meUserId,
  principalOwnerId,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  member: TeamMember;
  history: PersonPayHistory;
  work: TeamMemberWork;
  show: TeamMemberShow;
  period?: EarnPeriod;
  meUserId: string;
  principalOwnerId: string | null;
}) {
  const L = MEMBER_LABEL[member.role];
  /* ⚠ THE PAGE WEARS THE TEAM TOOL'S COLOUR (4 Oct 2026, the user: "all team
     member cards and member detail pages should have Team member color theme
     cards and buttons") — the role keeps its own colour on the eyebrow alone */
  const tint = DOS_TOOLS.team.c;
  const base = `/business/${businessId}/staff/${member.userId}`;
  /* THE TEAM MEMBER'S OWN CARD, OPENED — the same three bands as their card on
     the Team desk, so the press and the page read as one object */
  const top = (
    <>
      {/* ⚠ NOTHING BETWEEN THE HEADING AND THE CARD (4 Oct 2026, the user) */}
      <DeskHero tool="team" as="h1" margin="0 0 12px" />
      {/* no bold line on the left (4 Oct 2026) */}
      <ToolCard testId="team-member">
        <ToolHead
          tint={tint}
          eyebrowTint={L.colour}
          name={member.name}
          photoPath={member.avatarPath}
          href={`/person/${member.userId}`}
          hrefLabel={`${member.name} — their profile`}
          eyebrow={`${MEMBER_ROLE_WORD[member.role]} · ${KIND_WORD[kindOf(member.isArtist)]}`}
          /* the city alone, like the Team desk's own card (4 Oct 2026, the user:
             "remove dance style from under artist name in team detail page") */
          sub={member.city || null}
          size={64}
          /* ⚠ MANAGE IS A PILL ON THE TOP RIGHT HERE (4 Oct 2026, the user:
             "Remove manage button from card and shift inside history page on
             top right as a pill") — their role, their permissions, Remove */
          right={<MemberManage businessId={businessId} businessType={businessType} member={member} meUserId={meUserId} principalOwnerId={principalOwnerId} tint={tint} />}
        />
        <ToolBody>
          {/* ⚠ CLASSES, NOT SESSIONS (4 Oct 2026): Took and Assisted under Stats
              add up to the sessions, so the card says the one thing nothing
              below repeats */}
          <ToolFacts
            tint={tint}
            items={[
              { label: work.classes.length === 1 ? "Class" : "Classes", value: work.classes.length, testId: "team-class-count" },
              { label: "Dancers in", value: work.dancers, testId: "team-dancers" },
              { label: "Paid", value: rupees(history.paidInr) },
            ]}
          />
        </ToolBody>
        {/* ⚠ NO PROFILE, NO BACK TO THE TEAM (4 Oct 2026, the user) — the face and
            the name above are the door to their profile, and back is back */}
      </ToolCard>
    </>
  );
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ NO COUNTERS ON THE COLUMNS (4 Oct 2026, the user: "columns should not
          have counters") */}
      <SegmentedPanels
        key={show}
        initial={show}
        label="Show"
        sections
        top={top}
        segments={[
          { key: "earnings", href: `${base}?show=earnings`, label: "Earnings", aria: `What ${member.name} earns the team` },
          { key: "stats", href: `${base}?show=stats`, label: "Stats", aria: `${member.name}'s stats here` },
          { key: "classes", href: `${base}?show=classes`, label: "Classes", aria: `${member.name}'s classes here` },
        ]}
        panels={[
          { key: "earnings", node: <EarningsPanel history={history} work={work} personName={member.name} businessName={businessName} tint={tint} period={period} base={base} /> },
          { key: "stats", node: <StatsPanel work={work} tint={tint} /> },
          {
            key: "classes",
            node: <TeamClassesPanel classes={work.classes} tint={tint} memberName={member.name} businessName={businessName} isStudio={businessType === "studio"} />,
          },
        ]}
      />
    </div>
  );
}
