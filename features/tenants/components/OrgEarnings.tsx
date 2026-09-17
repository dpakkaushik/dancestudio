import Link from "next/link";
import { MoneyCard, money } from "@/features/payouts/components/earnings-kit";
import { BizPage, bizCard } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import type { OrgStatsRow } from "@/repositories/orgStats";

/** THE ORGANIZATION'S EARNINGS, COMBINED — /business/earnings (18 Sep 2026, the
 *  user's Home grid for an organization: "Earnings — combined from events and
 *  all different studios"). The same rows the dashboard reads (`my_org_stats`:
 *  a sum the database made, per business the organization owns), turned to
 *  face the money: the total across every studio AND the events on the hosting
 *  row, then a row per source with its own door — a studio's earnings desk, or
 *  the ticket money on the hosting row's ledger. Wears the Earnings tile's
 *  green: a page is headed with what the tile you pressed said. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", color: "var(--sub)" };
const door: React.CSSProperties = { fontSize: 11, fontWeight: 800, padding: "8px 12px", borderRadius: 999, background: "var(--el)", color: "var(--text)", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 };

function SourceRow({ name, sub, gross, monthGross, refunded, href, tint, doorLabel }: { name: string; sub: string; gross: number; monthGross: number; refunded: number; href: string; tint: string; doorLabel: string }) {
  return (
    <div style={{ ...bizCard, borderLeft: `4px solid ${tint}`, borderRadius: 18, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ ...micro, marginTop: 2 }}>{sub}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
          <span>
            <span style={{ display: "block", fontSize: 17, fontWeight: 700, fontFamily: DOS_MONO, letterSpacing: -0.5 }}>{money(gross)}</span>
            <span style={micro}>gross</span>
          </span>
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, fontFamily: DOS_MONO }}>{money(monthGross)}</span>
            <span style={micro}>this month</span>
          </span>
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, fontFamily: DOS_MONO }}>{money(refunded)}</span>
            <span style={micro}>refunded</span>
          </span>
        </div>
      </div>
      <Link href={href} aria-label={doorLabel} style={door}>
        Ledger ›
      </Link>
    </div>
  );
}

export function OrgEarnings({ rows, monthName }: { rows: OrgStatsRow[]; monthName: string }) {
  const studios = rows.filter((r) => r.type === "studio");
  const host = rows.find((r) => r.type === "org") ?? null;
  const all = host ? [...studios, host] : studios;
  const sum = (pick: (r: OrgStatsRow) => number) => all.reduce((a, r) => a + pick(r), 0);
  const gross = sum((r) => r.grossInr);
  const refunded = sum((r) => r.refundedInr);
  const monthGross = sum((r) => r.monthGrossInr);
  const studioGross = studios.reduce((a, r) => a + r.grossInr, 0);

  return (
    <BizPage
      title="Earnings · combined"
      sub={`${studios.length} ${studios.length === 1 ? "studio" : "studios"}${host ? ` · ${host.events} ${host.events === 1 ? "event" : "events"}` : ""} · counted from captured payments`}
      grad={dosToolPaint(DOS_TOOLS.earn.c)}
    >
      <MoneyCard
        label="GROSS · STUDIOS AND EVENTS"
        amount={gross}
        note={`${money(monthGross)} so far in ${monthName} · ${money(refunded)} refunded · a refunded payment still came in, and is a deduction beneath`}
        tiles={[
          [money(studioGross), "classes, all studios", DOS_TOOLS.classes.c],
          [money(host?.grossInr ?? 0), "tickets and entries", DOS_TOOLS.events.c],
          [money(gross - refunded), "net of refunds", DOS_TOOLS.earn.c],
        ]}
      />

      {studios.length === 0 && !host ? (
        <div style={{ ...bizCard, textAlign: "center", border: "1.5px dashed var(--el)", padding: "22px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 5 }}>Nothing has come in yet</div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5 }}>Open a studio and its classes, or host an event, and every payment rolls up here — each source on its own, and all of them together.</div>
        </div>
      ) : null}

      {studios.length ? <div style={{ ...micro, margin: "14px 0 8px" }}>BY STUDIO</div> : null}
      {studios.map((s) => (
        <SourceRow
          key={s.businessId}
          name={s.name}
          sub={`${s.classes} ${s.classes === 1 ? "class" : "classes"} · ${s.bookings} ${s.bookings === 1 ? "booking" : "bookings"}${s.visibility === "listed" ? " · live" : ""}`}
          gross={s.grossInr}
          monthGross={s.monthGrossInr}
          refunded={s.refundedInr}
          href={`/business/${s.businessId}/earnings`}
          tint={DOS_TOOLS.classes.c}
          doorLabel={`Open the earnings desk of ${s.name}`}
        />
      ))}

      {host ? (
        <>
          <div style={{ ...micro, margin: "14px 0 8px" }}>EVENTS</div>
          <SourceRow
            name="Tickets and entries"
            sub={`${host.events} ${host.events === 1 ? "event" : "events"} · ${host.ticketsSold} ${host.ticketsSold === 1 ? "ticket" : "tickets"} · ${host.entries} ${host.entries === 1 ? "entry" : "entries"}`}
            gross={host.grossInr}
            monthGross={host.monthGrossInr}
            refunded={host.refundedInr}
            href={`/business/${host.businessId}/earnings`}
            tint={DOS_TOOLS.events.c}
            doorLabel="Open the ticket money ledger"
          />
        </>
      ) : null}
    </BizPage>
  );
}
