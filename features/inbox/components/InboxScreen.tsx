"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { respondToClaimAction, withdrawClaimAction } from "@/features/claims/server-actions/claims";
import { respondToCrewAskAction, respondToPartnerAskAction, withdrawCrewAskAction } from "@/features/crews/server-actions/crews";
import { acceptInviteAction, declineInviteAction, revokeInviteAction } from "@/features/staff/server-actions/staff";
import { DOS_UI, LILAC, PINK } from "@/lib/design/tokens";
import {
  ENQ_STAGES,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  ENQ_TYPES,
  enquiryStage,
  enquiryTypeOf,
  enquiryValueInr,
  liveQuoteOf,
  type Enquiry,
  type EnquiryStatus,
  type EnquiryTypeKey,
} from "@/types/enquiry";
import { DOS_MONO, EnqIcon, agoWords, initialsOf, moneyShort, pressKey } from "./inbox-kit";

/** The Inbox, lifted from prototype S_chats (5617-6098) after internal chat was
 *  removed from the product: "what remains is the work — something somebody has
 *  asked of you, and something somebody wants to book. The badge counts only
 *  what waits on YOU." Two desks — Requests and Enquiries — and All, which is
 *  every outstanding item across the two, newest first.
 *
 *  Requests are rows that already exist: class claims (Step 11) and team invites
 *  (Step 12b), each with two sides. RECEIVED is somebody claiming YOU; SENT is
 *  what your business has asked of other people and is still waiting on.
 *  Enquiries are Step 18's own rows. Left out, tracked in the backlog: studio
 *  rental requests (S_rentals), the Remind button (needs notifications, Step
 *  24), and the inline quote controls on the list card — the prototype's own
 *  detail page supersedes them ("A QUOTE IS A CONVERSATION, NOT A FIELD"). */

export interface RequestItem {
  /** Step 22 added crew asks and duet-partner asks to the two Step 18 kinds */
  kind: "claim" | "invite" | "crew" | "partner";
  id: string;
  dir: "in" | "out";
  /** in: who is asking; out: who is being asked */
  who: string;
  /** DOS_LINK_WHAT (1805): the role in words */
  what: string;
  /** DOS_LINK_WHAT verb: "list you as the artist on" */
  verb: string;
  subjectKind: "CLASS" | "STUDIO" | "CREW" | "EVENT";
  subjectTitle: string;
  when: string | null;
  href: string | null;
  at: string;
  note: string | null;
  claimId?: string;
  inviteCode?: string;
  inviteId?: string;
  tenantId?: string;
  /** crew asks (crew_members.id) and duet-partner asks (event_bookings.id) */
  memberId?: string;
  crewId?: string;
  bookingId?: string;
}

const KIND_WORD: Record<RequestItem["kind"], string> = { claim: "class", invite: "team", crew: "crew", partner: "duet" };

const REQ_TINT = "#8B5CF6";

const Row = ({ children, c }: { children: React.ReactNode; c: string }) => (
  <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${c}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>{children}</div>
);

const pillBtn = (on: boolean): React.CSSProperties => ({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 15px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: -0.2,
  whiteSpace: "nowrap",
  background: on ? "var(--text)" : "var(--card)",
  color: on ? "var(--solid)" : "var(--sub)",
  border: `1px solid ${on ? "var(--text)" : "var(--el)"}`,
  transition: "background .16s",
});

