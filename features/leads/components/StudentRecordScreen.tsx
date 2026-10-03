import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { ProgressBar, SpentOn, expiryWords, unitWord } from "@/features/memberships/components/usage-kit";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { RoutineMediaButton } from "@/features/routines/components/routine-kit";
import { ToolBody, ToolCard, ToolChip, ToolFace, ToolFacts, ToolLive, ToolTitle, inkOn } from "@/components/ui/ToolCard";
import { photoUrl } from "@/lib/media/photo";
import { FigureHead } from "@/components/ui/FigureHead";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import type { StudentRecord } from "@/repositories/studentRecord";

/** ONE STUDENT, FROM THIS STUDIO'S OR THIS ARTIST'S SIDE (3 Oct 2026, the user:
 *  *"Students should also have a stats Button next to profile which should give
 *  detail students stats from that artist or Studio … another button called
 *  membership which shows membership details and usage of that particular
 *  student"*).
 *
 *  ONE PAGE, TWO SEGMENTS — Stats · Membership — because the two buttons on the
 *  student's card are two questions about ONE person here, and a segment is how
 *  this app puts two views of one subject side by side (the Crews and Studios
 *  hubs, the Practice screen). The card's Stats button opens `?show=stats`, its
 *  Membership button `?show=membership`.
 *
 *  ⚠ EVERY FIGURE IS THIS BUSINESS'S ONLY. What somebody danced elsewhere is
 *  their own Stats page's — a studio reading it would be reading their record at
 *  a competitor. */

const TINT = DOS_TOOLS.students.c;

const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };

const dateWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const dayWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const hoursWords = (min: number) => {
  const h = min / 60;
  return h === 0 ? "0" : h < 10 ? (Math.round(h * 10) / 10).toString() : String(Math.round(h));
};

function Section({ title, figure, children }: { title: string; figure?: ReactNode; children: ReactNode }) {
  return (
    <div style={panel}>
      <FigureHead margin="0 0 10px" title={<span style={head}>{title}</span>} figure={figure == null ? undefined : <span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>{figure}</span>} />
      {children}
    </div>
  );
}

/** THE LAST SIX MONTHS — one series, one hue, thin bars rounded at the data end
 *  and anchored to the baseline. Each bar names its own month and count (the
 *  hover tooltip and the accessible name), and the month words sit under the
 *  bars in ink, never in the bar's colour. */
