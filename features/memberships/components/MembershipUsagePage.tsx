import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead } from "@/components/ui/ToolCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import type { MembershipClassUse, MembershipHolder, MembershipWithUsage, PassUse } from "@/repositories/memberships";
import { ProgressBar, SpentOn, expiryWords, unitWord } from "./usage-kit";
import { MembershipOffSale } from "./MembershipOffSale";

/** ONE MEMBERSHIP — ITS PEOPLE, THEIR USAGE AND WHAT IT EARNED (19 Sep 2026;
 *  re-cut 3 Oct 2026, the user: *"better designed membership detail page
 *  according to the new card with details of people and their usage and earnings
 *  from membership"*).
 *
 *  ⚠ IT IS THE MEMBERSHIP CARD, OPENED, with TWO COLUMNS under it (C116; the
 *  columns 3 Oct 2026 — *"earnings in a separate column"*):
 *   · TOP — the card on the desk at full size: who sells it, the membership with
 *     its price, size and validity said ONCE, the three figures and the bar of
 *     what was sold that has been danced;
 *   · STUDENTS (Holders until 4 Oct 2026) — THE PEOPLE: everybody holding one,
 *     each with what they paid, how far through they are and, folded, the
 *     classes they used it on; then the classes it was spent on;
 *   · EARNINGS — THE MONEY: what came in, per holder and per hour, what the hours
 *     still owed are worth, and the last six months of sales.
 *
 *  ⚠ EVERY FIGURE IS COUNTED, NONE IS STORED, and the money is what the passes
 *  were CHARGED (each pass snapshots its price) beside `revenue_inr`, the money
 *  that actually came in — two figures, never blended. */

const TINT = DOS_TOOLS.memberships.c;
const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };

const IST = "Asia/Kolkata";
const monthKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
const dateWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }).format(new Date(iso));

/* the clock, read outside the component body (react-hooks/purity) */
const clock = () => new Date();

/** the six month keys ending now, oldest first */
function lastSixMonths(now: Date): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const [y, m] = monthKey(now.toISOString()).split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(d),
    });
  }
  return out;
}

function SectionHead({ title, figure }: { title: string; figure?: ReactNode }) {
  return <FigureHead margin="0 0 10px" title={<span style={head}>{title}</span>} figure={figure == null ? undefined : <span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>{figure}</span>} />;
}

/** SALES BY MONTH — one series, thin bars rounded at the data end, each naming
 *  its own month, count and money (the accessible name and the hover title) */
