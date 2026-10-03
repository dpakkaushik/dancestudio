import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { ProgressBar, SpentOn, expiryWords, unitWord } from "@/features/memberships/components/usage-kit";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { ToolBody, ToolCard, ToolChip, ToolFace, ToolFacts, ToolTitle, inkOn } from "@/components/ui/ToolCard";
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
        <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginTop: 10 }}>
          {r.firstAt ? (
            <>
              First class <b style={{ color: INK }}>{dateWords(r.firstAt)}</b>
              {r.lastAt && r.lastAt !== r.firstAt ? (
                <>
                  {" "}· last <b style={{ color: INK }}>{dateWords(r.lastAt)}</b>
                </>
              ) : null}
            </>
          ) : (
            "Not checked in to a class here yet."
          )}
        </div>
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

/** CLASSES — the first column (4 Oct 2026, the user: "student detail page- class
 *  as 1st column with class list"). One row per class they were checked in to
 *  here, the most recent first, each a door to the class. ⚠ It replaces the
 *  Stats column's RECENT CLASSES, which listed the same sessions a second time. */
function ClassesPanel({ r }: { r: StudentRecord }) {
  if (r.classes.length === 0) {
    return <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.55 }}>A class appears here once {r.name} is checked in to it.</div>;
  }
  return (
    <>
      {r.classes.map((c) => {
        const level = DOS_LEVEL_LABEL[c.level] ?? c.level;
        const col = dosStyleColor(c.style);
        return (
          <ToolCard key={c.classId} testId="student-class" href={`/c/${c.shareSlug}`} hrefLabel={`Open ${c.style} · ${level}`} edge={col}>
            <ToolBody style={{ borderTop: "none" }}>
              <ToolTitle after={<span style={{ flexShrink: 0, fontSize: 11, color: SUB, fontWeight: 700 }}>{dayWords(c.lastAt)}</span>}>
                {c.style} · {level}
              </ToolTitle>
              <ToolFacts
                tint={col}
                style={{ marginTop: 10 }}
                items={[
                  { label: "Sessions", value: c.sessions },
                  { label: "Hours", value: hoursWords(c.minutes) },
                ]}
              />
            </ToolBody>
          </ToolCard>
        );
      })}
    </>
  );
}

/** ROUTINES — the fourth column (4 Oct 2026): what the classes they danced here
 *  taught, with who made each. ⚠ Not a door: a routine's own page is its MAKER's,
 *  and a studio is usually not the maker. */
function RoutinesPanel({ r }: { r: StudentRecord }) {
  if (r.routines.length === 0) {
    return <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.55 }}>None of the classes {r.name} danced here teach a routine yet.</div>;
  }
  return (
    <>
      {r.routines.map((rt) => {
        const col = dosStyleColor(rt.style);
        return (
          <ToolCard key={rt.routineId} testId="student-routine" edge={col}>
            <ToolBody style={{ borderTop: "none" }}>
              <ToolTitle>{rt.title}</ToolTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 11.5, color: SUB }}>
                <span style={{ padding: "3px 9px", borderRadius: 999, background: col, color: inkOn(col), fontSize: 10.5, fontWeight: 900 }}>{rt.style}</span>
                <span>{DOS_LEVEL_LABEL[rt.level] ?? rt.level}</span>
                {rt.makerName ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
                    · <ToolFace name={rt.makerName} photoPath={rt.makerPhotoPath} tint={col} size={18} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt.makerName}</span>
                  </span>
                ) : null}
              </div>
              <ToolFacts
                tint={col}
                style={{ marginTop: 10 }}
                items={[
                  { label: "Sessions", value: rt.sessions },
                  { label: rt.classes === 1 ? "Class" : "Classes", value: rt.classes },
                ]}
              />
            </ToolBody>
          </ToolCard>
        );
      })}
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
  return (
    <>
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

export type StudentShow = "classes" | "stats" | "membership" | "routines";

export function StudentRecordScreen({ businessId, businessName, record, show }: { businessId: string; businessName: string; record: StudentRecord; show: StudentShow }) {
  const r = record;
  const base = `/business/${businessId}/students/${r.userId}`;
  const top = (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "4px 2px 12px" }}>
      <ToolFace name={r.name} photoPath={r.photoPath} tint={TINT} size={64} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: TINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Student · {businessName}</div>
        {/* the page's own `<h1>` — the chrome prints no drill page's name (28 Sep) */}
        <h1 style={{ margin: "2px 0 0", fontFamily: DOS_DISPLAY, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, overflowWrap: "anywhere" }}>{r.name}</h1>
        <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11.5, color: SUB }}>
          {r.city ? <span>{r.city}</span> : null}
          <Link href={`/person/${r.userId}`} aria-label={`Profile — ${r.name}`} style={{ color: INK, fontWeight: 800, textDecoration: "none" }}>
            Profile ›
          </Link>
        </div>
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
        /* ⚠ FOUR COLUMNS (4 Oct 2026, the user: "student detail page- class as
           1st column with class list. Routines as 4th column") — Classes ·
           Stats · Membership · Routines. The card's Stats and Membership buttons
           still open their own column by `?show=`. */
        segments={[
          { key: "classes", href: `${base}?show=classes`, label: "Classes", n: r.classes.length, aria: `${r.name}'s classes here` },
          { key: "stats", href: `${base}?show=stats`, label: "Stats", aria: `${r.name}'s stats here` },
          { key: "membership", href: `${base}?show=membership`, label: "Membership", n: r.passes.length, aria: `${r.name}'s memberships here` },
          { key: "routines", href: `${base}?show=routines`, label: "Routines", n: r.routines.length, aria: `${r.name}'s routines here` },
        ]}
        panels={[
          { key: "classes", node: <ClassesPanel r={r} /> },
          { key: "stats", node: <StatsPanel r={r} /> },
          { key: "membership", node: <MembershipPanel r={r} businessName={businessName} /> },
          { key: "routines", node: <RoutinesPanel r={r} /> },
        ]}
      />
    </div>
  );
}