function MonthsChart({ months }: { months: StudentRecord["months"] }) {
  const max = Math.max(1, ...months.map((m) => m.n));
  return (
    <div role="list" aria-label="Sessions attended in each of the last six months" style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "0 2px" }}>
      {months.map((m) => {
        const h = Math.round((m.n / max) * 84);
        return (
          <div key={m.key} role="listitem" title={`${m.label}: ${m.n} ${m.n === 1 ? "session" : "sessions"}`} aria-label={`${m.label}: ${m.n} ${m.n === 1 ? "session" : "sessions"}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: m.n ? INK : MUTED, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>{m.n}</span>
            <span style={{ width: "100%", maxWidth: 26, height: Math.max(m.n ? 6 : 2, h), borderRadius: "4px 4px 0 0", background: m.n ? TINT : "var(--el)" }} />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, marginTop: 5, borderTop: "1.5px solid var(--el)", width: "100%", textAlign: "center", paddingTop: 4 }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatsPanel({ r }: { r: StudentRecord }) {
  const counted = r.attended + r.missed;
  const rate = counted > 0 ? Math.round((r.attended / counted) * 100) : null;
  const styleMax = Math.max(1, ...r.styles.map((s) => s.n));
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={TINT}
          items={[
            { label: "Attended", value: r.attended, testId: "student-attended" },
            { label: "Hours", value: hoursWords(r.minutes) },
            { label: "Turn-up", value: rate == null ? "—" : `${rate}%`, tint: rate == null ? undefined : rate >= 75 ? "#22C55E" : rate >= 50 ? "#F59E0B" : "#F87171" },
          ]}
        />
        <ToolFacts
          tint={TINT}
          style={{ marginTop: 6 }}
          items={[
            { label: "Upcoming", value: r.upcoming },
            { label: "Missed", value: r.missed },
            { label: "Cancelled", value: r.cancelled },
          ]}
        />
        {/* ⚠ FIRST AND LAST CLASS IN BOXES (4 Oct 2026, the user: "first class
            and last class with dates in boxes") — they were a sentence under the
            figures. A "—" says there is none yet rather than hiding the box. */}
        <ToolFacts
          tint={TINT}
          style={{ marginTop: 6 }}
          items={[
            { label: "First class", value: r.firstAt ? dateWords(r.firstAt) : "—", testId: "student-first-class" },
            { label: "Last class", value: r.lastAt ? dateWords(r.lastAt) : "—", testId: "student-last-class" },
          ]}
        />
      </div>

      <Section title="LAST 6 MONTHS" figure={r.months.reduce((s, m) => s + m.n, 0)}>
        <MonthsChart months={r.months} />
      </Section>

      <Section title="WHAT THEY DANCE HERE" figure={r.styles.length}>
        {r.styles.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB }}>Nothing danced here yet.</div>
        ) : (
          r.styles.map((s) => (
            <div key={s.style} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.style}</span>
              <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${Math.round((s.n / styleMax) * 100)}%`, height: "100%", borderRadius: 999, background: TINT }} />
              </span>
              <span style={{ flexShrink: 0, minWidth: 54, textAlign: "right", fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                {s.n} {s.n === 1 ? "class" : "classes"}
              </span>
            </div>
          ))
        )}
      </Section>

      <Section title="LEARNED FROM" figure={r.teachers.length}>
        {r.teachers.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB }}>No teacher on record for the classes they took here.</div>
        ) : (
          r.teachers.map((t) => (
            <Link key={t.userId} href={`/person/${t.userId}`} aria-label={`Open ${t.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", textDecoration: "none", color: INK }}>
              <ToolFace name={t.name} photoPath={t.photoPath} tint={TINT} size={32} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <span style={{ flexShrink: 0, fontSize: 11, color: SUB }}>
                {t.n} {t.n === 1 ? "class" : "classes"}
              </span>
            </Link>
          ))
        )}
      </Section>

    </>
  );
}

/** a session's length in words — "1 h", "1.5 h", "45 min" */
const lengthWords = (min: number) => (min < 60 ? `${min} min` : `${Math.round((min / 60) * 10) / 10} h`);

const empty: CSSProperties = { ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.55 };

/** CLASSES — the first column (4 Oct 2026, the user: "classes- should have artist
 *  name and pic with totals for session and hours and dance styles count,
 *  routines count- on collapse should show break up of classes and routine links
 *  in collapsible tile for a class figures in every section").
 *
 *  THE COLUMN'S FIGURES FIRST — sessions, hours, styles, routines, counted off the
 *  same rows the tiles under them print. Then one tile per class: who took it
 *  (their face and name, a door to their page), its own sessions, hours and
 *  routines, and a native `<details>` holding the BREAKUP — every session they
 *  were checked in to, and each routine the class teaches with its song and video.
 *  ⚠ The tile still opens the class; the artist row and the disclosure switch
 *  pointer events back on (`ToolLive`), the stretched-link rule since 15 Sep. */
function ClassesPanel({ r }: { r: StudentRecord }) {
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={TINT}
          items={[
            { label: "Sessions", value: r.attended, testId: "student-classes-sessions" },
            { label: "Hours", value: hoursWords(r.minutes) },
            { label: "Styles", value: r.styles.length, testId: "student-classes-styles" },
            { label: "Routines", value: r.routines.length, testId: "student-classes-routines" },
          ]}
        />
      </div>
      {r.classes.length === 0 ? <div style={empty}>A class appears here once {r.name} is checked in to it.</div> : null}
      {r.classes.map((c) => {
        const level = DOS_LEVEL_LABEL[c.level] ?? c.level;
        const col = dosStyleColor(c.style);
        return (
          <ToolCard key={c.classId} testId="student-class" href={`/c/${c.shareSlug}`} hrefLabel={`Open ${c.style} · ${level}`} edge={col}>
            <ToolBody style={{ borderTop: "none" }}>
              <ToolTitle after={<span style={{ flexShrink: 0, fontSize: 11, color: SUB, fontWeight: 700 }}>{dayWords(c.lastAt)}</span>}>
                {c.style} · {level}
              </ToolTitle>
              {c.artist ? (
                <ToolLive style={{ marginTop: 8 }}>
                  <Link href={`/person/${c.artist.userId}`} aria-label={`Open ${c.artist.name}'s profile`} data-testid="student-class-artist" style={{ display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%", color: INK, textDecoration: "none" }}>
                    <ToolFace name={c.artist.name} photoPath={c.artist.photoPath} tint={col} size={30} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: MUTED, textTransform: "uppercase" }}>Artist</span>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.artist.name}</span>
                    </span>
                  </Link>
                </ToolLive>
              ) : (
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 8 }}>No artist on record for this class.</div>
              )}
              <ToolFacts
                tint={col}
                style={{ marginTop: 10 }}
                items={[
                  { label: "Sessions", value: c.sessions },
                  { label: "Hours", value: hoursWords(c.minutes) },
                  { label: "Routines", value: c.routines.length },
                ]}
              />
              <ToolLive style={{ marginTop: 10 }}>
                <details data-testid="student-class-breakup" style={{ border: "1.5px solid var(--el)", borderRadius: 12, padding: "9px 11px", background: `${col}0a` }}>
                  <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 900, color: INK }}>
                    Breakup · {c.sessions} {c.sessions === 1 ? "session" : "sessions"} · {c.routines.length} {c.routines.length === 1 ? "routine" : "routines"}
                  </summary>
                  <div style={{ ...head, margin: "10px 0 4px" }}>SESSIONS</div>
                  {c.sessionList.map((s) => (
                    <div key={s.startsAt} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 11.5, borderTop: "1px dashed var(--el)" }}>
                      <span>{dayWords(s.startsAt)}</span>
                      <span style={{ color: SUB, fontVariantNumeric: "tabular-nums" }}>{lengthWords(s.minutes)}</span>
                    </div>
                  ))}
                  <div style={{ ...head, margin: "10px 0 4px" }}>ROUTINES</div>
                  {c.routines.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: SUB }}>This class teaches no routine yet.</div>
                  ) : (
                    c.routines.map((rt) => {
                      const rcol = dosStyleColor(rt.style);
                      const songHref = rt.songUrl ? (rt.songIsFile ? photoUrl(rt.songUrl) : rt.songUrl) : null;
                      return (
                        <div key={rt.routineId} data-testid="student-class-routine" style={{ padding: "7px 0", borderTop: "1px dashed var(--el)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt.title}</span>
                            <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 999, background: rcol, color: inkOn(rcol), fontSize: 9.5, fontWeight: 900 }}>{rt.style}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <RoutineMediaButton kind="song" href={songHref} word={rt.songIsFile && !rt.songTitle ? "MP3" : "Song"} title={rt.title} col={rcol} extra={{ padding: "7px 10px", fontSize: 11 }} />
                            <RoutineMediaButton kind="video" href={rt.videoUrl} word="Video" title={rt.title} col={rcol} extra={{ padding: "7px 10px", fontSize: 11 }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </details>
              </ToolLive>
            </ToolBody>
          </ToolCard>
        );
      })}
    </>
  );
}

