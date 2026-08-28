"use client";

import { useState } from "react";
import {
  recordPayoutAction,
  setPayoutStatusAction,
  voidPayoutAction,
} from "@/features/payouts/server-actions/payouts";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, GREEN, INK, LILAC, LINE, RED, SUB } from "@/lib/design/tokens";
import { sessionDayLabel } from "@/lib/format/session";
import type { TenantIncome } from "@/types/income";
import {
  PAYOUT_METHOD_LABEL,
  PAYOUT_STATUS_LABEL,
  payoutTone,
  type PayoutMethod,
  type PayoutStatus,
  type PersonPayLedger,
  type TenantPayLedger,
} from "@/types/payout";
import {
  DOS_MONO,
  EarnHero,
  LedgerBlock,
  MoneyCard,
  SectionLabel,
  SettlementRow,
  barColour,
  money,
  type LedgerRow,
} from "./earnings-kit";
import { GrossCard, HowStudentsPaid, MonthStatements, PeriodChips } from "./StudioIncome";

/** The studio's side of the earnings screen (prototype S_earn, 17877-18205),
 *  both halves of it:
 *
 *  MONEY IN (Step 13b part 2b) — the period chips, GROSS · {month} with its
 *  ▲/▼ badge and the counted tiles, HOW STUDENTS PAID, and the past months'
 *  statements. Every figure is summed from Step 9's payments and refunds.
 *
 *  MONEY OUT (Step 13) — what the studio owes the people who taught, and what
 *  it has settled. What it is NOT: a payroll desk. The prototype deleted its
 *  own — "a studio pays its faculty; DanceOS is not the thing that runs the
 *  payroll" — so there are no pay cycles and no batch runs here. The studio
 *  settles by bank or UPI on its own, and RECORDS it, which is the only thing
 *  that can make a teacher's "who has paid you" true. */

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: `1.5px solid ${LINE}`,
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 13,
  color: INK,
  outline: "none",
  fontFamily: "inherit",
};

const METHODS: PayoutMethod[] = ["bank_transfer", "upi", "cash", "other"];
const STATUSES: PayoutStatus[] = ["done", "in_transit", "on_hold"];

function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 700,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* role on the sheet itself, never aria-hidden on the wrapper — Step 6's
          a11y lesson: that hid whole forms from the accessibility tree */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: LILAC,
          color: INK,
          width: "100%",
          maxWidth: 430,
          borderRadius: "22px 22px 0 0",
          padding: "18px 16px 26px",
          maxHeight: "88vh",
          overflowY: "auto",
          fontFamily: DOS_UI,
          boxSizing: "border-box",
        }}
      >
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>{title}</b>
        {sub ? <div style={{ fontSize: 12, color: SUB, margin: "5px 0 14px" }}>{sub}</div> : <div style={{ height: 12 }} />}
        {children}
      </div>
    </div>
  );
}