const emptyBox: React.CSSProperties = { background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center" };

export function InboxScreen({
  accent,
  requestsIn,
  requestsOut,
  enquiriesIn,
  enquiriesOut,
  nowIso,
}: {
  /** the profile-tinted wash the rest of the app opens on (5681) */
  accent: string;
  requestsIn: RequestItem[];
  requestsOut: RequestItem[];
  enquiriesIn: Enquiry[];
  enquiriesOut: Enquiry[];
  nowIso: string;
}) {
  const router = useRouter();
  const [sect, setSect] = useState<"all" | "req" | "enq">("all");
  const [rqSide, setRqSide] = useState<"in" | "out">("in");
  const [enqSide, setEnqSide] = useState<"in" | "out">("in");
  const [enqType, setEnqType] = useState<"all" | EnquiryTypeKey>("all");
  const [enqSt, setEnqSt] = useState<"all" | EnquiryStatus>("all");
  const [brkOpen, setBrkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };
  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(doneMsg);
    router.refresh();
  };

  const newIn = enquiriesIn.filter((e) => enquiryStage(e) === "new");
  const SECT: Array<["all" | "req" | "enq", string, number, string]> = [
    ["all", "All", requestsIn.length + newIn.length, PINK],
    ["req", "Requests", requestsIn.length, "#DC2626"],
    ["enq", "Enquiries", newIn.length, "#EC4899"],
  ];
  const owed = requestsIn.length + newIn.length;

  /* ── the combined desk: every outstanding item from both desks, newest first ── */
  const allItems = [
    ...requestsIn.map((r) => ({
      key: `${r.kind}-${r.id}`,
      who: r.who,
      what: `${r.what} request`,
      note: r.subjectTitle,
      at: r.at,
      tint: REQ_TINT,
      href: null as string | null,
    })),
    ...newIn.map((e) => ({
      key: `enq-${e.id}`,
      who: e.fromName,
      what: `${enquiryTypeOf(e.typeKey)?.label ?? e.typeKey} enquiry`,
      note: e.message,
      at: e.createdAt,
      tint: ENQ_TINT[e.typeKey],
      href: `/inbox/enquiries/${e.id}` as string | null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  /* one answer per kind — the RPC behind each decides who may give it */
  const answer = (r: RequestItem, accept: boolean) =>
    r.kind === "claim"
      ? respondToClaimAction({ claimId: r.claimId!, accept })
      : r.kind === "invite"
        ? accept
          ? acceptInviteAction({ code: r.inviteCode! })
          : declineInviteAction({ code: r.inviteCode! })
        : r.kind === "crew"
          ? respondToCrewAskAction({ memberId: r.memberId!, accept })
          : respondToPartnerAskAction({ bookingId: r.bookingId!, accept });
  const withdraw = (r: RequestItem) =>
    r.kind === "claim"
      ? withdrawClaimAction({ claimId: r.claimId! })
      : r.kind === "invite"
        ? revokeInviteAction({ tenantId: r.tenantId!, inviteId: r.inviteId! })
        : r.kind === "crew"
          ? withdrawCrewAskAction({ memberId: r.memberId!, crewId: r.crewId })
          : Promise.resolve({ error: "A duet entry is withdrawn from the event page" });

  const requestCard = (r: RequestItem) => {
    const c = REQ_TINT;
    const meta: Array<[string, string]> = [
      ["What", r.what],
      ...(r.when ? ([["When", r.when]] as Array<[string, string]>) : []),
      ["Asked by", r.dir === "in" ? r.who : "you"],
    ];
    return (
      <Row key={`${r.kind}-${r.id}`} c={c}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: "3px 8px", borderRadius: 999, background: `${c}22`, color: c }}>{r.subjectKind}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--muted)", textTransform: "capitalize" }}>{KIND_WORD[r.kind]}</span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(r.at, nowIso)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#8B5CF6,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900 }}>
            {initialsOf(r.who)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 900 }}>{r.who}</div>
            <div style={{ fontSize: 11, color: "var(--sub)" }}>{r.dir === "in" ? `wants to ${r.verb} ${r.subjectTitle}` : `asked to be ${r.what} on ${r.subjectTitle}`}</div>
          </div>
          {r.href ? (
            <Link href={r.href} aria-label={`View ${r.subjectTitle}`} style={{ fontSize: 10, fontWeight: 800, color: c, textDecoration: "none", flexShrink: 0 }}>
              View ›
            </Link>
          ) : null}
        </div>
        <div style={{ background: "var(--el)", borderRadius: 12, padding: "9px 11px" }}>
          {meta.map(([k2, v]) => (
            <div key={k2} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 11.5 }}>
              <span style={{ color: "var(--sub)" }}>{k2}</span>
              <b style={{ textAlign: "right" }}>{v}</b>
            </div>
          ))}
        </div>
        {r.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "7px 0 0", lineHeight: 1.45 }}>{r.note}</div> : null}

        {r.dir === "in" ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={busy}
              aria-label={`Reject ${r.subjectTitle}`}
              onClick={() =>
                void run(
                  () => answer(r, false),
                  `Rejected · ${r.who} has been told`
                )
              }
              style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Confirm ${r.subjectTitle}`}
              onClick={() =>
                void run(
                  () => answer(r, true),
                  `✅ Confirmed · you are ${r.what} on ${r.subjectTitle}`
                )
              }
              style={{ flex: 1.3, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Confirm
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: "#F59E0B", margin: "9px 0 0", fontWeight: 800 }}>
              ⏳ Waiting on {r.who}
              {r.kind === "claim" ? <span style={{ color: "var(--sub)", fontWeight: 700 }}> — this class stays a draft until they confirm</span> : null}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <button
                type="button"
                disabled={busy}
                aria-label={`Withdraw ${r.subjectTitle}`}
                onClick={() =>
                  void run(
                    () => withdraw(r),
                    `Withdrawn — ${r.who} is no longer being asked`
                  )
                }
                style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                Withdraw
              </button>
            </div>
          </>
        )}
      </Row>
    );
  };

  /* ── enquiries desk ── */
  const side = enqSide === "out" ? enquiriesOut : enquiriesIn;
  const st = (e: Enquiry) => enquiryStage(e);
  const open2 = side.filter((e) => ["new", "in_talks", "quoted"].includes(st(e)));
  const won = side.filter((e) => ["won", "confirmed", "advance_paid"].includes(st(e)));
  const lost = side.filter((e) => st(e) === "lost");
  const sum = (a: Enquiry[]) => a.reduce((x, e) => x + enquiryValueInr(e), 0);
  const byType = ENQ_TYPES.map((t) => ({ k: t.k, label: t.label, rows: side.filter((e) => e.typeKey === t.k) })).filter((x) => x.rows.length);
  const tiles: Array<[string, string, string, string]> =
    enqSide === "out"
      ? [
          [String(open2.length), "Waiting", moneyShort(sum(open2)), "#3B82F6"],
          [String(won.length), "Accepted", moneyShort(sum(won)), "#22C55E"],
          [String(side.filter((e) => liveQuoteOf(e)).length), "Quoted back", `${lost.length} declined`, "#F59E0B"],
        ]
      : [
          [String(open2.length), "Open", moneyShort(sum(open2)), "#3B82F6"],
          [String(won.length), "Won", moneyShort(sum(won)), "#22C55E"],
          [`${Math.round((100 * won.length) / Math.max(1, won.length + lost.length))}%`, "Win rate", `${lost.length} lost`, "#F59E0B"],
        ];
  const filtered = side.filter((e) => enqType === "all" || e.typeKey === enqType).filter((e) => enqSt === "all" || st(e) === enqSt);

  return (
    <div style={{ position: "relative", background: LILAC, color: "var(--text)", maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 230, pointerEvents: "none", background: `linear-gradient(180deg, ${accent}5c 0%, ${accent}20 44%, transparent 100%)` }} />
      <div style={{ padding: "10px 16px 0", position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.45, color: "var(--sub)", marginBottom: 12 }}>{owed > 0 ? `${owed} waiting on you` : "Nothing waiting on you"}</div>
      </div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", padding: "0 16px 12px", position: "relative" }}>
        {SECT.map(([k, l, n, tint]) => {
          const on = sect === k;
          return (
            <div key={k} role="button" tabIndex={0} aria-pressed={on} aria-label={`${l} — ${n} waiting`} onKeyDown={pressKey(() => setSect(k))} onClick={() => setSect(k)} style={pillBtn(on)}>
              {l}
              {n > 0 ? (
                <span style={{ fontSize: 9.5, fontWeight: 900, fontFamily: DOS_MONO, padding: "1px 6px", borderRadius: 999, background: on ? "rgba(0,0,0,.16)" : tint, color: on ? "var(--solid)" : "#fff" }}>{n}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "0 16px", position: "relative" }}>
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

        {sect === "all" ? (
          allItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "46px 20px" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Nothing waiting on you</div>
              <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 5 }}>Requests and enquiries land here as they arrive.</div>
            </div>
          ) : (
            allItems.map((it) => {
              const body = (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `${it.tint}22`, color: it.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{initialsOf(it.who)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.who}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: it.tint, textTransform: "uppercase" }}>{it.what}</div>
                    </div>
                    <span style={{ fontSize: 9.5, color: "var(--muted)", flexShrink: 0 }}>{agoWords(it.at, nowIso)}</span>
                  </div>
                  {it.note && it.note !== it.who ? <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.note}</div> : null}
                </>
              );
              const style: React.CSSProperties = { display: "block", background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${it.tint}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10, cursor: "pointer", color: "var(--text)", textDecoration: "none" };
              return it.href ? (
                <Link key={it.key} href={it.href} aria-label={`Open the ${it.what} from ${it.who}`} style={style}>
                  {body}
                </Link>
              ) : (
                <div key={it.key} role="button" tabIndex={0} aria-label={`Open the ${it.what} from ${it.who}`} onKeyDown={pressKey(() => setSect("req"))} onClick={() => setSect("req")} style={style}>
                  {body}
                </div>
              );
            })
          )
        ) : null}

        {sect === "req" ? (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(
                [
                  ["in", "Received", requestsIn.length],
                  ["out", "Sent", requestsOut.length],
                ] as Array<["in" | "out", string, number]>
              ).map(([k, l, n]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={rqSide === k} aria-label={`${l} requests`} onKeyDown={pressKey(() => setRqSide(k))} onClick={() => setRqSide(k)} style={{ flex: 1, textAlign: "center", padding: "9px 6px", borderRadius: 12, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: rqSide === k ? "var(--text)" : "var(--card)", color: rqSide === k ? "var(--solid)" : "var(--sub)", border: "1px solid var(--el)" }}>
                  {l}
                  {n > 0 ? <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 900, padding: "1px 6px", borderRadius: 999, fontFamily: DOS_MONO, background: rqSide === k ? "var(--solid)" : REQ_TINT, color: rqSide === k ? "var(--text)" : "#fff" }}>{n}</span> : null}
                </div>
              ))}
            </div>
            {(rqSide === "in" ? requestsIn : requestsOut).length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{rqSide === "in" ? "Nobody is asking you to confirm anything right now." : "You have not asked anybody to confirm anything."}</div>
              </div>
            ) : null}
            {(rqSide === "in" ? requestsIn : requestsOut).map(requestCard)}
          </>
        ) : null}

        {sect === "enq" ? (
          <>
            <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 9 }}>
              {(
                [
                  ["in", "Received", enquiriesIn.length],
                  ["out", "Sent", enquiriesOut.length],
                ] as Array<["in" | "out", string, number]>
              ).map(([k, l, n]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={enqSide === k} aria-label={`${l} enquiries`} onKeyDown={pressKey(() => setEnqSide(k))} onClick={() => setEnqSide(k)} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: enqSide === k ? "var(--solid)" : "transparent", color: enqSide === k ? "var(--text)" : "var(--sub)", boxShadow: enqSide === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
                  {l}
                  {n > 0 ? <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, fontFamily: DOS_MONO, color: "var(--muted)" }}>{n}</span> : null}
                </div>
              ))}
            </div>
            {side.length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{enqSide === "out" ? "You have not sent any enquiries yet — send one from any profile." : "No enquiries have come in yet."}</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 8 }}>
                  {tiles.map(([v, l, s2, c2]) => (
                    <div key={l} style={{ background: "var(--card)", border: "1px solid var(--el)", borderTop: `3px solid ${c2}`, borderRadius: 14, padding: "10px 9px" }}>
                      <div style={{ fontFamily: DOS_MONO, fontSize: 16, fontWeight: 600, letterSpacing: -0.4 }}>{v}</div>
                      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
                      <div style={{ fontSize: 9.5, color: c2, fontWeight: 700, marginTop: 2, fontFamily: DOS_MONO }}>{s2}</div>
                    </div>
                  ))}
                </div>
                <div role="button" tabIndex={0} aria-expanded={brkOpen} onKeyDown={pressKey(() => setBrkOpen((v) => !v))} onClick={() => setBrkOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--el)", borderRadius: 12, padding: "10px 12px", marginBottom: 10, cursor: "pointer" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, flex: 1 }}>Pipeline breakup</span>
                  <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)" }}>{moneyShort(sum(side))} total</span>
                  <span style={{ color: "var(--muted)", fontSize: 12, transform: brkOpen ? "rotate(90deg)" : "none", transition: "transform .16s", display: "inline-block" }}>›</span>
                </div>
                {brkOpen ? (
                  <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 14, padding: "12px 13px", marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 8 }}>BY TYPE</div>
                    {byType.map((x) => {
                      const mx = Math.max(...byType.map((y) => sum(y.rows)), 1);
                      const v = sum(x.rows);
                      return (
                        <div key={x.k} style={{ marginBottom: 9 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <EnqIcon k={x.k} size={13} color={ENQ_TINT[x.k]} />
                            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800 }}>{x.label}</span>
                            <span style={{ fontFamily: DOS_MONO, fontSize: 10.5, color: "var(--sub)" }}>{x.rows.length}</span>
                            <span style={{ fontFamily: DOS_MONO, fontSize: 11, fontWeight: 600, width: 52, textAlign: "right" }}>{moneyShort(v)}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: "var(--el)" }}>
                            <div style={{ height: 5, borderRadius: 3, width: `${Math.round((100 * v) / mx)}%`, background: ENQ_TINT[x.k] }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "12px 0 7px" }}>BY STAGE</div>
                    {ENQ_STAGES.map((s2) => {
                      const rows = side.filter((e) => st(e) === s2);
                      if (!rows.length) return null;
                      return (
                        <div key={s2} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 11.5, borderBottom: "1px solid var(--el)" }}>
                          <span style={{ color: "var(--sub)" }}>{ENQ_STAGE_WORD[s2]}</span>
                          <span>
                            <span style={{ fontFamily: DOS_MONO, color: "var(--muted)", marginRight: 8 }}>{rows.length}</span>
                            <b style={{ fontFamily: DOS_MONO }}>{moneyShort(sum(rows))}</b>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
            {side.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 5, marginBottom: 7, overflowX: "auto", scrollbarWidth: "none" }}>
                  {([["all", "All", null] as const, ...ENQ_TYPES.map((t) => [t.k, t.label, t.k] as const)]).map(([k, l, ic]) => {
                    const n = k === "all" ? side.length : side.filter((e) => e.typeKey === k).length;
                    if (!n) return null;
                    const on = enqType === k;
                    const c = k === "all" ? "#8B5CF6" : ENQ_TINT[k as EnquiryTypeKey];
                    return (
                      <span key={k} role="button" tabIndex={0} aria-pressed={on} onKeyDown={pressKey(() => setEnqType(k as "all" | EnquiryTypeKey))} onClick={() => setEnqType(k as "all" | EnquiryTypeKey)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 999, cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: on ? c : "var(--card)", color: on ? "#08060C" : "var(--sub)", border: `1px solid ${on ? c : "var(--el)"}` }}>
                        {ic ? <EnqIcon k={ic} size={12} color={on ? "#08060C" : c} sw={2} /> : null}
                        {l}
                        <span style={{ fontFamily: DOS_MONO, fontSize: 9.5, fontWeight: 600, opacity: 0.8 }}>{n}</span>
                      </span>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
                  {([["all", "Any stage"] as const, ...ENQ_STAGES.map((s) => [s, ENQ_STAGE_WORD[s]] as const)]).map(([k, l]) => (
                    <span key={k} role="button" tabIndex={0} aria-pressed={enqSt === k} onKeyDown={pressKey(() => setEnqSt(k as "all" | EnquiryStatus))} onClick={() => setEnqSt(k as "all" | EnquiryStatus)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, background: enqSt === k ? "var(--text)" : "var(--card)", color: enqSt === k ? "var(--solid)" : "var(--sub)", border: `1px solid ${enqSt === k ? "var(--text)" : "var(--el)"}` }}>
                      {l}
                    </span>
                  ))}
                </div>
                {filtered.length === 0 ? (
                  <div style={emptyBox}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>No enquiries match</div>
                    <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Try a different type or stage.</div>
                  </div>
                ) : null}
                {filtered.map((e) => {
                  const stage = st(e);
                  const tc = ENQ_TINT[e.typeKey];
                  const c = stage === "won" || stage === "confirmed" || stage === "advance_paid" ? "#22C55E" : stage === "lost" ? "#F87171" : stage === "quoted" ? "#F59E0B" : "#3B82F6";
                  const label = enquiryTypeOf(e.typeKey)?.label ?? e.typeKey;
                  const who = enqSide === "out" ? e.tenantName : e.fromName;
                  const value = enquiryValueInr(e);
                  return (
                    <Link key={e.id} href={`/inbox/enquiries/${e.id}`} aria-label={`${label} enquiry ${enqSide === "out" ? "to" : "from"} ${who}`} style={{ display: "block", background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${c}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10, color: "var(--text)", textDecoration: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(135deg,${tc},#7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{initialsOf(who)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 900 }}>{who}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, padding: "3px 9px", borderRadius: 999, background: `${tc}1e`, border: `1px solid ${tc}55` }}>
                            <EnqIcon k={e.typeKey} size={14} color={tc} sw={2} />
                            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, color: tc, textTransform: "uppercase" }}>{label}</span>
                          </div>
                          <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>{agoWords(e.createdAt, nowIso)} · via profile enquiry</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: c }}>{value ? moneyShort(value) : "—"}</div>
                          <div style={{ fontSize: 9, fontWeight: 800, color: c }}>{ENQ_STAGE_WORD[stage]}</div>
                        </div>
                      </div>
                      <div style={{ background: "var(--el)", borderRadius: 12, padding: "9px 11px", marginTop: 9 }}>
                        {e.fields
                          .filter(([k]) => k !== "Enquiry")
                          .map(([k2, v], fi) => (
                            <div key={`${k2}·${fi}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 11.5 }}>
                              <span style={{ color: "var(--sub)" }}>{k2}</span>
                              <b>{v}</b>
                            </div>
                          ))}
                        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>“{e.message}”</div>
                      </div>
                    </Link>
                  );
                })}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
