"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { respondToPracticeAction } from "@/features/crews/server-actions/practices";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import type { CrewPractice } from "@/types/crewPractice";
import { Toast, bizCard } from "./crew-kit";
import { PRACTICE_HEAD, PracticeCard, splitPractices } from "./practice-card";

const TINT = DOS_TOOLS.practice.c;

/** THE PRACTICES YOU ARE PART OF (27 Sep 2026, the user: *"no way to check
 *  practices you have been a part of fix that"*).
 *
 *  ⚠ THIS CLOSES A GAP I WROTE DOWN AND SHIPPED. `#0at` said it in so many
 *  words — *"a member who does not LEAD the crew cannot open the desk, so their
 *  calendar row opens the crew's public page instead of a screen that would
 *  bounce them"* — and a backlog row naming a defect is not a decision to accept
 *  it, which this file has now learned twice (C46 was the same shape).
 *
 *  ⚠ IT LIVES ON THE CREWS HUB rather than behind a tile of its own, and that is
 *  a decision with two reasons. **A practice belongs to a crew** — there is no
 *  such thing as one without — and `/crews` is the screen about your crews,
 *  opened by the Crews tile every person's grid already carries. And **a Practice
 *  tile on a person's grid would have failed R20's own colour test**: the tool is
 *  `#15803D`, which is hue 142° at 71% saturation, and Earnings is `#22C55E` —
 *  hue 142°, saturation 71%, sixteen points lighter. That pair is fine on a
 *  CREW's grid, which has no Earnings tile (R20's test is per-grid), and would be
 *  two greens on a person's. Giving the tool a second colour for one grid would
 *  break the rule that a tile and the desk it opens read one vocabulary.
 *
 *  ⚠ THE LEADER GETS A LINK, NOT A REGISTER. Their desk is one tap away and has
 *  the roster, the check-in and Call it off; drawing a second register here would
 *  be the two-doors-to-one-subject shape this file has paid for twice. What the
 *  hub gives everybody is the same thing: what is coming, what is over, where you
 *  stand, and — for anybody who was ASKED — the answer. */
/** ⚠ `bare` IS FOR THE COLUMN (28 Sep 2026). This was a section stacked under
 *  the two crew lists, so it wore its own top margin and its own YOUR PRACTICES
 *  head to separate it from them. As a SEGMENT it is the only thing on screen
 *  and the pill above already names it, so both would be the heading said twice
 *  — the `TODAY` badge lesson from this morning in a second place. */
export function MyPractices({ practices, todayIso, bare = false }: { practices: CrewPractice[]; todayIso: string; bare?: boolean }) {
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();
  const now = new Date(todayIso).getTime();
  const { coming, over } = splitPractices(practices, now);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const answer = (practiceId: string, accept: boolean) => {
    start(async () => {
      /* ⚠ `crewId` is what the action revalidates by and its schema is
         `uuid().optional()` — so an empty string would fail the PARSE and come
         back as "that practice could not be found", which is a lie about a
         practice that exists. Undefined when we genuinely do not know. */
      const p = practices.find((x) => x.id === practiceId);
      const r = await respondToPracticeAction({ practiceId, accept, crewId: p?.crewId });
      say(r.error ?? (accept ? "You are coming" : "They know you cannot make it"));
    });
  };

  /* ⚠ THE CREW'S NAME IS ON EVERY CARD HERE and on none of them on the desk —
     the desk is one crew's and says so in its own sub-line, while this list can
     hold three crews' practices in one evening. Same card, one slot different. */
  const card = (p: CrewPractice) => (
    <PracticeCard
      key={p.id}
      practice={p}
      now={now}
      onAnswer={answer}
      foot={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: TINT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.crewName}</span>
          {p.iLead ? (
            <Link href={`/crews/${p.crewId}/manage/practice`} aria-label={`Open the register for ${p.crewName}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 900, color: TINT, textDecoration: "none" }}>
              Register ›
            </Link>
          ) : (
            <Link href={`/crew/${p.crewId}`} aria-label={`Open ${p.crewName}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: "var(--sub)", textDecoration: "none" }}>
              The crew ›
            </Link>
          )}
        </div>
      }
    />
  );

  return (
    <div style={{ marginTop: bare ? 0 : 20 }} data-testid="my-practices">
      {bare ? null : <div style={{ ...PRACTICE_HEAD, margin: "2px 0 8px" }}>YOUR PRACTICES</div>}
      {coming.length === 0 && over.length === 0 ? (
        <div style={{ ...bizCard, textAlign: "center", fontSize: 12, color: "var(--sub)", border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
          Nothing arranged yet — when a crew you are on arranges one you are asked here.
        </div>
      ) : null}
      {coming.length ? (
        <>
          <div style={PRACTICE_HEAD}>COMING UP</div>
          {coming.map(card)}
        </>
      ) : null}
      {over.length ? (
        <>
          <div style={PRACTICE_HEAD}>OVER</div>
          {over.map(card)}
        </>
      ) : null}
      <Toast msg={toast} />
    </div>
  );
}
