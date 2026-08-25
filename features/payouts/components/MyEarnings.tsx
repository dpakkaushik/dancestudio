"use client";

import { useState } from "react";
import { CARD, DOS_UI, GOLD, GREEN, INK, LILAC, LINE, RED, SUB } from "@/lib/design/tokens";
import { PAYOUT_METHOD_LABEL, PAYOUT_STATUS_LABEL, payoutTone, type MyEarnings as MyEarningsData } from "@/types/payout";
import {
  EarnHero,
  LedgerBlock,
  MoneyCard,
  SectionLabel,
  SettlementRow,
  barColour,
  money,
  type LedgerRow,
} from "./earnings-kit";

/** The teaching side of the earnings screen — the same S_earn parts, the other
 *  ledger. The prototype is explicit that these are not the same thing: "A
 *  STUDIO is a business... AN ARTIST is a person. They are PAID BY studios for
 *  the sessions they teach" (17877-17891). So this screen counts sessions taught
 *  per studio and what each studio has settled — never a studio's P&L with your
 *  name on it. */

export function MyEarnings({ data, monthLabel }: { data: MyEarningsData; monthLabel: string }) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  const rows: LedgerRow[] = data.studios.map((s, i) => ({
    key: s.tenantId,
    label: s.tenantName,
    amount: s.earnedInr,
    colour: barColour(i),
    people: [
      {
        key: `${s.tenantId}-sessions`,
        label: `${s.sessions} session${s.sessions === 1 ? "" : "s"}`,
        meta: s.ratePerSessionInr !== null ? `${money(s.ratePerSessionInr)} each` : "mixed rates",
        status: money(s.earnedInr),
      },
      {
        key: `${s.tenantId}-paid`,
        label: "Settled",
        meta: "recorded by the studio",
        status: money(s.paidInr),
      },
      {
        key: `${s.tenantId}-due`,
        label: "Still due",
        meta: s.dueInr > 0 ? "not settled yet" : "nothing outstanding",
        status: money(s.dueInr),
        statusColour: s.dueInr > 0 ? GOLD : SUB,
      },
    ],
  }));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "8px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      <EarnHero title="Earnings" sub="What you have taught, and who has paid you" />

      <MoneyCard
        label={`TEACHING · ${monthLabel.toUpperCase()}`}
        amount={data.earnedTotal}
        note="Paid by each studio on their own cycle — DanceOS records it, it does not move the money."
        segments={data.studios
          .filter((s) => s.earnedInr > 0)
          .map((s, i) => ({ label: s.tenantName.split(" ")[0], value: s.earnedInr, colour: barColour(i) }))}
        tiles={[
          [money(data.paidTotal), "Settled", GREEN],
          [money(data.dueTotal), "Awaiting studios", GOLD],
          [String(data.studios.reduce((a, s) => a + s.sessions, 0)), "Sessions", RED],
        ]}
      />

      {data.studios.length === 0 ? (
        <div
          style={{
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: "16px 15px",
            fontSize: 12.5,
            color: SUB,
          }}
        >
          Nothing yet. Once a studio puts you on a class and it runs, what you have earned shows up here.
        </div>
      ) : (
        <>
          <SectionLabel>WHERE IT CAME FROM</SectionLabel>
          <LedgerBlock
            rows={rows}
            openKey={openRow}
            onToggle={(k) => setOpenRow(openRow === k ? null : k)}
            whoLabel="THE COUNT"
          />
        </>
      )}

      {data.payouts.length > 0 ? (
        <>
          <SectionLabel>WHO HAS PAID YOU</SectionLabel>
          {data.payouts.map((p) => (
            <SettlementRow
              key={p.id}
              title={`${p.tenantName} · ${PAYOUT_METHOD_LABEL[p.method]}`}
              meta={`${p.paidOn}${p.providerRef ? ` · ${p.providerRef}` : ""} · ${p.sessionCount} session${
                p.sessionCount === 1 ? "" : "s"
              } · ${PAYOUT_STATUS_LABEL[p.status]}`}
              amount={p.amountInr}
              tone={payoutTone(p.status)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
