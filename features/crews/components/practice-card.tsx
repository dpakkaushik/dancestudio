"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { DISC_RADIUS } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { PRACTICE_TINT, PRACTICE_WORD, practiceClock, practiceWhen, type CrewPractice } from "@/types/crewPractice";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
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
  const face = photoUrl(p.crewPhotoPath);
  const d = dateParts(p.startsAt);
  const share = p.asked > 0 ? Math.min(1, p.going / p.asked) : 0;
  const chip = (text: string, fg: string, bg: string) => (
    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: bg, color: fg }}>{text}</span>
  );
  /* ⚠ THE CARD IS ARRANGED IN THE ORDER IT IS READ (2 Oct 2026, the user:
     "better practice cards, with crew profile photo and arrangement"): WHO it is
     for — the crew's own face and name — then WHEN, as a date block you can read
     across a list without parsing a sentence, then WHERE, then where you stand
     and how full it is. It used to open on a sentence of date and bury the crew,
     which on the hub — where practices of several crews sit together — left you
     reading the small print to learn which crew a card was about. */
  return (
    <div data-testid="practice-card" style={{ ...bizCard, padding: 0, overflow: "hidden", opacity: cancelled ? 0.72 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderBottom: "1.5px solid var(--el)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 40 * DISC_RADIUS, overflow: "hidden", flexShrink: 0, background: `linear-gradient(135deg, ${TINT}, ${TINT}99)`, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 14 }}>
          {face ? <Image src={face} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: "cover" }} /> : initialsOf(p.crewName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.crewName}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{p.crewStyle ? `${p.crewStyle} · ` : ""}Crew practice</div>
        </div>
        {cancelled
          ? chip("CALLED OFF", "var(--sub)", "var(--el)")
          : chip(PRACTICE_WORD[p.myStatus].toUpperCase(), PRACTICE_TINT[p.myStatus], `${PRACTICE_TINT[p.myStatus]}22`)}
      </div>

      <div style={{ display: "flex", gap: 12, padding: "11px 12px" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted)", fontWeight: 800 }}>
              <span>
                {p.going} of {p.asked} coming
              </span>
              {past && !cancelled ? <span>Over</span> : null}
            </div>
            <div style={{ height: 5, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: `${Math.round(share * 100)}%`, height: "100%", borderRadius: 999, background: cancelled ? "var(--muted)" : TINT }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 12px 12px" }}>

      {/* ⚠ THE PERSON ASKED ANSWERS HERE, wherever "here" is — the leader's desk,
          the Crews hub, or their Inbox. A confirmed member reads all three, and a
          practice shown with no way to answer it is a door that is not a door.
          One fact, three places you can act on it, exactly as a class ask is
          answerable from the Inbox and from the class page. */}
      {!cancelled && !past && p.myStatus !== "leader" ? (
        <div style={{ display: "flex", gap: 8 }}>
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
    </div>
  );
}

/** the date block's three lines, in IST like every other time on a practice */
const dateParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { weekday: get("weekday").toUpperCase(), day: get("day"), month: get("month").toUpperCase() };
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "C";

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
