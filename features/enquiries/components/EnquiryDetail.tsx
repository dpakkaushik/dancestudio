"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  answerQuoteAction,
  recordEnquiryPaymentAction,
  sendQuoteAction,
  setEnquiryStatusAction,
} from "@/features/enquiries/server-actions/enquiries";
import { DosHero, EnqIcon, Eyebrow, Figure, Surface, agoWords, dateWords, money, pressKey } from "@/features/inbox/components/inbox-kit";
import { DOS_MONO } from "@/features/inbox/components/inbox-kit";
import { DOS_UI, LILAC } from "@/lib/design/tokens";
import {
  ENQ_STAGES,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  enquiryStage,
  enquiryTypeOf,
  liveQuoteOf,
  type Enquiry,
  type EnquiryStatus,
} from "@/types/enquiry";

/** One enquiry, lifted from prototype S_enqdetail (5380-5616). "mine" = the
 *  enquiry came TO me, so I am the one who prices it. An enquiry I SENT is one I
 *  can only answer. Every control below asks this question first.
 *
 *  THE QUOTE, FROM BOTH ENDS (5451-5462): the side decides what you see. On an
 *  enquiry that came IN you send quotes and watch for an answer. On one you SENT
 *  you are shown the price and asked. Either way the whole history is on the
 *  page, oldest first, so a revision reads as a revision.
 *
 *  Money, honestly: the business RECORDS the advance and the balance as
 *  received (Step 13's limit — DanceOS records it, it does not move it). The
 *  sender's "Pay" becomes a real payment when the Cashfree rail reaches enquiries; until
 *  then it says so rather than pretending. */

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

