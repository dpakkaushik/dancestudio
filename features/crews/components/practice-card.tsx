"use client";

import type { ReactNode } from "react";
import { PRACTICE_TINT, PRACTICE_WORD, practiceClock, practiceWhen, type CrewPractice } from "@/types/crewPractice";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { bizBtn, bizCard } from "./crew-kit";

const TINT = DOS_TOOLS.practice.c;

/** ONE PRACTICE, DRAWN ONCE (27 Sep 2026, the user: *"no way to check practices
 *  you have been a part of fix that"*).
 *
 *  ⚠ THIS EXISTS BECAUSE THERE ARE TWO SCREENS NOW AND THERE MUST NOT BE TWO
 *  CARDS. The leader's desk (`PracticeDesk`) had the only one, and the Crews hub
 *  needed the same thing for somebody who is merely ON the crew — so the card
 *  moved here rather than being written a second time. This repo has paid that
 *  bill three times already (`linkChip` declared twice, the figure row written
 *  out three times, three copies of the identity band), and a card that says a
 *  practice is CALLED OFF in one place and nothing in the other is exactly the
 *  shape of drift those cost.
 *
 *  What differs between the two callers is what they can DO, so that is a slot:
 *  the desk hangs its register and Call-it-off on `foot`, the hub hangs a link
 *  to the desk. What is the same — when, where, what to bring, where you stand
 *  and how many are coming — is here, and the ANSWER BUTTONS are here too,
 *  because answering is the one act that belongs to the person reading it
 *  wherever they are reading it. */
export function PracticeCard({
  practice: p,
  now,
  onAnswer,
  foot = null,
}: {
  practice: CrewPractice;
  /** the clock, handed in: a component may not call `Date.now()` during render
   *  (this repo's `react-hooks/purity` rule), and both callers already stamp it
   *  on the server so the two cannot disagree about what is over */
  now: number;
  onAnswer: (practiceId: string, accept: boolean) => void;
  foot?: ReactNode;
}) {
  const cancelled = p.status === "cancelled";
  const past = new Date(p.endsAt).getTime() < now;
  return (
    <div style={{ ...bizCard, borderLeft: `4px solid ${cancelled ? "var(--el)" : TINT}`, opacity: cancelled ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 14.5 }}>{practiceWhen(p.startsAt)}</b>
        <span style={{ fontSize: 11, color: "var(--sub)" }}>to {practiceClock(p.endsAt)}</span>
        {cancelled ? (
          <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "var(--el)", color: "var(--sub)" }}>CALLED OFF</span>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3 }}>{p.place}</div>
      {p.note ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{p.note}</div> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: `${PRACTICE_TINT[p.myStatus]}22`, color: PRACTICE_TINT[p.myStatus] }}>{PRACTICE_WORD[p.myStatus].toUpperCase()}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {p.going} of {p.asked} coming
        </span>
      </div>

      {/* ⚠ THE PERSON ASKED ANSWERS HERE, wherever "here" is — the leader's desk,
          the Crews hub, or their Inbox. A confirmed member reads all three, and a
          practice shown with no way to answer it is a door that is not a door.
          One fact, three places you can act on it, exactly as a class ask is
          answerable from the Inbox and from the class page. */}
      {!cancelled && !past && p.myStatus !== "leader" ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={() => onAnswer(p.id, false)} aria-label={`Cannot make ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1, borderStyle: "solid", opacity: p.myStatus === "rejected" ? 0.5 : 1 }}>
            Cannot make it
          </button>
          <button type="button" onClick={() => onAnswer(p.id, true)} aria-label={`Coming to ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1, borderStyle: "solid", background: TINT, color: "#fff", borderColor: TINT, opacity: p.myStatus === "confirmed" ? 0.5 : 1 }}>
            I am coming
          </button>
        </div>
      ) : null}

      {foot}
    </div>
  );
}

/** COMING UP, then OVER — the one split both screens make, so a practice that is
 *  over on the desk is over on the hub. A called-off practice is OVER whatever
 *  the clock says: it is not something anybody is going to. */
export function splitPractices(practices: CrewPractice[], now: number): { coming: CrewPractice[]; over: CrewPractice[] } {
  return {
    coming: practices.filter((p) => new Date(p.endsAt).getTime() >= now && p.status !== "cancelled"),
    over: practices.filter((p) => new Date(p.endsAt).getTime() < now || p.status === "cancelled"),
  };
}

export const PRACTICE_HEAD: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "14px 0 8px" };
