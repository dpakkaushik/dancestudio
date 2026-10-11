"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DOS_UI, LILAC, TAB_SUB, TAB_TITLE } from "@/lib/design/tokens";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { TopPanel } from "@/components/ui/TopPanel";
import {
  ENQ_CLOSED,
  ENQ_ENDED,
  ENQ_STAGES,
  ENQ_STAGE_WORD,
  ENQ_TYPES,
  enquiryStage,
  enquiryValueInr,
  type Enquiry,
  type EnquiryTypeKey,
} from "@/types/enquiry";
import { DOS_MONO, moneyShort, pressKey } from "./inbox-kit";
import { EnquiryCard } from "@/features/enquiries/components/enquiry-kit";
import { InboxFilters, NO_FILTER, applyInboxFilter, type InboxFilter, type InboxSort } from "./InboxFilters";
import { Breakup } from "./Breakup";

/** The Inbox, lifted from prototype S_chats (5617-6098) after internal chat was
 *  removed from the product: "what remains is the work … The badge counts only
 *  what waits on YOU."
 *
 *  ⚠⚠ ENQUIRIES ONLY SINCE 11 Oct 2026 (the user: "only enquiries to be handled
 *  from inbox and rest all from their respective home tile section how we did
 *  for classes"). The Requests and Invites columns are gone: a class ask is
 *  answered in Classes' To do, a team invitation on the Studios hub's Team
 *  column, a crew ask on the Crews hub's Member column. What stays here is one
 *  POINTER LINE for each of those, drawn only while something waits there —
 *  the class pointer's own treatment of the same morning — so the count still
 *  reaches somebody who never opens those tiles.
 *
 *  ⚠ `RequestItem` moved to `features/inbox/requestItems.ts` with the class asks
 *  it describes, and the `embed` mode (the Classes screen's old Requests column)
 *  went: nothing drew it any more. */

/** one line saying how many of something wait elsewhere, and where (11 Oct 2026) */
export interface InboxPointer {
  testId: string;
  n: number;
  href: string;
  /** singular / plural noun — "class request" / "class requests" */
  one: string;
  many: string;
  /** where it is answered, in words */
  where: string;
  /** the tile's accent, for the count badge */
  tint: string;
}