/** EARNINGS — the fourth column (4 Oct 2026, the user: "remove routines from
 *  column and replace with earnings from this student"). What this business took
 *  from this one person: the figures, where it came from, and every payment.
 *  ⚠ Online money only — an enquiry's advance recorded by hand at the desk has
 *  no payment row, so it is on the Earnings desk and not here, and the line under
 *  the figures says so rather than letting a short total read as the whole. */
function EarningsPanel({ r, businessName }: { r: StudentRecord; businessName: string }) {
  const e = r.earnings;
  const kinds = ([
    ["class", "Classes"],
    ["membership", "Memberships"],
    ["enquiry", "Enquiries"],
    ["other", "Other"],
  ] as const).filter(([k]) => e.byKind[k] > 0);
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={TINT}
          items={[
            { label: "Came in", value: rupees(e.cameInInr), testId: "student-earned" },
            { label: "Refunded", value: rupees(e.refundedInr), tint: e.refundedInr > 0 ? "#F87171" : undefined },
            { label: "Net", value: rupees(e.netInr), tint: "#22C55E" },
          ]}
        />
        <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginTop: 9 }}>
          {e.complete ? `Paid to ${businessName} online` : `Counting the latest ${e.payments.length} payments only`} · money recorded by hand is on the Earnings desk.
        </div>
      </div>

      {kinds.length > 0 ? (
        <Section title="WHERE IT CAME FROM" figure={kinds.length}>
          {kinds.map(([k, label]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
              <span style={{ fontWeight: 800 }}>{label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{rupees(e.byKind[k])}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {e.payments.length === 0 ? (
        <div style={empty}>{r.name} has not paid {businessName} anything online yet.</div>
      ) : (
        <Section title="PAYMENTS" figure={e.payments.length}>
          {e.payments.map((p) => {
            const body = (
              <>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.what}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>
                    {dateWords(p.paidAt)}
                    {p.method ? ` · ${p.method.toUpperCase()}` : ""}
                    {p.refundedInr > 0 ? ` · ${p.refundedInr >= p.amountInr ? "refunded" : `${rupees(p.refundedInr)} refunded`}` : ""}
                  </span>
                </span>
                <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: p.refundedInr >= p.amountInr && p.amountInr > 0 ? MUTED : INK }}>{rupees(p.amountInr)}</span>
              </>
            );
            const row: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px dashed var(--el)", color: INK, textDecoration: "none" };
            return p.href ? (
              <Link key={p.id} href={p.href} data-testid="student-payment" style={row}>
                {body}
              </Link>
            ) : (
              <div key={p.id} data-testid="student-payment" style={row}>
                {body}
              </div>
            );
          })}
        </Section>
      )}
    </>
  );
}

function MembershipPanel({ r, businessName }: { r: StudentRecord; businessName: string }) {
  if (r.passes.length === 0) {
    return (
      <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.55 }}>
        {r.name} holds none of {businessName}&rsquo;s memberships.
      </div>
    );
  }
  /* the column's figures (4 Oct 2026, "figures in every section") — off the same
     passes the cards below draw */
  const active = r.passes.filter((p) => p.status === "active" && !p.expired);
  const paid = r.passes.filter((p) => p.status !== "pending_payment" && p.status !== "cancelled").reduce((s, p) => s + p.priceInr, 0);
  const left = active.reduce((s, p) => s + Math.max(0, p.unitsTotal - p.unitsUsed), 0);
  return (
    <>
      <div style={panel}>
        <ToolFacts
          tint={TINT}
          items={[
            { label: "Held", value: r.passes.length },
            { label: "Active", value: active.length, tint: active.length > 0 ? "#22C55E" : undefined },
            { label: "Left", value: Math.round(left * 10) / 10 },
            { label: "Paid", value: rupees(paid) },
          ]}
        />
      </div>
      {r.passes.map((p) => {
        const unpaid = p.status === "pending_payment";
        const expired = p.status === "active" && p.expired;
        const word = unpaid ? "UNPAID" : expired ? "EXPIRED" : p.status === "used_up" ? "USED UP" : p.status === "cancelled" ? "CANCELLED" : "ACTIVE";
        const live = p.status === "active" && !expired;
        const until = expiryWords(p);
        return (
          /* the card opens the membership's own details — its holders and classes */
          <ToolCard key={p.passId} testId="student-pass" href={`/memberships/${p.membershipId}`} hrefLabel={`${p.name} — membership details`}>
            <ToolBody style={{ borderTop: "none" }}>
              <ToolTitle kicker="Membership" after={<ToolChip word={word} fg={live ? "#22C55E" : unpaid ? "#F59E0B" : expired ? "#F87171" : SUB} bg={live ? "#22C55E1c" : unpaid ? "#F59E0B1c" : expired ? "#F871711c" : "var(--el)"} />}>
                {p.name}
              </ToolTitle>
              {/* what it is and what they paid, said ONCE */}
              <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginTop: 4 }}>
                {unitWord(p.unit, p.unitsTotal)}
                {unpaid ? " · not paid yet" : ` · ${p.priceInr === 0 ? "Free" : `${rupees(p.priceInr)} paid`}`}
                {p.boughtAt ? ` · ${dateWords(p.boughtAt)}` : ""}
              </div>
              {until ? <div style={{ fontSize: 11, fontWeight: 800, color: expired ? "#F87171" : SUB, marginTop: 3 }}>{until.charAt(0).toUpperCase() + until.slice(1)}</div> : null}
              {unpaid ? null : (
                <>
                  <ProgressBar used={p.unitsUsed} total={p.unitsTotal} tint={TINT} unit={p.unit} testId="student-pass-progress" />
                  <SpentOn uses={p.uses} unit={p.unit} />
                </>
              )}
            </ToolBody>
          </ToolCard>
        );
      })}
    </>
  );
}

