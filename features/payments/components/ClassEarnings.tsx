"use client";

import Link from "next/link";
import { DOS_MONO, money } from "@/features/payouts/components/earnings-kit";
import { DOS_DISPLAY, GREEN } from "@/lib/design/tokens";
import type { ClassMoney } from "@/types/payment";

/** WHAT THIS SESSION MADE — the class page's owner Earnings segment, lifted from
 *  prototype S_class 12008-12042. Its own framing, at 12003-12007: "A class showed
 *  a price on the card, a fill fraction on the register and a refund total on a
 *  third tab, and nowhere added them up — so 'what did Tuesday actually earn' was a
 *  sum you did in your head from three screens. It is one page: what came in, what
 *  is going back out, and the difference."
 *
 *  Owner-only, which is the prototype's own gate: SEGS (11757) puts Earnings behind
 *  `isMine` while Attendance and Refunds ride the grantable jobs beside it. */

/* the prototype's softer red for money going back out (12026, 12034) — its accents
   are theme-invariant literals, so this is not a token */
const SOFT_RED = "#F87171";

/** one dotted row — prototype `line(l,v,c)` at 12017-12021, where the dot and the
 *  figure carry the same colour */
function Line({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--el)",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: tint, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{label}</span>
      <b style={{ fontSize: 13, fontFamily: DOS_MONO, color: tint }}>{value}</b>
    </div>
  );
}

interface ClassEarningsProps {
  /** the class's style colour — the card's left edge and its seat row */
  styleColor: string;
  priceInr: number;
  /** attended if the register has more, else booked (prototype's Math.max, 12013) */
  seatsTaken: number;
  /** 0 when the class has no cap, in which case the row prints the count alone */
  capacity: number;
  figures: ClassMoney;
  /** the studio's pay desk — "beside everything else you earn" */
  earningsHref: string;
}

export function ClassEarnings({
  styleColor,
  priceInr,
  seatsTaken,
  capacity,
  figures,
  earningsHref,
}: ClassEarningsProps) {
  const { collectedInr, refundedInr, owedInr } = figures;
  const net = collectedInr - refundedInr;

  return (
    <div style={{ padding: "12px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--el)",
          borderLeft: `4px solid ${styleColor}`,
          borderRadius: 18,
          padding: "14px 15px",
        }}
      >
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)" }}>
          WHAT THIS SESSION MADE
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 900,
            fontFamily: DOS_DISPLAY,
            letterSpacing: -1.2,
            lineHeight: 1,
            marginTop: 6,
            color: net >= 0 ? GREEN : SOFT_RED,
          }}
        >
          {money(net)}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 5, lineHeight: 1.5 }}>
          {refundedInr ? `after ${money(refundedInr)} refunded.` : "nothing refunded."}
          {owedInr ? ` ${money(owedInr)} more is asked for and not settled.` : ""}
        </div>
        <div style={{ marginTop: 12, paddingTop: 4 }}>
          <Line
            label="Seats taken"
            value={`${seatsTaken}${capacity ? ` / ${capacity}` : ""}`}
            tint={styleColor}
          />
          <Line label="Price a seat" value={money(priceInr)} tint="var(--sub)" />
          <Line label="Came in" value={money(collectedInr)} tint={GREEN} />
          {refundedInr ? (
            <Line label="Refunded" value={`−${money(refundedInr)}`} tint={SOFT_RED} />
          ) : null}
          {owedInr ? (
            <Line
              label="Still being asked for"
              value={`−${money(owedInr)}`}
              tint="var(--sub)"
            />
          ) : null}
        </div>
        {/* the prototype fires __DOSNAV("earn"); here the ledger is a real route */}
        <Link
          href={earningsHref}
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 12,
            padding: "11px",
            borderRadius: 999,
            background: "var(--el)",
            fontWeight: 800,
            fontSize: 12,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          See it beside everything else you earn &rsaquo;
        </Link>
      </div>
    </div>
  );
}
