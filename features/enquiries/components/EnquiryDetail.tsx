"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  answerEndingAction,
  answerQuoteAction,
  cancelAdditionAction,
  declineCompletionAction,
  endEnquiryAction,
  markCompleteAction,
  recordEnquiryPaymentAction,
  respondToEnquiryAction,
  retractEndingAction,
  sendAdditionAction,
  sendQuoteAction,
} from "@/features/enquiries/server-actions/enquiries";
import { confirmCheckoutAction, startEnquiryCheckoutAction } from "@/features/payments/server-actions/payments";
import { EnqFace, EnquiryRoad, stageTint } from "@/features/enquiries/components/enquiry-kit";
import { QuoteComposer, QuoteLines, type ComposerValue } from "@/features/enquiries/components/QuoteComposer";
import { DosHero, EnqIcon, Eyebrow, Surface, agoWords, dateWords, money } from "@/features/inbox/components/inbox-kit";
import { DOS_MONO } from "@/features/inbox/components/inbox-kit";
import { openCashfreeCheckout, preloadCheckout } from "@/lib/cashfree/checkout-client";
import { DOS_UI, LILAC } from "@/lib/design/tokens";
import {
  ENQ_CLOSED,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  additionsOf,
  baseQuoteOf,
  enquiryMoney,
  enquiryStage,
  enquiryTypeOf,
  istDayKey,
  liveQuoteOf,
  openEndingOf,
  quoteExpired,
  revisionAsked,
  type Enquiry,
  type EnquiryQuote,
} from "@/types/enquiry";

/** ONE ENQUIRY, END TO END (3 Oct 2026 — the user's own process, agreed point by
 *  point; it replaces the 2 Oct redesign's hand-moved stages and three closes).
 *
 *  Read top to bottom as the conversation it is:
 *    WHO · WHERE IT STANDS (the road, and who ended it and why)
 *    the business ACCEPTS or DECLINES (with a reason) a new enquiry
 *    WHAT they asked for
 *    THE QUOTE — lines or one total, an advance, a valid-until; the sender
 *      accepts it whole or asks for a revision (with a reason)
 *    THE PROJECT — once on: what it costs, what is paid, what is due, paid
 *      online or recorded by hand; ADDITIONS (and reductions) at any stage
 *    COMPLETION — either side marks it, the other confirms
 *    ENDING IT — before money at once; after money, refund terms the other side
 *      accepts, counters or refuses
 *    QUOTE HISTORY — every quote and every reason, oldest first
 *  Every rule is the database's (the RPCs); the page says it first so a press is
 *  never the way somebody learns it. */

const bizBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "center",
  padding: 13,
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  border: "none",
  fontFamily: "inherit",
};
const ghostBtn: React.CSSProperties = { ...bizBtn, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5 };
const greenBtn: React.CSSProperties = { ...bizBtn, background: "#22C55E", color: "#07240F" };
const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--solid)",
  border: "1.5px solid var(--el)",
  borderRadius: 10,
  padding: "10px 11px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
};
const smallLabel: React.CSSProperties = { fontSize: 9, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" };

const signed = (n: number) => `${n < 0 ? "−" : ""}${money(Math.abs(n))}`;

const quoteWord = (q: EnquiryQuote, nowIso: string): string =>
  q.kind === "addition"
    ? q.status === "accepted"
      ? q.costInr > 0
        ? q.fullPaidAt
          ? "Paid"
          : "Accepted · due"
        : "Accepted"
      : q.status === "declined"
        ? "Declined"
        : q.status === "cancelled"
          ? "Taken back"
          : q.status === "superseded"
            ? "Replaced"
            : "Waiting on an answer"
    : q.fullPaidAt
      ? "Paid in full"
      : q.advancePaidAt && q.advanceInr > 0
        ? "Advance paid"
        : q.status === "accepted"
          ? "Accepted"
          : q.status === "declined"
            ? q.revisionAskedAt
              ? "Revision asked"
              : "Declined"
            : q.status === "superseded"
              ? "Replaced"
              : quoteExpired(q, nowIso)
                ? "Expired"
                : "Waiting on an answer";
const quoteColour = (q: EnquiryQuote, nowIso: string): string =>
  q.fullPaidAt || q.status === "accepted"
    ? "#22C55E"
    : q.status === "declined" || quoteExpired(q, nowIso)
      ? "#F87171"
      : q.status === "superseded" || q.status === "cancelled"
        ? "var(--muted)"
        : "#F59E0B";

/** a reason asked for in place — one pattern for every "say why" on the page */
interface Ask {
  key: string;
  title: string;
  placeholder: string;
  confirm: string;
  /** a refund amount, between 0 and `max`, starting at `start` */
  amount?: { max: number; start: number };
  /** the reason may be left empty (a counter offer keeps the old one) */
  optional?: boolean;
  danger?: boolean;
  run: (reason: string, amount: number | null) => Promise<{ error: string | null }>;
  done: string;
}

export function EnquiryDetail({
  enquiry: e,
  mine,
  canWork,
  nowIso,
  meId,
  payOnline = false,
  paidBack = null,
}: {
  enquiry: Enquiry;
  /** the enquiry came TO me — I am on the business's (or crew's) side */
  mine: boolean;
  /** …and I may work it: an owner or manager, or the crew's leader */
  canWork: boolean;
  nowIso: string;
  /** who is reading — to say which end ended it */
  meId: string;
  /** a business's enquiry on a configured rail — the sender pays here */
  payOnline?: boolean;
  /** the outcome a phone was brought back with from the payment (`/pay/return`) */
  paidBack?: "paid" | "processing" | "refunded" | "failed" | null;
}) {
  const router = useRouter();
  const type = enquiryTypeOf(e.typeKey);
  const tint = ENQ_TINT[e.typeKey] ?? "#8B5CF6";
  const stage = enquiryStage(e);
  const closed = ENQ_CLOSED.has(stage);
  const live = liveQuoteOf(e);
  const base = baseQuoteOf(e);
  const adds = additionsOf(e);
  const quotes = e.quotes.filter((q) => q.kind === "quote");
  const m = enquiryMoney(e);
  const ending = openEndingOf(e);
  const todayKey = istDayKey(nowIso);
  const projectOn = e.status === "ongoing" || e.status === "completing";
  const mySide: "sender" | "business" = mine ? "business" : "sender";
  /* the business's side acts only as an owner, a manager or the crew's leader */
  const acts = mine ? canWork : true;
  const otherName = mine ? e.fromName : e.businessName;

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<null | { mode: "quote" } | { mode: "addition"; revises: EnquiryQuote | null }>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askReason, setAskReason] = useState("");
  const [askAmount, setAskAmount] = useState("");
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  /* ── what is due, in the order it falls due ── */
  const dues: Array<{ quoteId: string; part: "advance" | "balance" | "full" | "addition"; amount: number; word: string }> = [];
  if (base && projectOn) {
    if (m.advanceDueInr > 0) dues.push({ quoteId: base.id, part: "advance", amount: m.advanceDueInr, word: "The advance" });
    for (const a of adds) {
      if (a.status === "accepted" && a.costInr > 0 && !a.fullPaidAt) dues.push({ quoteId: a.id, part: "addition", amount: a.costInr, word: `Addition #${a.n}` });
    }
    if (!m.balancePaid && m.advanceDueInr === 0 && m.balanceInr > 0) {
      dues.push({ quoteId: base.id, part: base.advanceInr > 0 ? "balance" : "full", amount: m.balanceInr, word: base.advanceInr > 0 ? "The balance" : "The project" });
    }
  }
  const canPay = !mine && payOnline && dues.length > 0 && !ending;
  useEffect(() => {
    if (canPay) preloadCheckout();
  }, [canPay]);

  const fire = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
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
    router.refresh();
    return true;
  };
  const openAsk = (a: Ask) => {
    setAsk(a);
    setAskReason("");
    setAskAmount(a.amount ? String(a.amount.start) : "");
    setError(null);
  };
  const submitAsk = async () => {
    if (!ask) return;
    const reason = askReason.trim();
    if (!reason && !ask.optional) {
      setError("Say why — they will read it");
      return;
    }
    let amount: number | null = null;
    if (ask.amount) {
      amount = Number(askAmount);
      if (!Number.isInteger(amount) || amount < 0 || amount > ask.amount.max) {
        setError(`The refund is between ₹0 and ${money(ask.amount.max)}`);
        return;
      }
    }
    const ok = await run(() => ask.run(reason, amount), ask.done);
    if (ok) setAsk(null);
  };

  /* ⚠ PAYING (3 Oct 2026, "payment for enquiry should connect to payments"). Our
     order, then the Cashfree window, then the SERVER asks Cashfree what happened. */
  const confirmPay = async (orderId: string) => {
    setBusy(true);
    setError(null);
    const out = await confirmCheckoutAction({ orderId });
    setBusy(false);
    setOpenOrder(null);
    if (out.error || !out.outcome) {
      setError(out.error ?? "Could not confirm the payment");
      return;
    }
    fire(out.outcome === "booked" ? "Paid — they have been told" : out.outcome === "processing" ? "Payment received — confirming it now" : "That payment could not be applied — it is on its way back");
    router.refresh();
  };
  const pay = async (d: (typeof dues)[number]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await startEnquiryCheckoutAction({ quoteId: d.quoteId, enquiryId: e.id, businessName: e.businessName.slice(0, 80) || "DanceOS", description: `${type?.label ?? "Enquiry"} · ${d.word}` });
    if (!res.checkout) {
      setBusy(false);
      setError(res.error ?? "Could not start the payment");
      return;
    }
    const checkout = res.checkout;
    setOpenOrder(checkout.orderId);
    try {
      const result = await openCashfreeCheckout(checkout.paymentSessionId, checkout.mode);
      if (result.redirect) return;
    } catch (openError: unknown) {
      setBusy(false);
      setOpenOrder(null);
      setError(openError instanceof Error ? openError.message : "Could not open the payment window");
      return;
    }
    void confirmPay(checkout.orderId);
  };

  const submitComposer = async (v: ComposerValue) => {
    if (!composer) return;
    const ok =
      composer.mode === "quote"
        ? await run(() => sendQuoteAction({ enquiryId: e.id, items: v.items, lumpInr: v.lumpInr, advancePct: v.advancePct, validUntil: v.validUntil, note: v.note }), quotes.length ? "Revised quote sent — they have been told" : "Quote sent — they have been told")
        : await run(
            () => sendAdditionAction({ enquiryId: e.id, items: v.items, lumpInr: v.lumpInr, note: v.note, revises: composer.revises?.id ?? null }),
            "Addition sent — they have been told"
          );
    if (ok) setComposer(null);
  };

  const rows: Array<[string, string]> = [
    ...e.fields.filter(([k]) => k !== "Enquiry"),
    [e.dates.length > 1 ? "Dates" : "Date", e.dates.map(dateWords).join(", ")],
    ...(e.whereText ? ([["Where", e.whereText]] as Array<[string, string]>) : []),
  ];
  const tel = String((mine ? e.mobile : e.businessPhone) ?? "").replace(/[^\d+]/g, "");
  const endedBy = e.closedBy === meId ? "by you" : e.closedBy === e.fromUserId ? `by ${e.fromName}` : mine ? "by your side" : `by ${e.businessName}`;
  const accepted = e.endings.find((x) => x.status === "accepted");
  const lastRefused = [...e.endings].reverse().find((x) => x.status === "refused");

  /* ── the "say why" box, drawn where it was asked for ── */
  const askBox = (key: string) =>
    ask && ask.key === key ? (
      <div data-testid={`ask-${key}`} style={{ marginTop: 10, background: "var(--solid)", borderRadius: 12, padding: 11, border: "1.5px solid var(--el)" }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 7 }}>{ask.title}</div>
        {ask.amount ? (
          <>
            <div style={{ ...smallLabel, marginBottom: 5 }}>REFUND · OF {money(ask.amount.max)} PAID</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontWeight: 900 }}>₹</span>
              <input value={askAmount} inputMode="numeric" onChange={(ev) => setAskAmount(ev.target.value.replace(/[^\d]/g, "").slice(0, 9))} aria-label="Refund amount" style={{ ...fieldStyle, flex: 1, fontFamily: DOS_MONO }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(
                [
                  ["Full", ask.amount.max],
                  ["Half", Math.floor(ask.amount.max / 2)],
                  ["None", 0],
                ] as Array<[string, number]>
              ).map(([w, v]) => (
                <button key={w} type="button" aria-pressed={Number(askAmount) === v} onClick={() => setAskAmount(String(v))} style={{ ...ghostBtn, padding: "7px 4px", fontSize: 11, background: Number(askAmount) === v ? "var(--text)" : "var(--el)", color: Number(askAmount) === v ? "var(--solid)" : "var(--sub)" }}>
                  {w}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <textarea value={askReason} maxLength={500} rows={3} onChange={(ev) => setAskReason(ev.target.value)} placeholder={ask.placeholder} aria-label="Reason" style={{ ...fieldStyle, resize: "vertical", marginBottom: 8 }} />
        {error ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginBottom: 8 }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 7 }}>
          <button type="button" onClick={() => setAsk(null)} style={{ ...ghostBtn, flex: 1, color: "var(--sub)" }}>
            Back
          </button>
          <button type="button" disabled={busy} onClick={() => void submitAsk()} style={{ ...bizBtn, flex: 1.5, background: ask.danger ? "#F87171" : "var(--text)", color: ask.danger ? "#1F0707" : "var(--solid)" }}>
            {ask.confirm}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div style={{ background: LILAC, maxWidth: 430, margin: "0 auto", color: "var(--text)", paddingBottom: 40, fontFamily: DOS_UI, minHeight: "100vh" }}>
      <DosHero
        tint={tint}
        label={mine ? type?.label ?? e.typeKey : `${type?.label ?? e.typeKey} · you asked`}
        title={otherName}
        sub={`${agoWords(e.createdAt, nowIso)} · ${m.totalInr ? `project ${money(m.totalInr)}` : live ? `quoted ${money(live.costInr)}` : "no quote yet"}`}
        right={
          <span style={{ width: 38, height: 38, borderRadius: 19, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <EnqIcon k={e.typeKey} size={19} color="#fff" sw={2} />
          </span>
        }
      />
      <div style={{ padding: "12px 16px 0" }}>
        {/* ── WHO ── */}
        <Surface>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <EnqFace path={e.fromPhotoPath} name={e.fromName} size={42} tint={tint} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={smallLabel}>FROM</div>
              <div style={{ fontSize: 13.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mine ? e.fromName : "You"}</div>
            </div>
            <span aria-hidden style={{ color: "var(--muted)", fontSize: 16 }}>
              →
            </span>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div style={smallLabel}>TO</div>
              <div style={{ fontSize: 13.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mine ? "You" : e.businessName}</div>
            </div>
            <EnqFace path={e.toPhotoPath} name={e.businessName} size={42} tint="#64748B" />
          </div>
          {tel ? (
            <a
              href={`tel:${tel}`}
              aria-label={`Call ${otherName}`}
              style={{ marginTop: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 999, background: "var(--solid)", border: "1.5px solid var(--el)", fontWeight: 800, fontSize: 13, color: "var(--text)", textDecoration: "none" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
              </svg>
              Call {mine && e.mobile ? <span style={{ fontFamily: DOS_MONO, fontWeight: 600, color: "var(--sub)" }}>{e.mobile}</span> : null}
            </a>
          ) : null}
        </Surface>

        {/* ── WHERE IT STANDS ── */}
        <Surface tint={stageTint(stage)}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={smallLabel}>WHERE IT STANDS</span>
            <span data-testid="enquiry-stage" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900, color: stageTint(stage) }}>
              {ENQ_STAGE_WORD[stage]}
            </span>
          </div>
          <EnquiryRoad stage={stage} />
          {closed ? (
            <div data-testid="enquiry-closed-by" style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 9, lineHeight: 1.5 }}>
              {ENQ_STAGE_WORD[stage]} {endedBy}
              {e.closedAt ? ` · ${agoWords(e.closedAt, nowIso)}` : ""}
              {e.closeReason ? (
                <div data-testid="close-reason" style={{ marginTop: 4, color: "var(--text)" }}>
                  “{e.closeReason}”
                </div>
              ) : null}
              {accepted && accepted.refundInr > 0 ? (
                <div data-testid="refund-summary" style={{ marginTop: 6, fontWeight: 800, color: "var(--text)" }}>
                  {money(accepted.refundInr)} back
                  {accepted.refundOnlineInr ? ` · ${money(accepted.refundOnlineInr)} online, through Cashfree` : ""}
                  {accepted.refundHandInr ? ` · ${money(accepted.refundHandInr)} by hand` : ""}
                </div>
              ) : null}
            </div>
          ) : null}
          {mine && !canWork ? <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 9 }}>Its owners and managers answer, quote and record money — you can read it.</div> : null}
        </Surface>

        {paidBack ? (
          <div
            role="status"
            data-testid="paid-back"
            style={{
              borderRadius: 14,
              padding: "11px 13px",
              marginBottom: 10,
              fontSize: 12,
              fontWeight: 800,
              background: paidBack === "paid" ? "rgba(34,197,94,.14)" : "var(--card)",
              border: `1.5px solid ${paidBack === "paid" ? "#22C55E" : "var(--el)"}`,
              color: paidBack === "paid" ? "#22C55E" : "var(--sub)",
            }}
          >
            {paidBack === "paid" ? "✓ Payment confirmed" : paidBack === "processing" ? "Payment received — the bank is still confirming it" : paidBack === "refunded" ? "That payment could not be applied — it is on its way back" : "The payment didn't go through — nothing was charged"}
          </div>
        ) : null}

        {/* ── 2 · ACCEPT OR DECLINE (the business, on a new enquiry) ── */}
        {mine && acts && e.status === "new" ? (
          <Surface tint="#3B82F6">
            <Eyebrow tint="#3B82F6">NEW ENQUIRY</Eyebrow>
            <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5, marginBottom: 10 }}>Accept it to start talking price, or decline it — {e.fromName} is told either way.</div>
            <div style={{ display: "flex", gap: 7 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  openAsk({
                    key: "decline",
                    title: "Decline this enquiry?",
                    placeholder: "Why — they will read this",
                    confirm: "Decline",
                    danger: true,
                    run: (reason) => respondToEnquiryAction({ enquiryId: e.id, accept: false, reason }),
                    done: "Declined — they have been told",
                  })
                }
                style={{ ...ghostBtn, flex: 1 }}
              >
                Decline
              </button>
              <button type="button" disabled={busy} onClick={() => void run(() => respondToEnquiryAction({ enquiryId: e.id, accept: true, reason: null }), "Accepted — they have been told")} style={{ ...greenBtn, flex: 1.4 }}>
                Accept enquiry
              </button>
            </div>
            {askBox("decline")}
          </Surface>
        ) : null}

        {/* ── A REVISION ASKED FOR ── */}
        {revisionAsked(e) && live ? (
          <div data-testid="revision-asked" style={{ borderRadius: 14, padding: "11px 13px", marginBottom: 10, fontSize: 12, lineHeight: 1.5, background: "rgba(245,158,11,.12)", border: "1.5px solid #F59E0B" }}>
            <b style={{ color: "#F59E0B" }}>{mine ? `${e.fromName} asked for a revised quote.` : "You asked for a revised quote."}</b>
            {live.answerReason ? <div style={{ marginTop: 4 }}>“{live.answerReason}”</div> : null}
            <div style={{ marginTop: 4, color: "var(--sub)" }}>{mine ? "Send a new one below." : `${e.businessName} has been told — the new quote will land here.`}</div>
          </div>
        ) : null}

        {/* ── WHAT ── */}
        <Surface tint={tint}>
          <Eyebrow tint={tint}>{mine ? "WHAT THEY ASKED FOR" : "WHAT YOU ASKED FOR"}</Eyebrow>
          {rows.map(([k, v], i) => (
            <div key={`${k}·${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1.5px solid var(--el)", fontSize: 11.5 }}>
              <span style={{ color: "var(--sub)" }}>{k}</span>
              <b style={{ textAlign: "right", fontWeight: 700 }}>{v}</b>
            </div>
          ))}
          <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 9 }}>“{e.message}”</div>
        </Surface>

        {/* ── THE QUOTE ── while it is being priced; once the project is on, THE PROJECT below carries it */}
        {live && !projectOn && !(closed && base) ? (
          <Surface tint={quoteColour(live, nowIso)}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={smallLabel}>{quotes.length > 1 ? `QUOTE #${live.n}` : "THE QUOTE"}</span>
              <span data-testid="live-quote-state" style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, color: quoteColour(live, nowIso) }}>
                {quoteWord(live, nowIso)}
              </span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.8, marginTop: 4 }}>{money(live.costInr)}</div>
            <QuoteLines items={live.items} costInr={live.costInr} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(
                [
                  ["Advance", live.advanceInr ? `${money(live.advanceInr)} · ${live.advancePct}%` : "none"],
                  ["On completion", money(live.costInr - live.advanceInr)],
                  ...(live.validUntil ? ([["Valid until", dateWords(live.validUntil)]] as Array<[string, string]>) : []),
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} style={{ flex: 1, background: "var(--solid)", borderRadius: 11, padding: "8px 10px", minWidth: 0 }}>
                  <div style={{ ...smallLabel, letterSpacing: 0.6 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize: 12, fontWeight: 900, marginTop: 2, color: k === "Valid until" && quoteExpired(live, nowIso) ? "#F87171" : undefined }}>{v}</div>
                </div>
              ))}
            </div>
            {live.note ? <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 8, lineHeight: 1.5 }}>{live.note}</div> : null}

            {live.status === "sent" && !closed ? (
              mine ? (
                <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 10, lineHeight: 1.5 }}>
                  {quoteExpired(live, nowIso) ? "It expired before they answered — send a revised one." : `Sent to ${e.fromName}. You will see it here the moment they answer.`}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        openAsk({
                          key: "revise",
                          title: "Ask for a revised quote",
                          placeholder: "What should change — the price, a line, the advance…",
                          confirm: "Ask for a revision",
                          run: (reason) => answerQuoteAction({ quoteId: live.id, enquiryId: e.id, answer: "revise", reason }),
                          done: "Asked for a revised quote — they have been told",
                        })
                      }
                      style={{ ...ghostBtn, flex: 1 }}
                    >
                      Ask to revise
                    </button>
                    <button
                      type="button"
                      disabled={busy || quoteExpired(live, nowIso)}
                      aria-label="Accept this quote"
                      onClick={() => void run(() => answerQuoteAction({ quoteId: live.id, enquiryId: e.id, answer: "accept", reason: null }), live.advanceInr > 0 ? `Accepted — the project is on, ${money(live.advanceInr)} due as the advance` : "Accepted — the project is on")}
                      style={{ ...greenBtn, flex: 1.4, opacity: quoteExpired(live, nowIso) ? 0.45 : 1 }}
                    >
                      {quoteExpired(live, nowIso) ? "Expired" : `Accept ${money(live.costInr)}`}
                    </button>
                  </div>
                  {quoteExpired(live, nowIso) ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 7 }}>This quote expired — ask for a revised one.</div> : null}
                  {askBox("revise")}
                </>
              )
            ) : null}
          </Surface>
        ) : null}

        {/* ── THE PROJECT ── what it costs, what is paid, what is due */}
        {base && (projectOn || closed) ? (
          <Surface tint="#22C55E">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={smallLabel}>THE PROJECT</span>
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, color: m.outstandingInr ? "#F59E0B" : "#22C55E" }}>{m.outstandingInr ? `${money(m.outstandingInr)} to pay` : "✓ Paid in full"}</span>
            </div>
            <div data-testid="project-total" style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.8, marginTop: 4 }}>
              {money(m.totalInr)}
            </div>
            <QuoteLines items={base.items} costInr={base.costInr} />
            <div style={{ marginTop: 9 }}>
              {(
                [
                  ["Quote", money(base.costInr)],
                  ...adds.filter((a) => a.status === "accepted").map((a) => [`Addition #${a.n}`, signed(a.costInr)] as [string, string]),
                  ["Paid", money(m.paidInr)],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, borderBottom: "1px solid var(--el)" }}>
                  <span style={{ color: "var(--sub)" }}>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            {base.note ? <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 8, lineHeight: 1.5 }}>{base.note}</div> : null}

            {projectOn && dues.length ? (
              <div data-testid="dues" style={{ marginTop: 11 }}>
                <div style={{ ...smallLabel, marginBottom: 6 }}>DUE</div>
                {dues.map((d) => (
                  <div key={`${d.quoteId}-${d.part}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>
                      {d.word} · {money(d.amount)}
                    </span>
                    {mine ? (
                      acts ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => recordEnquiryPaymentAction({ quoteId: d.quoteId, enquiryId: e.id, part: d.part }), `${d.word} recorded · ${money(d.amount)}`)}
                          style={{ ...greenBtn, width: "auto", padding: "8px 12px", fontSize: 11.5 }}
                        >
                          Record received
                        </button>
                      ) : null
                    ) : canPay ? (
                      <button type="button" disabled={busy} data-testid="enquiry-pay" onClick={() => void pay(d)} style={{ ...greenBtn, width: "auto", padding: "8px 12px", fontSize: 11.5 }}>
                        Pay {money(d.amount)}
                      </button>
                    ) : null}
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 4, lineHeight: 1.5 }}>
                  {mine ? `For cash or a bank transfer — ${e.fromName} can also pay here online.` : canPay ? "UPI · cards · netbanking, through Cashfree. You come straight back here." : ending ? "Payments pause while the terms to end it are open." : `Settle with ${e.businessName} directly and they will record it here.`}
                </div>
                {busy && openOrder ? (
                  <button type="button" onClick={() => void confirmPay(openOrder)} style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "var(--sub)", fontSize: 11.5, fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                    Paid already, or stuck? Check my payment
                  </button>
                ) : null}
              </div>
            ) : null}
          </Surface>
        ) : null}

        {/* ── ADDITIONS ── */}
        {adds.length || (mine && acts && projectOn && !ending) ? (
          <Surface>
            <Eyebrow>{`ADDITIONS${adds.length ? ` · ${adds.length}` : ""}`}</Eyebrow>
            <div data-testid="additions">
              {adds.map((a) => {
                const revisedBy = adds.find((x) => x.revises === a.id);
                return (
                  <div key={a.id} data-testid={`addition-${a.n}`} style={{ padding: "9px 0", borderBottom: "1px solid var(--el)", opacity: a.status === "cancelled" || a.status === "superseded" ? 0.6 : 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 900, color: "var(--muted)", fontFamily: DOS_MONO }}>#{a.n}</span>
                      <b style={{ fontSize: 14, color: a.costInr < 0 ? "#22C55E" : undefined }}>{a.costInr < 0 ? `${signed(a.costInr)} off` : `+${money(a.costInr)}`}</b>
                      <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, color: quoteColour(a, nowIso) }}>{quoteWord(a, nowIso)}</span>
                    </div>
                    {a.revises ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>Revised from #{adds.find((x) => x.id === a.revises)?.n ?? "?"}</div> : null}
                    {a.note ? <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 3 }}>{a.note}</div> : null}
                    <QuoteLines items={a.items} costInr={a.costInr} />
                    {a.answerReason ? <div style={{ fontSize: 11.5, marginTop: 5 }}>Declined: “{a.answerReason}”</div> : null}
                    {a.status === "sent" && projectOn ? (
                      mine ? (
                        acts ? (
                          <button type="button" disabled={busy} onClick={() => void run(() => cancelAdditionAction({ quoteId: a.id, enquiryId: e.id }), "Taken back — they have been told")} style={{ ...ghostBtn, marginTop: 8, padding: 9, fontSize: 11.5 }}>
                            Take it back
                          </button>
                        ) : null
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                openAsk({
                                  key: `decline-add-${a.id}`,
                                  title: "Decline this addition",
                                  placeholder: "Why — they can send a revised one",
                                  confirm: "Decline",
                                  danger: true,
                                  run: (reason) => answerQuoteAction({ quoteId: a.id, enquiryId: e.id, answer: "decline", reason }),
                                  done: "Declined — they have been told",
                                })
                              }
                              style={{ ...ghostBtn, flex: 1, padding: 10, fontSize: 12 }}
                            >
                              Decline
                            </button>
                            <button type="button" disabled={busy} aria-label={`Accept addition #${a.n}`} onClick={() => void run(() => answerQuoteAction({ quoteId: a.id, enquiryId: e.id, answer: "accept", reason: null }), a.costInr > 0 ? `Accepted — ${money(a.costInr)} is due now` : "Accepted — the balance is lower")} style={{ ...greenBtn, flex: 1.4, padding: 10, fontSize: 12 }}>
                              Accept {a.costInr < 0 ? `${signed(a.costInr)} off` : `+${money(a.costInr)}`}
                            </button>
                          </div>
                          {askBox(`decline-add-${a.id}`)}
                        </>
                      )
                    ) : null}
                    {mine && acts && a.status === "declined" && !revisedBy && projectOn && !ending ? (
                      <button type="button" onClick={() => setComposer({ mode: "addition", revises: a })} style={{ ...ghostBtn, marginTop: 8, padding: 9, fontSize: 11.5 }}>
                        Send a revised addition
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!adds.length ? <div style={{ fontSize: 11.5, color: "var(--sub)" }}>Nothing added yet. Anything extra — or a reduction — goes here, for {e.fromName} to accept.</div> : null}
            {mine && acts && projectOn && !ending && !(composer && composer.mode === "addition") ? (
              <button type="button" onClick={() => setComposer({ mode: "addition", revises: null })} style={{ ...bizBtn, marginTop: 10, background: tint, color: "#08060C" }}>
                Add to the project
              </button>
            ) : null}
            {composer && composer.mode === "addition" ? (
              <div style={{ marginTop: 10 }}>
                <Eyebrow tint={tint}>{composer.revises ? `REVISE ADDITION #${composer.revises.n}` : "ADD TO THE PROJECT"}</Eyebrow>
                <QuoteComposer
                  mode="addition"
                  tint={tint}
                  todayKey={todayKey}
                  start={composer.revises ? { items: composer.revises.items, costInr: composer.revises.costInr, advancePct: 0, note: composer.revises.note } : null}
                  busy={busy}
                  error={error}
                  submitWord="Send the addition"
                  onSubmit={(v) => void submitComposer(v)}
                  onCancel={() => setComposer(null)}
                />
              </div>
            ) : null}
          </Surface>
        ) : null}

        {/* ── COMPLETION ── either side marks it; the other confirms */}
        {projectOn ? (
          <Surface tint={e.status === "completing" ? "#22C55E" : undefined}>
            <Eyebrow>COMPLETION</Eyebrow>
            {e.status === "completing" ? (
              e.completeAskedSide === mySide ? (
                <>
                  <div data-testid="completion-waiting" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    You marked the project complete — waiting for {otherName} to confirm.
                  </div>
                  {acts ? (
                    <button type="button" disabled={busy} onClick={() => void run(() => declineCompletionAction({ enquiryId: e.id, reason: null }), "Taken back — the project is on again")} style={{ ...ghostBtn, marginTop: 9, padding: 10, fontSize: 12 }}>
                      Take it back
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <div data-testid="completion-asked" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <b>{otherName}</b> marked the project complete. Confirm it to close the project.
                  </div>
                  {acts ? (
                    <>
                      <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openAsk({
                              key: "not-yet",
                              title: "Not finished yet?",
                              placeholder: "What is still to do",
                              confirm: "Say not yet",
                              run: (reason) => declineCompletionAction({ enquiryId: e.id, reason }),
                              done: "Sent back — the project is on again",
                            })
                          }
                          style={{ ...ghostBtn, flex: 1 }}
                        >
                          Not finished
                        </button>
                        <button type="button" disabled={busy} onClick={() => void run(() => markCompleteAction({ enquiryId: e.id }), "Completed — the project is closed")} style={{ ...greenBtn, flex: 1.4 }}>
                          Confirm complete
                        </button>
                      </div>
                      {askBox("not-yet")}
                    </>
                  ) : null}
                </>
              )
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5 }}>
                  {m.readyToComplete
                    ? `Everything is paid. Mark it complete when the job is done — ${otherName} confirms it.`
                    : `It can be completed once ${[m.outstandingInr ? `${money(m.outstandingInr)} is paid` : null, m.additionsWaiting ? "every addition is answered" : null].filter(Boolean).join(" and ") || "everything is settled"}.`}
                </div>
                {acts ? (
                  <button type="button" disabled={busy || !m.readyToComplete || Boolean(ending)} onClick={() => void run(() => markCompleteAction({ enquiryId: e.id }), "Marked complete — they confirm it")} style={{ ...greenBtn, marginTop: 9, opacity: m.readyToComplete && !ending ? 1 : 0.45 }}>
                    Mark the project complete
                  </button>
                ) : null}
              </>
            )}
          </Surface>
        ) : null}

        {/* ── ENDING IT ── terms after money; at once before it */}
        {ending ? (
          <Surface tint="#F87171">
            <Eyebrow tint="#F87171">{ending.outcome === "withdrawn" ? "ENDING IT · WITHDRAWAL" : "ENDING IT · CALLED OFF"}</Eyebrow>
            <div data-testid="ending-terms" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <b>{ending.side === mySide ? "You" : otherName}</b> proposed {money(ending.refundInr)} back of the {money(m.paidInr)} paid.
              <div style={{ marginTop: 4, color: "var(--sub)" }}>“{ending.reason}”</div>
            </div>
            {e.endings.length > 1 ? (
              <div style={{ marginTop: 8 }}>
                {e.endings
                  .filter((x) => x.id !== ending.id)
                  .map((x) => (
                    <div key={x.id} style={{ fontSize: 10.5, color: "var(--muted)", padding: "2px 0" }}>
                      {x.side === mySide ? "You" : otherName} · {money(x.refundInr)} · {x.status}
                      {x.answerReason ? ` — “${x.answerReason}”` : ""}
                    </div>
                  ))}
              </div>
            ) : null}
            {acts ? (
              ending.side === mySide ? (
                <button type="button" disabled={busy} onClick={() => void run(() => retractEndingAction({ endingId: ending.id, enquiryId: e.id }), "Taken back — the project carries on")} style={{ ...ghostBtn, marginTop: 10 }}>
                  Take back these terms
                </button>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        openAsk({
                          key: "refuse-ending",
                          title: "Refuse these terms?",
                          placeholder: "Why — the project stays open",
                          confirm: "Refuse",
                          danger: true,
                          run: (reason) => answerEndingAction({ endingId: ending.id, enquiryId: e.id, answer: "refuse", refundInr: null, reason }),
                          done: "Refused — the project stays open",
                        })
                      }
                      style={{ ...ghostBtn, flex: 1, minWidth: 90 }}
                    >
                      Refuse
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        openAsk({
                          key: "counter-ending",
                          title: "Propose different terms",
                          placeholder: "Why this amount (optional)",
                          confirm: "Send the counter",
                          optional: true,
                          amount: { max: m.paidInr, start: ending.refundInr },
                          run: (reason, amount) => answerEndingAction({ endingId: ending.id, enquiryId: e.id, answer: "counter", refundInr: amount, reason: reason || null }),
                          done: "Counter sent — they have been told",
                        })
                      }
                      style={{ ...ghostBtn, flex: 1, minWidth: 90 }}
                    >
                      Counter
                    </button>
                    <button type="button" disabled={busy} aria-label="Accept these terms" onClick={() => void run(() => answerEndingAction({ endingId: ending.id, enquiryId: e.id, answer: "accept", refundInr: null, reason: null }), "Agreed — the enquiry is closed")} style={{ ...greenBtn, flex: 1.4, minWidth: 120 }}>
                      Accept · {money(ending.refundInr)} back
                    </button>
                  </div>
                  {askBox("refuse-ending")}
                  {askBox("counter-ending")}
                </>
              )
            ) : null}
          </Surface>
        ) : null}

        {lastRefused && !ending && !closed ? (
          <div data-testid="ending-refused" style={{ borderRadius: 14, padding: "11px 13px", marginBottom: 10, fontSize: 12, lineHeight: 1.5, background: "var(--card)", border: "1.5px solid var(--el)" }}>
            {lastRefused.side === mySide ? `${otherName} refused your terms` : "You refused their terms"}
            {lastRefused.answerReason ? `: “${lastRefused.answerReason}”` : ""}. The project stays open.{" "}
            <Link href="/support" style={{ color: "var(--text)", fontWeight: 800 }}>
              Message DanceOS
            </Link>{" "}
            if you cannot agree.
          </div>
        ) : null}

        {/* ── THE QUOTE COMPOSER (the business, before the project is on) ── */}
        {mine && acts && ["new", "accepted", "quoted"].includes(e.status) ? (
          composer && composer.mode === "quote" ? (
            <Surface tint={tint}>
              <Eyebrow tint={tint}>{quotes.length ? "REVISE THE QUOTE" : "SEND A QUOTE"}</Eyebrow>
              <QuoteComposer
                mode="quote"
                tint={tint}
                todayKey={todayKey}
                start={live ? { items: live.items, costInr: live.costInr, advancePct: live.advancePct, note: live.note } : null}
                busy={busy}
                error={error}
                submitWord={quotes.length ? "Send the revised quote" : "Send quote"}
                onSubmit={(v) => void submitComposer(v)}
                onCancel={() => setComposer(null)}
              />
            </Surface>
          ) : (
            <button type="button" onClick={() => setComposer({ mode: "quote" })} style={{ ...bizBtn, background: tint, color: "#08060C", marginBottom: 10 }}>
              {quotes.length ? "Revise the quote" : "Send a quote"}
            </button>
          )
        ) : null}

        {/* ── END IT (either side, while it is open and no terms are) ── */}
        {!closed && !ending && acts && !(mine && e.status === "new") ? (
          <Surface>
            <Eyebrow>{mine ? "CALL IT OFF" : "WITHDRAW"}</Eyebrow>
            <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5, marginBottom: 9 }}>
              {m.paidInr > 0
                ? `${money(m.paidInr)} has been paid — propose how much goes back, and ${otherName} accepts, counters or refuses.`
                : `Nothing has been paid, so it ends at once. ${otherName} is told why.`}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                openAsk({
                  key: "end",
                  title: mine ? "Call off this enquiry?" : "Withdraw this enquiry?",
                  placeholder: "Why — they will read this",
                  confirm: m.paidInr > 0 ? "Propose these terms" : mine ? "Call it off" : "Withdraw",
                  danger: true,
                  amount: m.paidInr > 0 ? { max: m.paidInr, start: mine ? m.paidInr : m.paidInr } : undefined,
                  run: (reason, amount) => endEnquiryAction({ enquiryId: e.id, reason, refundInr: amount }),
                  done: m.paidInr > 0 ? "Terms sent — they have been told" : mine ? "Called off — they have been told" : "Withdrawn — they have been told",
                })
              }
              style={{ ...bizBtn, background: "var(--solid)", color: "#F87171", border: "1.5px solid var(--el)" }}
            >
              {mine ? "Call it off" : "Withdraw enquiry"}
            </button>
            {askBox("end")}
          </Surface>
        ) : null}

        {/* ── QUOTE HISTORY ── every quote and every reason, oldest first */}
        {quotes.length ? (
          <Surface>
            <Eyebrow>{`QUOTE HISTORY · ${quotes.length}`}</Eyebrow>
            <div data-testid="quote-history">
              {quotes.map((q, i) => {
                const prev = quotes[i - 1];
                const delta = prev ? q.costInr - prev.costInr : 0;
                const dead = q.status === "superseded";
                return (
                  <div key={q.id} style={{ display: "flex", gap: 10, opacity: dead ? 0.6 : 1 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: quoteColour(q, nowIso), marginTop: 4 }} />
                      {i < quotes.length - 1 ? <span style={{ flex: 1, width: 2, background: "var(--el)", marginTop: 2 }} /> : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: i < quotes.length - 1 ? 12 : 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 900, color: "var(--muted)", fontFamily: DOS_MONO }}>#{q.n}</span>
                        <b style={{ fontSize: 13, textDecoration: dead ? "line-through" : "none" }}>{money(q.costInr)}</b>
                        {delta ? (
                          <span style={{ fontSize: 10, fontWeight: 800, color: delta < 0 ? "#22C55E" : "#F59E0B" }}>
                            {delta < 0 ? "▼" : "▲"} {money(Math.abs(delta))}
                          </span>
                        ) : null}
                        <span data-testid={`quote-${q.n}-state`} style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: quoteColour(q, nowIso) }}>
                          {quoteWord(q, nowIso)}
                        </span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                        {q.items.length ? `${q.items.length} line${q.items.length > 1 ? "s" : ""} · ` : ""}
                        {q.advancePct > 0 ? `${money(q.advanceInr)} (${q.advancePct}%) up front` : "No advance"} · {agoWords(q.createdAt, nowIso)}
                      </div>
                      {q.answerReason ? <div style={{ fontSize: 11, marginTop: 3 }}>“{q.answerReason}”</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        ) : null}

        {error && !ask && !composer ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 8 }}>
            {error}
          </div>
        ) : null}
      </div>

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