export type StudentShow = "classes" | "stats" | "membership" | "earnings";

export function StudentRecordScreen({ businessId, businessName, record, show }: { businessId: string; businessName: string; record: StudentRecord; show: StudentShow }) {
  const r = record;
  const base = `/business/${businessId}/students/${r.userId}`;
  const top = (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "4px 2px 12px" }}>
      {/* ⚠ THE PICTURE IS THE DOOR TO THEIR PROFILE (4 Oct 2026, the user:
          "remove profile button besides location as profile pic takes there") */}
      <Link href={`/person/${r.userId}`} aria-label={`Open ${r.name}'s profile`} data-testid="student-profile-link" style={{ flexShrink: 0, display: "inline-flex", textDecoration: "none" }}>
        <ToolFace name={r.name} photoPath={r.photoPath} tint={TINT} size={64} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: TINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Student · {businessName}</div>
        {/* the page's own `<h1>` — the chrome prints no drill page's name (28 Sep) */}
        <h1 style={{ margin: "2px 0 0", fontFamily: DOS_DISPLAY, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, overflowWrap: "anywhere" }}>{r.name}</h1>
        {r.city ? <div style={{ marginTop: 4, fontSize: 11.5, color: SUB }}>{r.city}</div> : null}
      </div>
    </div>
  );
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <SegmentedPanels
        /* the key is the SERVER's answer, so a link carrying `?show=` wins */
        key={show}
        initial={show}
        label="Show"
        sections
        top={top}
        /* ⚠ FOUR COLUMNS — Classes · Stats · Membership · Earnings. Routines was
           the fourth until 4 Oct 2026 (the user: "remove routines from column and
           replace with earnings from this student"); each class tile carries its
           own routines in its breakup now, and the Classes figures count them. */
        segments={[
          { key: "classes", href: `${base}?show=classes`, label: "Classes", n: r.classes.length, aria: `${r.name}'s classes here` },
          { key: "stats", href: `${base}?show=stats`, label: "Stats", aria: `${r.name}'s stats here` },
          { key: "membership", href: `${base}?show=membership`, label: "Membership", n: r.passes.length, aria: `${r.name}'s memberships here` },
          { key: "earnings", href: `${base}?show=earnings`, label: "Earnings", aria: `Earnings from ${r.name}` },
        ]}
        panels={[
          { key: "classes", node: <ClassesPanel r={r} /> },
          { key: "stats", node: <StatsPanel r={r} /> },
          { key: "membership", node: <MembershipPanel r={r} businessName={businessName} /> },
          { key: "earnings", node: <EarningsPanel r={r} businessName={businessName} /> },
        ]}
      />
    </div>
  );
}
