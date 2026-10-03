"use client";

import type { ReactNode } from "react";
import { SUB } from "@/lib/design/tokens";
import { PRACTICE_TINT, PRACTICE_WORD, practiceClock, practiceWhen, type CrewPractice } from "@/types/crewPractice";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { ToolActions, ToolCard, ToolChip, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";

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
  actions = null,
  foot = null,
}: {
  practice: CrewPractice;
  /** the clock, handed in: a component may not call `Date.now()` during render
   *  (this repo's `react-hooks/purity` rule), and both callers already stamp it
   *  on the server so the two cannot disagree about what is over */
  now: number;
  onAnswer: (practiceId: string, accept: boolean) => void;
  /** the caller's own buttons, on the card's action bar beside the answer pair */
  actions?: ReactNode;
  /** anything that opens UNDER the bar — the leader's register */
  foot?: ReactNode;
}) {
  const cancelled = p.status === "cancelled";
  const past = new Date(p.endsAt).getTime() < now;
  const d = dateParts(p.startsAt);
  const share = p.asked > 0 ? Math.min(1, p.going / p.asked) : 0;
  const canAnswer = !cancelled && !past && p.myStatus !== "leader";
  /* ⚠ THE CARD IS ARRANGED IN THE ORDER IT IS READ (2 Oct 2026, the user:
     "better practice cards, with crew profile photo and arrangement"): WHO it is
     for — the crew's own face and name — then WHEN, as a date block you can read
     across a list without parsing a sentence, then WHERE, then where you stand
     and how full it is.
     ⚠⚠ AND SINCE 3 Oct 2026 IT IS THE SHARED TOOL CARD (the user: *"better and
     bigger cards … each has a profile linked to it … visible with profile pic and
     name and big … buttons segregated"*): the crew leads at a profile's size and
     is a door to its page, and every button — the answer pair and whatever the
     caller adds — sits on one bar under a hairline. */
  return (
    <ToolCard testId="practice-card" dim={cancelled}>
      <ToolHead
        tint={TINT}
        name={p.crewName}
        photoPath={p.crewPhotoPath}
        href={`/crew/${p.crewId}`}
        hrefLabel={`${p.crewName} — the crew's page`}
        eyebrow={`Crew practice${p.crewStyle ? ` · ${p.crewStyle}` : ""}`}
        sub={p.iLead ? "You lead this crew" : "You dance in this crew"}
        right={
          cancelled ? (
            <ToolChip word="CALLED OFF" fg={SUB} bg="var(--el)" />
          ) : (
            <ToolChip word={PRACTICE_WORD[p.myStatus].toUpperCase()} fg={PRACTICE_TINT[p.myStatus]} bg={`${PRACTICE_TINT[p.myStatus]}22`} />
          )
        }
      />

      <div style={{ display: "flex", gap: 12, padding: "12px 14px", borderTop: "1.5px solid var(--el)" }}>
        <div aria-hidden style={{ width: 52, flexShrink: 0, borderRadius: 13, background: cancelled ? "var(--el)" : `${TINT}1f`, color: cancelled ? "var(--sub)" : TINT, textAlign: "center", padding: "6px 0", alignSelf: "flex-start" }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8 }}>{d.weekday}</div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.05 }}>{d.day}</div>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8 }}>{d.month}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, textDecoration: cancelled ? "line-through" : "none" }}>
            {practiceClock(p.startsAt)} – {practiceClock(p.endsAt)}
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3, overflowWrap: "anywhere" }}>📍 {p.place}</div>
          {p.note ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>{p.note}</div> : null}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 800 }}>
              <span>
                {p.going} of {p.asked} coming
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: `${Math.round(share * 100)}%`, height: "100%", borderRadius: 999, background: cancelled ? "var(--muted)" : TINT }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 14px 12px" }}>
        <ToolFacts
          tint={TINT}
          /* what the line above does not already say — how full, how long, and
             whether it is still to come (the "N of M coming" line stays: it is the
             sentence the leader's desk has counted the yes by since 27 Sep) */
          items={[
            { label: "Turnout", value: `${Math.round(share * 100)}%`, tint: p.going > 0 && !cancelled ? TINT : undefined },
            { label: "Length", value: lengthWords(p.startsAt, p.endsAt) },
            { label: "When", value: cancelled ? "Off" : past ? "Over" : "Ahead" },
          ]}
        />
      </div>

      {/* ⚠ THE PERSON ASKED ANSWERS HERE, wherever "here" is — the leader's desk,
          the Practice tile, or their Inbox. A practice shown with no way to answer
          it is a door that is not a door. The pair and the caller's own buttons
          share ONE bar, under the card's fields. */}
      {canAnswer || actions ? (
        <ToolActions>
          {canAnswer ? (
            <>
              <button type="button" onClick={() => onAnswer(p.id, false)} aria-label={`Cannot make ${practiceWhen(p.startsAt)}`} style={toolBtn("secondary", TINT, { opacity: p.myStatus === "rejected" ? 0.55 : 1 })}>
                Cannot make it
              </button>
              <button type="button" onClick={() => onAnswer(p.id, true)} aria-label={`Coming to ${practiceWhen(p.startsAt)}`} style={toolBtn("primary", TINT, { opacity: p.myStatus === "confirmed" ? 0.55 : 1 })}>
                I am coming
              </button>
            </>
          ) : null}
          {actions}
        </ToolActions>
      ) : null}
      {foot}
    </ToolCard>
  );
}

/** the date block's three lines, in IST like every other time on a practice */
const dateParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { weekday: get("weekday").toUpperCase(), day: get("day"), month: get("month").toUpperCase() };
};

/** how long a practice runs — "2h", "1h 30m", "45m" */
const lengthWords = (startIso: string, endIso: string): string => {
  const mins = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

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
