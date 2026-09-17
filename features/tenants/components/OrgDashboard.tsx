import Link from "next/link";
import { MoneyCard, Tiles, money } from "@/features/payouts/components/earnings-kit";
import { BizPage, VerifiedTick, bizCard } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import type { OrgStatsRow } from "@/repositories/orgStats";

/** THE ORGANIZATION'S DASHBOARD — /business/stats (17 Sep 2026). The user: "an
 *  org can have multiple studios at different locations and can host events,
 *  so stats will show the combined as well as separate stats for all the
 *  studios under the org."
 *
 *  Two layers, both off the same rows: the TOTAL across every studio the
 *  organization owns (and, on its own card, the events it hosts), then a card
 *  per studio with its own figures and its own doors — its earnings desk and
 *  its board. Every number is a SUM the database made (`my_org_stats`), so a
 *  studio's card and the total cannot disagree. Wears the Stats tile's violet:
 *  a page is headed with what the tile you pressed said (BizShell 2931). */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", color: "var(--sub)" };

const pct = (taken: number, offered: number): string => (offered > 0 ? `${Math.round((100 * taken) / offered)}%` : "—");
const n = (x: number) => x.toLocaleString("en-IN");

const pillStyle = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 8.5,
  fontWeight: 900,
  letterSpacing: 0.6,
  padding: "3px 8px",
  borderRadius: 999,
  background: bg,
  color,
  flexShrink: 0,
});

const door: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  fontSize: 11,
  fontWeight: 800,
  padding: "8px 9px",
  borderRadius: 999,
  background: "var(--el)",
  color: "var(--text)",
  textDecoration: "none",
};

export function OrgDashboard({ rows, monthName }: { rows: OrgStatsRow[]; monthName: string }) {
  const studios = rows.filter((r) => r.type === "studio");
  const host = rows.find((r) => r.type === "org") ?? null;
  const sum = (pick: (r: OrgStatsRow) => number) => studios.reduce((a, r) => a + pick(r), 0);
  const gross = sum((r) => r.grossInr);
  const refunded = sum((r) => r.refundedInr);
  const monthGross = sum((r) => r.monthGrossInr);
  const seatsOffered = sum((r) => r.seatsOffered);
  const seatsTaken = sum((r) => r.seatsTaken);
  const live = studios.filter((r) => r.visibility === "listed").length;

  return (
    <BizPage
      title="Studios · combined"
      sub={studios.length === 0 ? "No studios yet" : `${studios.length} ${studios.length === 1 ? "studio" : "studios"} · ${live} live${host ? ` · ${host.events} ${host.events === 1 ? "event" : "events"}` : ""}`}
      grad={dosToolPaint(DOS_TOOLS.stats.c)}
    >
      {studios.length === 0 ? (
        <div style={{ ...bizCard, textAlign: "center", border: "1.5px dashed var(--el)", padding: "22px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 5 }}>Nothing to count yet</div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5, marginBottom: 12 }}>Open your first studio and its classes, bookings and takings roll up here — each studio on its own, and all of them together.</div>
          <Link href="/business" style={{ ...door, display: "inline-block", flex: "none", padding: "9px 16px" }}>
            Your studios ›
          </Link>
        </div>
      ) : (
        <>
          {/* ── THE TOTAL: every studio, added up by the database ── */}
          <MoneyCard
            label="GROSS · ALL STUDIOS"
            amount={gross}
            note={`${money(monthGross)} so far in ${monthName} · ${money(refunded)} refunded · counted from captured payments, never a price list`}
            tiles={[
              [n(sum((r) => r.classes)), "classes", "#0D9488"],
              [n(sum((r) => r.bookings)), "bookings", "#3B82F6"],
              [pct(seatsTaken, seatsOffered), "fill · held", "#8B5CF6"],
            ]}
          />

          {/* ── EVENTS: the organization's own, on its hosting row ── */}
          {host ? (
            <div style={{ ...bizCard, borderLeft: `4px solid ${DOS_TOOLS.events.c}`, borderRadius: 18, padding: "14px 15px" }}>
              <div style={micro}>EVENTS · TICKET MONEY</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 29, fontWeight: 700, letterSpacing: -0.8, fontFamily: DOS_MONO }}>{money(host.grossInr)}</span>
                {host.refundedInr > 0 ? <span style={{ fontSize: 10.5, color: "var(--sub)" }}>· {money(host.refundedInr)} refunded</span> : null}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Tickets and entries paid through Cashfree, hosted by the organization — never by one of its studios.</div>
              <Tiles
                tiles={[
                  [n(host.events), "events", DOS_TOOLS.events.c],
                  [n(host.ticketsSold), "tickets", "#3B82F6"],
                  [n(host.entries), "entries", "#DC2626"],
                ]}
              />
              <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                <Link href={`/business/${host.businessId}/events`} style={door}>
                  Events desk ›
                </Link>
                <Link href={`/business/${host.businessId}/earnings`} style={door}>
                  Ticket money ›
                </Link>
              </div>
            </div>
          ) : null}

          {/* ── EACH STUDIO, ON ITS OWN ── */}
          <div style={{ ...micro, margin: "14px 0 8px" }}>STUDIO BY STUDIO</div>
          {studios.map((s) => (
            <div key={s.businessId} data-testid="org-stats-studio" style={{ ...bizCard, borderRadius: 18, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link href={`/business/${s.businessId}`} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, color: "var(--text)", textDecoration: "none" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {s.verifiedAt ? <VerifiedTick size={14} /> : null}
                </Link>
                {s.visibility === "listed" ? <span style={pillStyle("rgba(34,197,94,.16)", "#22C55E")}>LIVE</span> : <span style={pillStyle("var(--el)", "var(--sub)")}>NOT PUBLIC</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, fontFamily: DOS_MONO }}>{money(s.grossInr)}</span>
                <span style={{ fontSize: 10.5, color: "var(--sub)" }}>
                  gross · {money(s.monthGrossInr)} in {monthName}
                  {s.refundedInr > 0 ? ` · ${money(s.refundedInr)} refunded` : ""}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
                {(
                  [
                    [n(s.classes), "classes", "#0D9488"],
                    [n(s.bookings), "bookings", "#3B82F6"],
                    [n(s.sessionsHeld), "held", "#F59E0B"],
                    [pct(s.seatsTaken, s.seatsOffered), "fill", "#8B5CF6"],
                  ] as Array<[string, string, string]>
                ).map(([v, l, c]) => (
                  <div key={l} style={{ background: "var(--el)", borderRadius: 12, padding: "8px 4px", textAlign: "center", borderTop: `3px solid ${c}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: DOS_MONO }}>{v}</div>
                    <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
                {n(s.followers)} {s.followers === 1 ? "follower" : "followers"}
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <Link href={`/business/${s.businessId}/earnings`} aria-label={`Earnings for ${s.name}`} style={door}>
                  Earnings ›
                </Link>
                <Link href={`/business/${s.businessId}/classes`} aria-label={`Classes at ${s.name}`} style={door}>
                  Classes ›
                </Link>
                <Link href="/stats?tab=charts&seg=studio" aria-label={`Where ${s.name} stands`} style={door}>
                  Board ›
                </Link>
              </div>
            </div>
          ))}
        </>
      )}
    </BizPage>
  );
}