export function EnquiryDetail({ enquiry: e, mine, nowIso }: { enquiry: Enquiry; mine: boolean; nowIso: string }) {
  const router = useRouter();
  const type = enquiryTypeOf(e.typeKey);
  const tint = ENQ_TINT[e.typeKey] ?? "#8B5CF6";
  const stage = enquiryStage(e);
  const live = liveQuoteOf(e);
  const hist = e.quotes;

  const [stOpen, setStOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const [qCost, setQCost] = useState("");
  const [qAdv, setQAdv] = useState("30");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    router.refresh();
    return true;
  };

  const who = mine ? e.fromName : e.tenantName;
  const worth = live ? `worth about ${money(live.costInr)}` : "no quote yet";
  const rows: Array<[string, string]> = [
    ...e.fields.filter(([k]) => k !== "Enquiry"),
    [e.dates.length > 1 ? "Dates" : "Date", e.dates.map(dateWords).join(", ")],
    ...(e.whereText ? ([["Where", e.whereText]] as Array<[string, string]>) : []),
  ];
  const tel = String(e.mobile ?? "").replace(/[^\d+]/g, "");

  return (
    <div style={{ background: LILAC, maxWidth: 430, margin: "0 auto", color: "var(--text)", paddingBottom: 40, fontFamily: DOS_UI, minHeight: "100vh" }}>
      <DosHero
        tint={tint}
        label={mine ? type?.label ?? e.typeKey : `${type?.label ?? e.typeKey} · you asked`}
        title={who}
        sub={`${agoWords(e.createdAt, nowIso)} · ${worth}`}
        right={
          <span style={{ width: 38, height: 38, borderRadius: 19, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <EnqIcon k={e.typeKey} size={19} color="#fff" sw={2} />
          </span>
        }
      />
      <div style={{ padding: "12px 16px 0" }}>
        {/* reach them — a toast saying "Calling…" is not a call; with a number on
            the record this hands off to the dialler, without one it says so */}
        {mine ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
            {tel ? (
              <a
                href={`tel:${tel}`}
                aria-label={`Call ${who}`}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", fontWeight: 800, fontSize: 13, color: "var(--text)", textDecoration: "none" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
                </svg>
                Call
              </a>
            ) : (
              <div style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--card)", border: "1px dashed var(--el)", fontSize: 12, color: "var(--sub)" }}>
                No number on this enquiry — quote them here instead
              </div>
            )}
          </div>
        ) : null}
        {mine && e.mobile ? <div style={{ fontFamily: DOS_MONO, fontSize: 11, color: "var(--sub)", textAlign: "center", marginBottom: 12 }}>{e.mobile}</div> : null}

        {/* status — the business's to move by hand; the derived stage wins when a quote exists */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div
            role={mine ? "button" : undefined}
            tabIndex={mine ? 0 : undefined}
            aria-label={mine ? "Change the stage" : undefined}
            onKeyDown={mine ? pressKey(() => setStOpen((v) => !v)) : undefined}
            onClick={mine ? () => setStOpen((v) => !v) : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--el)", borderRadius: 12, padding: "11px 12px", cursor: mine ? "pointer" : "default" }}
          >
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)" }}>STATUS</span>
            <span data-testid="enquiry-stage" style={{ flex: 1, fontSize: 12.5, fontWeight: 900, color: tint }}>
              {ENQ_STAGE_WORD[stage]}
            </span>
            {mine ? <span style={{ fontSize: 11, color: "var(--sub)" }}>▾</span> : null}
          </div>
          {stOpen ? (
            <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 60, background: "var(--solid)", border: "1px solid var(--el)", borderRadius: 12, padding: 5, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
              {ENQ_STAGES.map((s: EnquiryStatus) => (
                <div
                  key={s}
                  role="button"
                  tabIndex={0}
                  onKeyDown={pressKey(() => {
                    setStOpen(false);
                    void run(() => setEnquiryStatusAction({ enquiryId: e.id, status: s }), `Moved to ${ENQ_STAGE_WORD[s]}`);
                  })}
                  onClick={() => {
                    setStOpen(false);
                    void run(() => setEnquiryStatusAction({ enquiryId: e.id, status: s }), `Moved to ${ENQ_STAGE_WORD[s]}`);
                  }}
                  style={{ padding: "8px 9px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: stage === s ? 900 : 600, background: stage === s ? "var(--el)" : "transparent" }}
                >
                  {ENQ_STAGE_WORD[s]}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* what they asked for — exactly the fields this type collects */}
        <Surface tint={tint}>
          <Eyebrow tint={tint}>{mine ? "WHAT THEY ASKED FOR" : "WHAT YOU ASKED FOR"}</Eyebrow>
          {rows.map(([k, v], i) => (
            <div key={`${k}·${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--el)", fontSize: 11.5 }}>
              <span style={{ color: "var(--sub)" }}>{k}</span>
              <b style={{ textAlign: "right", fontFamily: /date|perform|session|panel|judges/i.test(k) ? DOS_MONO : DOS_UI, fontWeight: 700 }}>{v}</b>
            </div>
          ))}
        </Surface>
        <Surface>
          <Eyebrow>{mine ? "THEIR MESSAGE" : "YOUR MESSAGE"}</Eyebrow>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{e.message}</div>
        </Surface>

        {hist.length > 0 ? (
          <Surface tint={live?.status === "declined" ? "#F87171" : "#22C55E"}>
            <Eyebrow tint={live?.status === "declined" ? "#F87171" : "#22C55E"}>{hist.length > 1 ? `QUOTES · ${hist.length}` : "QUOTE"}</Eyebrow>
            {hist.map((q) => {
              const dead = q.status === "superseded";
              const lab = q.fullPaidAt
                ? "Paid in full"
                : q.advancePaidAt
                  ? "Advance paid"
                  : q.status === "accepted"
                    ? "Accepted"
                    : q.status === "declined"
                      ? "Declined"
                      : dead
                        ? "Replaced"
                        : "Waiting on an answer";
              const c2 = q.advancePaidAt || q.fullPaidAt || q.status === "accepted" ? "#22C55E" : q.status === "declined" ? "#F87171" : dead ? "var(--muted)" : "#F59E0B";
              return (
                <div key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--el)", opacity: dead ? 0.55 : 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", fontFamily: DOS_MONO }}>#{q.n}</span>
                    <Figure size={13}>{money(q.costInr)}</Figure>
                    <span data-testid={`quote-${q.n}-state`} style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: c2 }}>
                      {lab}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                    {q.advancePct > 0 ? `${money(q.advanceInr)} (${q.advancePct}%) up front · ${money(q.costInr - q.advanceInr)} on completion` : "No advance — the whole amount on completion"}
                    {` · ${agoWords(q.createdAt, nowIso)}`}
                  </div>
                </div>
              );
            })}

            {/* what you can do about it */}
            {live && live.status === "sent" ? (
              mine ? (
                <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 9, lineHeight: 1.5 }}>Sent to {e.fromName}. You will see it here the moment they answer.</div>
              ) : (
                <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Decline this quote"
                    onClick={() => void run(() => answerQuoteAction({ quoteId: live.id, accept: false, enquiryId: e.id }), "Declined — they have been told")}
                    style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 800, padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--sub)", cursor: "pointer", border: "none", fontFamily: "inherit" }}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Accept this quote"
                    onClick={() => void run(() => answerQuoteAction({ quoteId: live.id, accept: true, enquiryId: e.id }), live.advanceInr > 0 ? `Accepted — ${money(live.advanceInr)} due to start` : "Accepted")}
                    style={{ flex: 1.4, textAlign: "center", fontSize: 11.5, fontWeight: 900, padding: 11, borderRadius: 999, background: "#22C55E", color: "#07240F", cursor: "pointer", border: "none", fontFamily: "inherit" }}
                  >
                    Accept {money(live.costInr)}
                  </button>
                </div>
              )
            ) : null}

            {live && live.status === "accepted" && !live.fullPaidAt ? (
              mine ? (
                <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          recordEnquiryPaymentAction({
                            quoteId: live.id,
                            part: live.advancePaidAt || live.advancePct === 0 ? "full" : "advance",
                            enquiryId: e.id,
                          }),
                        live.advancePaidAt || live.advancePct === 0 ? "Paid in full" : `Advance received · ${money(live.advanceInr)}`
                      )
                    }
                    style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 800, padding: 11, borderRadius: 999, background: "rgba(34,197,94,.2)", color: "#22C55E", cursor: "pointer", border: "none", fontFamily: "inherit" }}
                  >
                    {live.advancePaidAt ? "Mark balance received" : live.advancePct === 0 ? "Mark paid in full" : "Mark advance received"}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...bizBtn, background: "#22C55E", color: "#07240F", opacity: 0.55, cursor: "default" }} aria-disabled="true">
                    {live.advancePaidAt ? `Pay the balance · ${money(live.costInr - live.advanceInr)}` : live.advanceInr > 0 ? `Pay the advance · ${money(live.advanceInr)}` : `Pay ${money(live.costInr)}`}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 7, lineHeight: 1.5, textAlign: "center" }}>
                    Payments aren&apos;t switched on yet — settle with {e.tenantName} directly and they will record it here.
                  </div>
                </div>
              )
            ) : null}

            {live?.fullPaidAt ? <div style={{ fontSize: 11.5, fontWeight: 800, color: "#22C55E", marginTop: 10 }}>✓ Settled in full — {money(live.costInr)}</div> : null}
          </Surface>
        ) : null}

        {/* only the side that is being asked can put a price on it */}
        {mine && stage !== "won" && stage !== "lost" ? (
          qOpen ? (
            <Surface tint={tint}>
              <Eyebrow tint={tint}>{hist.length ? "REVISE THE QUOTE" : "SEND A QUOTE"}</Eyebrow>
              <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", marginBottom: 4 }}>PROJECT COST</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 900 }}>₹</span>
                <input
                  value={qCost}
                  onChange={(ev) => setQCost(ev.target.value.replace(/[^\d]/g, ""))}
                  placeholder="25000"
                  inputMode="numeric"
                  aria-label="Project cost"
                  style={{ flex: 1, minWidth: 0, background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 10, padding: "11px 12px", fontSize: 14, fontWeight: 700, fontFamily: DOS_MONO, color: "var(--text)", outline: "none" }}
                />
              </div>
              <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", marginBottom: 5 }}>ADVANCE BEFORE STARTING</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {["0", "30", "50", "100"].map((pc) => (
                  <span
                    key={pc}
                    role="button"
                    tabIndex={0}
                    aria-pressed={qAdv === pc}
                    aria-label={pc === "0" ? "No advance" : `${pc}% advance`}
                    onKeyDown={pressKey(() => setQAdv(pc))}
                    onClick={() => setQAdv(pc)}
                    style={{ flex: 1, textAlign: "center", padding: "9px 3px", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 800, background: qAdv === pc ? "var(--text)" : "var(--el)", color: qAdv === pc ? "var(--solid)" : "var(--sub)" }}
                  >
                    {pc === "0" ? "None" : `${pc}%`}
                  </span>
                ))}
              </div>
              {(() => {
                const cost = Number(qCost) || 0;
                const adv = Math.round((cost * Number(qAdv)) / 100);
                return (
                  <div style={{ background: "var(--solid)", borderRadius: 11, padding: "9px 11px", marginBottom: 9 }}>
                    {(
                      [
                        ["Project cost", money(cost)],
                        ["Advance now", adv ? `${money(adv)} (${qAdv}%)` : "not required"],
                        ["On completion", money(cost - adv)],
                      ] as Array<[string, string]>
                    ).map(([k3, v3]) => (
                      <div key={k3} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 11.5 }}>
                        <span style={{ color: "var(--sub)" }}>{k3}</span>
                        <b>{v3}</b>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {error ? <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>{error}</div> : null}
              <button
                type="button"
                disabled={busy || !(Number(qCost) > 0)}
                aria-label="Send this quote"
                onClick={async () => {
                  const cost = Number(qCost) || 0;
                  const ok = await run(() => sendQuoteAction({ enquiryId: e.id, costInr: cost, advancePct: Number(qAdv) }), hist.length ? `Revised quote sent · ${money(cost)}` : `Quote sent · ${money(cost)}`);
                  if (ok) {
                    setQOpen(false);
                    setQCost("");
                  }
                }}
                style={{ ...bizBtn, opacity: Number(qCost) > 0 ? 1 : 0.5 }}
              >
                {hist.length ? "Send the revised quote" : "Send quote"}
              </button>
            </Surface>
          ) : (
            <button type="button" aria-label={hist.length ? "Revise the quote" : "Send a quote"} onClick={() => setQOpen(true)} style={{ ...bizBtn, background: tint, color: "#08060C" }}>
              {hist.length ? "Revise the quote" : "Send a quote"}
            </button>
          )
        ) : null}

        {error && !qOpen ? <div style={{ fontSize: 11, color: "#F87171", marginTop: 8 }}>{error}</div> : null}
      </div>

      {toast ? (
        <div style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: `1.5px solid ${tint}`, color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
