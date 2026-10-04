import type { CSSProperties, ReactNode } from "react";

import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, ToolTitle } from "@/components/ui/ToolCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { PayHistoryExport } from "./PayHistoryExport";
import { MemberManage } from "./MemberManage";
import { TeamClassesPanel } from "./TeamClassesPanel";
import type { BusinessType } from "@/types/business";
import { DOS_UI, GREEN, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { KIND_WORD, kindOf } from "@/types/profile";
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
const whenWords = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
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

/* ── PAYMENTS ─────────────────────────────────────────────────────────── */
function PaymentsPanel({ history, work, personName, businessName, tint }: { history: PersonPayHistory; work: TeamMemberWork; personName: string; businessName: string; tint: string }) {
  const last = history.payouts[0]?.paidOn ?? null;
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={tint}
          items={[
            { label: "Settled", value: rupees(history.paidInr), testId: "team-settled" },
            { label: "Not landed", value: rupees(history.pendingInr) },
            { label: "Still owed", value: rupees(work.owedInr), tint: work.owedInr > 0 ? "#F59E0B" : undefined, testId: "team-owed" },
          ]}
        />
        <ToolFacts
          tint={tint}
          style={{ marginTop: 6 }}
          items={[
            { label: history.payouts.length === 1 ? "Payment" : "Payments", value: history.payouts.length },
            { label: "Sessions paid", value: history.sessionsPaid },
            { label: "Last paid", value: last ? dayWords(last).replace(/ \d{4}$/, "") : "—" },
          ]}
        />
        {/* what OWED means, in one line — the pay ledger's rule, so the two agree */}
        <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginTop: 10 }}>
          {work.owedSessions > 0 ? (
            <>
              {work.owedSessions} {work.owedSessions === 1 ? "session" : "sessions"} taken and not paid yet, at each class&rsquo;s own rate.
            </>
          ) : (
            "Every session they have taken here at a rate is paid."
          )}
        </div>
        {/* ⚠ A CAPPED READ SAYS SO (21 Sep 2026) */}
        {!history.complete || !work.complete ? <div style={{ fontSize: 10.5, color: "#F59E0B", marginTop: 8, lineHeight: 1.45 }}>Counting the latest 4,000 rows only — the figures above may be short.</div> : null}
      </div>

      <FigureHead
        margin="4px 2px 10px"
        title={<span style={head}>PAYMENTS</span>}
        figure={<span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>{history.payouts.length}</span>}
      />

      {history.payouts.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.5 }}>
          Nothing paid to {personName} yet.
          <br />
          Record one with Pay on their card on the Team desk.
        </div>
      ) : null}

      {history.payouts.map((p) => {
        const tone = TONE[payoutTone(p.status)];
        return (
          <ToolCard key={p.id} testId="team-payment">
            <ToolBody style={{ borderTop: "none" }}>
              <ToolTitle kicker={`${dayWords(p.paidOn)} · ${PAYOUT_METHOD_LABEL[p.method]}`} after={<ToolChip word={tone.word} fg={tone.ink} bg={tone.ground} />}>
                {rupees(p.amountInr)}
              </ToolTitle>
              {p.providerRef ? <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>Reference {p.providerRef}</div> : null}
              {p.note ? <div style={{ fontSize: 12, marginTop: 6 }}>{p.note}</div> : null}
              {/* WHAT IT COVERED — the half the desk's card only counts */}
              {p.sessions.length > 0 ? (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1.5px solid var(--el)" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: MUTED, marginBottom: 5 }}>
                    {p.sessions.length} {p.sessions.length === 1 ? "SESSION" : "SESSIONS"}
                  </div>
                  {p.sessions.map((s) => (
                    <div key={s.sessionId} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 11.5 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.classTitle}
                        <span style={{ color: SUB }}>{s.startsAt ? ` · ${whenWords(s.startsAt)}` : ""}</span>
                      </span>
                      <b style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{rupees(s.rateInr)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                /* ⚠ NOT AN EMPTY LIST — `record_team_payment` writes a payout with
                   no session lines ON PURPOSE (19 Sep 2026, R35) */
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 7 }}>Not against sessions — recorded as an amount.</div>
              )}
            </ToolBody>
          </ToolCard>
        );
      })}

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

export type TeamMemberShow = "payments" | "stats" | "classes";

export function TeamMemberPage({
  businessId,
  businessName,
  businessType,
  member,
  history,
  work,
  show,
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
          { key: "payments", href: `${base}?show=payments`, label: "Payments", aria: `What ${member.name} has been paid` },
          { key: "stats", href: `${base}?show=stats`, label: "Stats", aria: `${member.name}'s stats here` },
          { key: "classes", href: `${base}?show=classes`, label: "Classes", aria: `${member.name}'s classes here` },
        ]}
        panels={[
          { key: "payments", node: <PaymentsPanel history={history} work={work} personName={member.name} businessName={businessName} tint={tint} /> },
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