function SalesChart({ months }: { months: Array<{ key: string; label: string; n: number; inr: number }> }) {
  /* scaled by PASSES, not money — a free membership sells too, and its bars must
     not lie flat under a chart of zeros; the money is in each bar's name */
  const max = Math.max(1, ...months.map((m) => m.n));
  return (
    <div role="list" aria-label="Passes sold in each of the last six months" style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 118, padding: "0 2px" }}>
      {months.map((m) => {
        const h = Math.round((m.n / max) * 80);
        const words = `${m.label}: ${m.n} sold · ${rupees(m.inr)}`;
        return (
          <div key={m.key} role="listitem" title={words} aria-label={words} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: m.n ? INK : MUTED, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>{m.n}</span>
            <span style={{ width: "100%", maxWidth: 26, height: Math.max(m.n ? 6 : 2, h), borderRadius: "4px 4px 0 0", background: m.n ? TINT : "var(--el)" }} />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, marginTop: 5, borderTop: "1.5px solid var(--el)", width: "100%", textAlign: "center", paddingTop: 4 }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MembershipUsagePage({
  membership,
  holders,
  classes,
  canManage = false,
  usesByPass = {},
  seller = null,
  now,
  show = "holders",
}: {
  /** the column the server decided, from `?show=` */
  show?: "holders" | "earnings";
  membership: MembershipWithUsage;
  holders: MembershipHolder[];
  classes: MembershipClassUse[];
  canManage?: boolean;
  /** WHICH classes each holder spent theirs on (30 Sep 2026) */
  usesByPass?: Record<string, PassUse[]>;
  /** WHO SELLS IT — the profile the page leads with, as the card does */
  seller?: { name: string; photoPath: string | null; kind: "studio" | "artist"; href: string } | null;
  now?: Date;
}) {
  const m = membership;
  /* what was sold and has not been danced yet — the seller's standing promise */
  const unspent = Math.max(0, m.unitsSold - m.unitsUsed);
  const live = m.status !== "draft";

  /* ── THE MONEY ── */
  const charged = holders.reduce((s, h) => s + h.pricePaidInr, 0);
  const paying = holders.filter((h) => h.pricePaidInr > 0).length;
  const perHolder = holders.length > 0 ? Math.round(m.revenueInr / holders.length) : null;
  const perUnit = m.unitsSold > 0 ? m.revenueInr / m.unitsSold : null;
  const owedValue = perUnit == null ? null : Math.round(perUnit * unspent);
  const dancedValue = perUnit == null ? null : Math.round(perUnit * m.unitsUsed);
  const byMonth = new Map<string, { n: number; inr: number }>();
  for (const h of holders) {
    if (!h.boughtAt) continue;
    const k = monthKey(h.boughtAt);
    const cur = byMonth.get(k) ?? { n: 0, inr: 0 };
    cur.n += 1;
    cur.inr += h.pricePaidInr;
    byMonth.set(k, cur);
  }
  const months = lastSixMonths(now ?? clock()).map((x) => ({ ...x, n: byMonth.get(x.key)?.n ?? 0, inr: byMonth.get(x.key)?.inr ?? 0 }));
  const unitShort = m.unit === "hours" ? "hour" : "class";

  /* ── THE PEOPLE — live first, then expired, then used up ── */
  const order = (h: MembershipHolder) => (h.status === "active" && !h.expired ? 0 : h.status === "active" ? 1 : 2);
  const people = [...holders].sort((a, b) => order(a) - order(b) || b.unitsUsed - a.unitsUsed || a.name.localeCompare(b.name));
  const classMax = Math.max(1, ...classes.map((c) => c.uses));

  /* ── TOP: THE CARD, OPENED ── */
  const top = (
        <ToolCard testId="membership-detail">
          <ToolHead
            tint={TINT}
            name={seller?.name ?? "Your membership"}
            photoPath={seller?.photoPath ?? null}
            href={seller?.href}
            hrefLabel={seller ? `${seller.name} — open the page` : undefined}
            eyebrow={seller?.kind === "artist" ? "Your artist page" : "Your studio"}
            size={52}
            /* ⚠ LIVE, AND DELETE BESIDE IT (4 Oct 2026, the user: "take it off sale
               to be on top right as a chip and renamed to delete") — the owner's
               alone, because `delete_membership` refuses anybody else */
            right={
              <>
                {live ? <ToolChip word="LIVE" fg="#22C55E" bg="#22C55E1c" /> : <ToolChip word="DRAFT" fg={SUB} bg="var(--el)" />}
                {canManage ? <MembershipOffSale membershipId={m.id} name={m.name} active={m.active} /> : null}
              </>
            }
          />
          <ToolBody>
            {/* ⚠ "MEMBERSHIP DETAILS" (3 Oct 2026, the user's own name for this page) */}
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 3 }}>Membership Details</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: -0.4, lineHeight: 1.2, overflowWrap: "anywhere" }}>{m.name}</h1>
            {/* ⚠ PRICE · HOURS · VALIDITY IN BOXES, AND NO "TAKEN" (4 Oct 2026) —
                the card on the desk reads the same; what came in is the Earnings column */}
            <ToolFacts
              tint={TINT}
              style={{ marginTop: 12 }}
              items={[
                { label: "Price", value: m.priceInr === 0 ? "Free" : rupees(m.priceInr) },
                { label: m.unit === "hours" ? "Hours" : "Classes", value: m.units },
                { label: "Validity", value: m.validityDays ? `${m.validityDays} days` : "No end" },
              ]}
            />
            <ToolFacts
              tint={TINT}
              style={{ marginTop: 6 }}
              items={[
                { label: "Sold", value: `${m.sold}/${m.totalCount}`, testId: "usage-sold" },
                { label: "Active", value: String(m.active), testId: "usage-active" },
              ]}
            />
            {m.unitsSold > 0 ? (
              <>
                <ProgressBar used={m.unitsUsed} total={m.unitsSold} tint="#8B5CF6" unit={m.unit} leftWord="still owed" usedWord="danced" testId="usage-progress" />
                {/* the other side of the same bar — what the seller still OWES */}
                <div data-testid="usage-unspent" style={{ fontSize: 10.5, color: SUB, marginTop: 6 }}>
                  {unspent === 0 ? "Everything sold has been danced." : `${unitWord(m.unit, unspent)} still owed to the people holding one.`}
                </div>
              </>
            ) : null}
          </ToolBody>
          {/* ⚠ NO "Your page" / "All memberships" (4 Oct 2026, the user) — the
              seller's face and name above ARE the door to the page, and back is
              the way to the list */}
        </ToolCard>
  );

  /* ── COLUMN 2: THE MONEY ── */
  const earnings = (
      <div data-testid="membership-earnings">
        <SectionHead title="EARNINGS FROM IT" figure={rupees(m.revenueInr)} />
        <ToolFacts
          tint={TINT}
          items={[
            { label: "Came in", value: rupees(m.revenueInr), testId: "membership-earned" },
            { label: "Per holder", value: perHolder == null ? "—" : rupees(perHolder) },
            { label: `Per ${unitShort}`, value: perUnit == null ? "—" : rupees(Math.round(perUnit)) },
          ]}
        />
        <ToolFacts
          tint={TINT}
          style={{ marginTop: 6 }}
          items={[
            { label: "Danced value", value: dancedValue == null ? "—" : rupees(dancedValue) },
            { label: "Still owed", value: owedValue == null ? "—" : rupees(owedValue), tint: owedValue ? "#F59E0B" : undefined },
            { label: "Paying", value: `${paying}/${holders.length}` },
          ]}
        />
        <div style={{ fontSize: 10.5, color: SUB, lineHeight: 1.5, margin: "9px 0 12px" }}>
          {m.priceInr === 0 ? "A free membership earns nothing — the chart counts the passes taken. " : ""}
          Came in is the money received. Danced value and still owed split it by the {m.unit === "hours" ? "hours" : "classes"} used and not yet used, at the average price per {unitShort}.
          {charged !== m.revenueInr ? ` The passes were charged ${rupees(charged)} in all.` : ""}
        </div>
        <div style={panel}>
          <SectionHead title="PASSES SOLD · LAST 6 MONTHS" figure={months.reduce((s, x) => s + x.n, 0)} />
          <SalesChart months={months} />
        </div>
      </div>
  );

  /* ── COLUMN 1: STUDENTS — THE PEOPLE, THEN WHERE IT WENT (renamed from
     Holders 4 Oct 2026, the user: "holders to be renamed to students") ── */
  const holdersPanel = (
      <div data-testid="membership-holders">
        <SectionHead title="STUDENTS" figure={holders.length} />
        {people.length === 0 ? (
          <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.5 }}>Nobody has taken one yet. It is on your public page while it is live.</div>
        ) : (
          people.map((h) => {
            /* EXPIRED is read off the date — the row is still `active` underneath */
            const expired = h.status === "active" && h.expired;
            const word = expired ? "EXPIRED" : h.status === "used_up" ? "USED UP" : h.status === "active" ? "ACTIVE" : h.status.toUpperCase();
            const on = h.status === "active" && !expired;
            const until = expiryWords(h);
            return (
              <ToolCard key={h.passId} testId="membership-holder">
                <ToolHead
                  tint={TINT}
                  name={h.name}
                  photoPath={h.avatarPath}
                  href={`/person/${h.userId}`}
                  hrefLabel={`Open ${h.name}'s profile`}
                  eyebrow={h.pricePaidInr > 0 ? `Paid ${rupees(h.pricePaidInr)}` : "Free"}
                  sub={h.boughtAt ? `Since ${dateWords(h.boughtAt)}` : null}
                  size={44}
                  right={<ToolChip word={word} fg={on ? "#22C55E" : expired ? "#F87171" : SUB} bg={on ? "#22C55E1c" : expired ? "#F871711c" : "var(--el)"} />}
                />
                <ToolBody>
                  {until ? <div style={{ fontSize: 11, fontWeight: 800, color: expired ? "#F87171" : SUB }}>{until.charAt(0).toUpperCase() + until.slice(1)}</div> : null}
                  <ProgressBar used={h.unitsUsed} total={h.unitsTotal} tint={TINT} unit={h.unit} testId="holder-progress" />
                  {/* ⚠ THE CLASSES THEY USED IT ON, FOLDED (4 Oct 2026, the user:
                      "student membership should also show list of classes used in
                      collapsible under student"). A native disclosure, so it is
                      announced and keyboard-reachable with no script. */}
                  {(usesByPass[h.passId] ?? []).length > 0 ? (
                    <details data-testid="holder-classes" style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 800, color: INK, listStyle: "revert" }}>
                        Classes used · {(usesByPass[h.passId] ?? []).length}
                      </summary>
                      <SpentOn uses={usesByPass[h.passId] ?? []} unit={h.unit} />
                    </details>
                  ) : (
                    <div style={{ fontSize: 11, color: SUB, marginTop: 8 }}>No class used yet.</div>
                  )}
                </ToolBody>
              </ToolCard>
            );
          })
        )}

        <div style={{ ...panel, marginTop: 4 }}>
          <SectionHead title="SPENT ON" figure={classes.length} />
          {classes.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>Nobody has spent one on a class yet. A class takes a membership only while its own toggle is on — the class form, and the Policy on its page.</div>
          ) : (
            classes.map((c) => (
              <Link key={c.classId} href={`/c/${c.shareSlug}`} aria-label={`Open ${c.style} · ${DOS_LEVEL_LABEL[c.level] ?? c.level}`} style={{ display: "block", padding: "9px 0", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: INK }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.style} · {DOS_LEVEL_LABEL[c.level] ?? c.level}
                    </b>
                    <span style={{ display: "block", color: SUB, fontSize: 10.5, marginTop: 1 }}>{c.businessName}</span>
                  </span>
                  <span style={{ flexShrink: 0, textAlign: "right", fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                    <b style={{ color: INK }}>{c.uses}</b> {c.uses === 1 ? "seat" : "seats"}
                    <span style={{ display: "block", fontSize: 10.5 }}>
                      {c.people} {c.people === 1 ? "person" : "people"}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true" style={{ display: "block", height: 6, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 6 }}>
                  <span style={{ display: "block", width: `${Math.max(6, Math.round((c.uses / classMax) * 100))}%`, height: "100%", borderRadius: 999, background: TINT }} />
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
  );

  /* ⚠ TWO COLUMNS (3 Oct 2026, the user: *"membership detail page — earnings in a
     separate column"*): the card on top, then Holders · Earnings as the app's own
     segments. Holders opens first — it is what the page was opened for, and the
     e2e and `shoot-classes` read its cards without pressing anything. */
  const base = `/memberships/${m.id}`;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <SegmentedPanels
        key={show}
        initial={show}
        label="Show"
        sections
        top={top}
        segments={[
          { key: "holders", href: `${base}?show=students`, label: "Students", n: holders.length, aria: `Students holding ${m.name}` },
          { key: "earnings", href: `${base}?show=earnings`, label: "Earnings", aria: `What ${m.name} earned` },
        ]}
        panels={[
          { key: "holders", node: holdersPanel },
          { key: "earnings", node: earnings },
        ]}
      />
    </div>
  );
}