export function EarningsDesk({
  tenantId,
  tenantName,
  ledger,
  income,
  monthLabel,
}: {
  tenantId: string;
  tenantName: string;
  ledger: TenantPayLedger;
  income: TenantIncome;
  monthLabel: string;
}) {
  /* the prototype remembers its period across drill-ins (17880-17884) — here the
     desk stays mounted through the server actions' revalidation, so plain state
     carries the same memory */
  const [eview, setEview] = useState<"now" | "hist">("now");
  const [eopen, setEopen] = useState<string | null>(null);

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [payPerson, setPayPerson] = useState<PersonPayLedger | null>(null);
  const [openPayout, setOpenPayout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PayoutMethod>("bank_transfer");
  const [status, setStatus] = useState<PayoutStatus>("done");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    fire(doneMsg);
    return true;
  };

  const openPaySheet = (person: PersonPayLedger) => {
    setChosen(new Set(person.unpaid.map((s) => s.sessionId)));
    setMethod("bank_transfer");
    setStatus("done");
    setRef("");
    setNote("");
    setError(null);
    setPayPerson(person);
  };

  const accrued = ledger.owedTotal + ledger.paidTotal + ledger.inTransitTotal;
  const rows: LedgerRow[] = ledger.people.map((p, i) => ({
    key: p.userId,
    label: p.personName,
    amount: p.owedInr,
    colour: barColour(i),
    people: p.unpaid.map((s) => ({
      key: s.sessionId,
      label: sessionDayLabel(s.startsAt),
      meta: s.classTitle,
      status: s.rateInr > 0 ? money(s.rateInr) : "no rate",
      statusColour: s.rateInr > 0 ? GREEN : SUB,
    })),
  }));

  const chosenTotal =
    payPerson?.unpaid.filter((s) => chosen.has(s.sessionId)).reduce((a, s) => a + s.rateInr, 0) ?? 0;
  const openPayoutRow = ledger.payouts.find((p) => p.id === openPayout) ?? null;

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
      <EarnHero title="Earnings" sub={tenantName} />

      {/* period filter — This month is live, past months open their statement */}
      <PeriodChips
        months={income.previous}
        view={eview}
        openKey={eopen}
        onNow={() => setEview("now")}
        onMonth={(key) => {
          setEview("hist");
          setEopen(key);
        }}
      />

      {eview === "hist" ? (
        <MonthStatements
          tenantName={tenantName}
          months={income.previous}
          openKey={eopen}
          onToggle={(key) => setEopen(eopen === key ? null : key)}
          onDownloaded={(label) => fire(`📄 ${label} statement downloaded`)}
        />
      ) : (
        <>
          {/* ── money in ── */}
          <GrossCard income={income} />
          <HowStudentsPaid month={income.current} />

          {/* ── money out ── */}
          <MoneyCard
            label={`SESSION PAY · ${monthLabel.toUpperCase()}`}
            amount={accrued}
            note="What your people have earned teaching. You settle it by bank or UPI and record it here — DanceOS does not move this money."
            segments={ledger.people
              .filter((p) => p.owedInr + p.paidInr > 0)
              .map((p, i) => ({ label: p.personName.split(" ")[0], value: p.owedInr + p.paidInr, colour: barColour(i) }))}
            tiles={[
              [money(ledger.paidTotal), "Settled", GREEN],
              [money(ledger.inTransitTotal), "In transit", GOLD],
              [money(ledger.owedTotal), "Owed", RED],
            ]}
          />

          {ledger.people.length === 0 ? (
            <div
              style={{
                background: CARD,
                border: `1px solid ${LINE}`,
                borderRadius: 16,
                padding: "16px 15px",
                fontSize: 12.5,
                color: SUB,
                marginBottom: 10,
              }}
            >
              Nobody has taught a session yet. Put an artist or an assistant on a class, set what a session pays, and
              what you owe them shows up here once the class has run.
            </div>
          ) : (
            <>
              <SectionLabel>WHAT YOU OWE</SectionLabel>
              <LedgerBlock
                rows={rows}
                openKey={openRow}
                onToggle={(k) => setOpenRow(openRow === k ? null : k)}
                whoLabel="SESSIONS"
              />
              {openRow ? (
                (() => {
                  const person = ledger.people.find((p) => p.userId === openRow);
                  if (!person) return null;
                  return (
                    <div style={{ marginTop: -4, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        disabled={person.unpaid.length === 0 || person.owedInr <= 0}
                        onClick={() => openPaySheet(person)}
                        style={{
                          flex: 1,
                          background: person.owedInr > 0 ? GREEN : CARD,
                          color: person.owedInr > 0 ? "#fff" : SUB,
                          border: `1px solid ${person.owedInr > 0 ? GREEN : LINE}`,
                          borderRadius: 999,
                          padding: "11px 14px",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: person.owedInr > 0 ? "pointer" : "default",
                          fontFamily: "inherit",
                        }}
                      >
                        {person.owedInr > 0 ? `Record a payment · ${money(person.owedInr)}` : "Nothing outstanding"}
                      </button>
                    </div>
                  );
                })()
              ) : null}
            </>
          )}

          {ledger.payouts.length > 0 ? (
            <>
              <SectionLabel>WHAT YOU HAVE SETTLED</SectionLabel>
              {ledger.payouts.map((p) => (
                <SettlementRow
                  key={p.id}
                  title={`${p.personName} · ${PAYOUT_METHOD_LABEL[p.method]}`}
                  meta={`${p.paidOn}${p.providerRef ? ` · ${p.providerRef}` : ""} · ${p.sessionCount} session${
                    p.sessionCount === 1 ? "" : "s"
                  } · ${PAYOUT_STATUS_LABEL[p.status]}`}
                  amount={p.amountInr}
                  tone={payoutTone(p.status)}
                  onOpen={() => {
                    setError(null);
                    setOpenPayout(p.id);
                  }}
                />
              ))}
            </>
          ) : null}
        </>
      )}

      {payPerson ? (
        <Sheet
          title={`Pay ${payPerson.personName}`}
          sub="Money you have already sent. Pick the sessions it covers — the amount is counted from the rates on record."
          onClose={() => setPayPerson(null)}
        >
          <div style={{ marginBottom: 12 }}>
            {payPerson.unpaid.map((s) => {
              const on = chosen.has(s.sessionId);
              return (
                <label
                  key={s.sessionId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 11px",
                    marginBottom: 6,
                    background: CARD,
                    border: `1.5px solid ${on ? GREEN : LINE}`,
                    borderRadius: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(chosen);
                      if (on) next.delete(s.sessionId);
                      else next.add(s.sessionId);
                      setChosen(next);
                    }}
                    style={{ accentColor: GREEN }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>{sessionDayLabel(s.startsAt)}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>{s.classTitle}</span>
                  </span>
                  <b style={{ fontSize: 12.5, fontFamily: DOS_MONO }}>{money(s.rateInr)}</b>
                </label>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <select
              aria-label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PayoutMethod)}
              style={{ ...inputStyle, flex: 1 }}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYOUT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
            <select
              aria-label="State"
              value={status}
              onChange={(e) => setStatus(e.target.value as PayoutStatus)}
              style={{ ...inputStyle, flex: 1 }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYOUT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <input
            aria-label="Reference"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="UTR or reference (optional)"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {error ? <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>{error}</div> : null}

          <button
            type="button"
            disabled={busy || chosen.size === 0 || chosenTotal <= 0}
            onClick={async () => {
              const ok = await run(
                () =>
                  recordPayoutAction({
                    tenantId,
                    userId: payPerson.userId,
                    sessionIds: [...chosen],
                    method,
                    status,
                    providerRef: ref.trim() || null,
                    note: note.trim() || null,
                  }),
                `Recorded ${money(chosenTotal)} to ${payPerson.personName}`
              );
              if (ok) setPayPerson(null);
            }}
            style={{
              width: "100%",
              background: chosen.size > 0 && chosenTotal > 0 ? GREEN : CARD,
              color: chosen.size > 0 && chosenTotal > 0 ? "#fff" : SUB,
              border: "none",
              borderRadius: 999,
              padding: "13px 16px",
              fontSize: 14,
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {chosenTotal > 0
              ? `Record ${money(chosenTotal)} · ${chosen.size} session${chosen.size === 1 ? "" : "s"}`
              : "Pick a session with a rate"}
          </button>
        </Sheet>
      ) : null}

      {openPayoutRow ? (
        <Sheet
          title={`${money(openPayoutRow.amountInr)} to ${openPayoutRow.personName}`}
          sub={`${openPayoutRow.paidOn} · ${PAYOUT_METHOD_LABEL[openPayoutRow.method]} · ${
            openPayoutRow.sessionCount
          } session${openPayoutRow.sessionCount === 1 ? "" : "s"}`}
          onClose={() => setOpenPayout(null)}
        >
          <SectionLabel>STATE</SectionLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => setPayoutStatusAction({ payoutId: openPayoutRow.id, status: s }),
                    `Marked ${PAYOUT_STATUS_LABEL[s]}`
                  )
                }
                style={{
                  padding: "8px 13px",
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: openPayoutRow.status === s ? INK : CARD,
                  color: openPayoutRow.status === s ? LILAC : SUB,
                  border: `1px solid ${LINE}`,
                }}
              >
                {PAYOUT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {error ? <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>{error}</div> : null}

          <div style={{ fontSize: 11.5, color: SUB, marginBottom: 10 }}>
            Voiding puts these sessions back on the owed list. The record stays readable — nothing is destroyed.
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const ok = await run(
                () => voidPayoutAction({ payoutId: openPayoutRow.id }),
                "Payment voided — those sessions are owed again"
              );
              if (ok) setOpenPayout(null);
            }}
            style={{
              width: "100%",
              background: CARD,
              color: RED,
              border: `1.5px solid ${RED}55`,
              borderRadius: 999,
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Void this payment
          </button>
        </Sheet>
      ) : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            background: LINE,
            border: `1.5px solid ${GREEN}`,
            color: INK,
            padding: "11px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            maxWidth: 390,
            textAlign: "center",
            zIndex: 800,
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