type Side3 = "in" | "out" | "done";
const emptyBox: React.CSSProperties = { background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center" };

export function InboxScreen({
  accent,
  enquiriesIn,
  enquiriesOut,
  nowIso,
  initialSection,
  deskSub = null,
  receivedOnly = false,
  settings = null,
  pointers = [],
}: {
  /** the profile-tinted wash the rest of the app opens on (5681) */
  accent: string;
  enquiriesIn: Enquiry[];
  enquiriesOut: Enquiry[];
  nowIso: string;
  /** `?show=done` opens on the Completed side; anything else on Received */
  initialSection?: "enq" | "done";
  /** WHOSE DESK THIS IS, when it is a studio's (27 Sep 2026) */
  deskSub?: string | null;
  /** a studio's desk — what it was asked, and no Sent side */
  receivedOnly?: boolean;
  /** what you take — the enquiry settings (27 Sep 2026) */
  settings?: ReactNode;
  /** the lines pointing at what moved to its own tile (11 Oct 2026) — each is
   *  drawn only while n > 0 */
  pointers?: InboxPointer[];
}) {
  const [enqSide, setEnqSide] = useState<Side3>(initialSection === "done" ? "done" : "in");
  /* ⚠ ONE FILTER, DISCOVER'S ANATOMY (3 Oct 2026); a side switch clears it,
     because a STAGE picked on one side names nothing on another */
  const [fEnq, setFEnq] = useState<InboxFilter>(NO_FILTER);
  const pickEnqSide = (s: Side3) => {
    setEnqSide(s);
    setFEnq(NO_FILTER);
  };

  const newIn = enquiriesIn.filter((e) => enquiryStage(e) === "new");
  const live = pointers.filter((p) => p.n > 0);
  /* WHAT WAITS ON YOU: the new enquiries, and what the pointers count */
  const owed = newIn.length + live.reduce((s, p) => s + p.n, 0);

  /* ⚠ A CLOSED ENQUIRY — COMPLETED, LOST OR CANCELLED — IS UNDER COMPLETED (2 Oct
     2026), deduped by id because an enquiry sent to your own page is on both sides */
  const closedEnq = (e: Enquiry) => ENQ_CLOSED.has(enquiryStage(e));
  const doneEnq = (() => {
    const seen = new Set<string>();
    return [...enquiriesIn, ...enquiriesOut]
      .filter(closedEnq)
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  })();

  /* Received · Sent · Completed — the app's one column look (`ColumnTabs`) */
  const sideSwitch = (cur: Side3, set: (s: Side3) => void, nIn: number, nOut: number | null, nDone: number, noun: string) => (
    <div data-testid="inbox-sides" role="group" aria-label={`${noun} sides`} style={{ ...columnTrack(), marginTop: 12 }}>
      {(
        [
          ["in", "Received", nIn, true],
          ...(nOut === null ? [] : [["out", "Sent", nOut, false]]),
          ["done", "Completed", nDone, false],
        ] as Array<[Side3, string, number, boolean]>
      ).map(([k, l, n, owedSide]) => (
        <div key={k} role="button" tabIndex={0} aria-pressed={cur === k} aria-label={`${l} ${noun}`} onKeyDown={pressKey(() => set(k))} onClick={() => set(k)} style={columnTab(cur === k)}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l}</span>
          {n > 0 ? <ColumnCount n={n} on={cur === k} attention={owedSide} /> : null}
        </div>
      ))}
    </div>
  );

  /* ⚠ THE CARD IS THE ENQUIRY KIT'S (2 Oct 2026); which end the reader is on is
     decided PER CARD, because Completed mixes both ends */
  const outIds = new Set(enquiriesOut.map((x) => x.id));
  const enquiryCard = (e: Enquiry) => <EnquiryCard key={e.id} e={e} out={outIds.has(e.id)} nowIso={nowIso} />;

  const side = enqSide === "out" ? enquiriesOut : enquiriesIn;
  const st = (e: Enquiry) => enquiryStage(e);
  /* the three phases of the 3 Oct 2026 process */
  const open2 = side.filter((e) => ["new", "accepted", "quoted"].includes(st(e)));
  const onNow = side.filter((e) => ["ongoing", "advance_paid", "paid", "completing"].includes(st(e)));
  const done2 = side.filter((e) => st(e) === "completed");
  const ended = side.filter((e) => ENQ_ENDED.has(st(e)));
  const sum = (a: Enquiry[]) => a.reduce((x, e) => x + enquiryValueInr(e), 0);
  const tiles: Array<[string, string, string, string]> =
    enqSide === "out"
      ? [
          [String(open2.length), "Waiting", moneyShort(sum(open2)), "#3B82F6"],
          [String(onNow.length), "On", moneyShort(sum(onNow)), "#22C55E"],
          [String(done2.length), "Completed", `${ended.length} ended`, "#F59E0B"],
        ]
      : [
          [String(open2.length), "Open", moneyShort(sum(open2)), "#3B82F6"],
          [String(onNow.length + done2.length), "Won", moneyShort(sum([...onNow, ...done2])), "#22C55E"],
          [`${Math.round((100 * (onNow.length + done2.length)) / Math.max(1, onNow.length + done2.length + ended.length))}%`, "Win rate", `${ended.length} ended`, "#F59E0B"],
        ];
  /* ⚠ the LIST is what is still open; the tiles count the whole side */
  const isClosed = (e: Enquiry) => ENQ_CLOSED.has(st(e));
  const liveSide = side.filter((e) => !isClosed(e));
  const liveIn = enquiriesIn.filter((e) => !isClosed(e)).length;
  const liveOut = enquiriesOut.filter((e) => !isClosed(e)).length;
  const typeLabel = (k: EnquiryTypeKey) => ENQ_TYPES.find((t) => t.k === k)?.label ?? k;
  const enqRead = {
    text: (e: Enquiry) => `${e.fromName} ${e.businessName} ${typeLabel(e.typeKey)} ${e.message} ${e.whereText ?? ""} ${e.fields.map(([, v]) => v).join(" ")}`,
    kind: (e: Enquiry) => e.typeKey,
    stage: (e: Enquiry) => st(e),
    at: (e: Enquiry) => e.createdAt,
    value: (e: Enquiry) => enquiryValueInr(e),
  };
  const enqBase = enqSide === "done" ? doneEnq : liveSide;
  const filtered = applyInboxFilter(enqBase, fEnq, enqRead);
  const enqKinds = ENQ_TYPES.map((t) => [t.k, t.label, enqBase.filter((e) => e.typeKey === t.k).length] as const).filter(([, , n]) => n > 0);
  const enqStages = ENQ_STAGES.filter((s) => (enqSide === "done" ? ENQ_CLOSED.has(s) : !ENQ_CLOSED.has(s)) && enqBase.some((e) => st(e) === s)).map((s) => [s, ENQ_STAGE_WORD[s]] as const);
  const ENQ_SORTS: ReadonlyArray<readonly [InboxSort, string]> = [["new", "Newest"], ["old", "Oldest"], ["value", "Highest value"]];
  const brkRows = enqSide === "done" ? doneEnq : side;
  const brkByType = ENQ_TYPES.map((t) => ({ k: t.k, label: t.label, rows: brkRows.filter((e) => e.typeKey === t.k) })).filter((x) => x.rows.length);
  const noMatch = (
    <div style={emptyBox}>
      <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing matches</div>
      <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Try a different search or clear the filters.</div>
    </div>
  );

  return (
    <div style={{ position: "relative", background: LILAC, color: "var(--text)", maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* the TOP squircle: the heading, the settings and the three sides (3 Oct 2026) */}
      <TopPanel tint={accent} style={{ margin: "12px 16px 12px" }}>
        <div style={{ position: "relative" }}>
          <h1 data-testid="inbox-title" style={TAB_TITLE}>
            Inbox
          </h1>
          <div data-testid="inbox-sub" style={{ ...TAB_SUB, margin: "5px 0 12px" }}>
            {deskSub ? `${deskSub} · ` : ""}
            {owed > 0 ? `${owed} waiting on you` : "Nothing waiting on you"}
          </div>
          {/* the enquiry settings' gear, top right (12 Oct 2026) */}
          {settings}
        </div>
        {/* ⚠ WHAT MOVED TO ITS OWN TILE (11 Oct 2026) — one line each, only while
            something waits there; the class line's own treatment */}
        {live.map((p) => (
          <Link
            key={p.testId}
            href={p.href}
            data-testid={p.testId}
            aria-label={`${p.n} ${p.n === 1 ? p.one : p.many} — ${p.where}`}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 8, borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)", color: "var(--text)", textDecoration: "none" }}
          >
            <span style={{ fontSize: 13, fontWeight: 900, flex: 1 }}>
              {`${p.n} ${p.n === 1 ? p.one : p.many} waiting`}
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--sub)", marginTop: 2 }}>{p.where}</span>
            </span>
            <span style={{ fontSize: 10, fontWeight: 900, fontFamily: DOS_MONO, padding: "2px 8px", borderRadius: 999, background: p.tint, color: "#fff" }}>{p.n}</span>
            <span aria-hidden="true" style={{ fontWeight: 900 }}>
              ›
            </span>
          </Link>
        ))}
        {/* ⚠ NO SENT SIDE ON A STUDIO'S DESK (2 Oct 2026) — an enquiry is sent by a person */}
        {sideSwitch(enqSide, pickEnqSide, liveIn, receivedOnly ? null : liveOut, doneEnq.length, "enquiries")}
      </TopPanel>

      {/* ── THE MIDDLE: the three figures and the Breakup (3 Oct 2026) ── */}
      {(enqSide !== "done" && side.length > 0) || brkRows.length > 0 ? (
        <TopPanel testId="inbox-overview" style={{ margin: "0 16px 12px" }}>
          {enqSide !== "done" && side.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
              {tiles.map(([v, l, s2, c2]) => (
                <div key={l} style={{ background: "var(--solid)", border: "1.5px solid var(--el)", borderTop: `3px solid ${c2}`, borderRadius: 14, padding: "10px 9px" }}>
                  <div style={{ fontFamily: DOS_MONO, fontSize: 16, fontWeight: 600, letterSpacing: -0.4 }}>{v}</div>
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
                  <div style={{ fontSize: 9.5, color: c2, fontWeight: 700, marginTop: 2, fontFamily: DOS_MONO }}>{s2}</div>
                </div>
              ))}
            </div>
          ) : null}
          {brkRows.length > 0 ? <Breakup rows={brkRows} byType={brkByType} sum={sum} stageOf={st} first={!(enqSide !== "done" && side.length > 0)} /> : null}
        </TopPanel>
      ) : null}

      {/* ── THE LOWER PANEL: the search and the cards, on the page's own theme ── */}
      <InvertedPanel ground="page" style={{ flex: 1, margin: "0 16px calc(var(--dos-foot, 96px) + 12px)", borderRadius: 22, padding: "18px 14px 18px" }}>
        <div data-testid="inbox-panel" style={{ position: "relative" }}>
          {enqBase.length ? <InboxFilters value={fEnq} onChange={setFEnq} noun="enquiries" kinds={enqKinds} stages={enqStages} sorts={ENQ_SORTS} /> : null}
          {enqSide === "done" && doneEnq.length === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing completed yet</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Enquiries land here once they are completed, lost or cancelled.</div>
            </div>
          ) : enqSide !== "done" && side.length === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{enqSide === "out" ? "You have not sent any enquiries yet — send one from any profile." : "No enquiries have come in yet."}</div>
            </div>
          ) : enqSide !== "done" && liveSide.length === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing open</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Completed, lost and cancelled enquiries are under Completed.</div>
            </div>
          ) : filtered.length === 0 ? (
            noMatch
          ) : (
            filtered.map(enquiryCard)
          )}
        </div>
      </InvertedPanel>
    </div>
  );
}
