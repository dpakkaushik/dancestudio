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
 *  ⚠⚠ IT LIVED ON THE CREWS HUB AND IS ITS OWN TILE NOW — `/practice`, 30 Sep
 *  2026, the user: *"practice should be seprate tab in home tab not in crew"*.
 *  This note argued the other way on two grounds and BOTH are answered rather
 *  than overruled. *"A practice belongs to a crew"* is true and is not what the
 *  person is asking: they want to know what they are rehearsing this week, which
 *  is a Home question, and it was two presses inside a screen about something
 *  else. And *"a Practice tile would fail R20's own colour test"* was TRUE of the
 *  green the tool wore — `#15803D` is hue 142° at 71% saturation and Earnings is
 *  `#22C55E`, hue 142°, sixteen points lighter, which is the one pair R20 exists
 *  to refuse — so **the tool was repainted deep indigo `#4338CA` in the same
 *  push** rather than the tile being squeezed onto a grid it clashes with,
 *  measured at 102° from Earnings and ≥28° from everything on every grid it
 *  lands on. A tile and the desk it opens still read one vocabulary.
 *  ⚠ This component is unchanged and is drawn `bare` by `/practice` exactly as
 *  it was by the hub's segment.
 *
 *  ⚠ THE LEADER GETS A LINK, NOT A REGISTER. Their desk is one tap away and has
 *  the roster, the check-in and Call it off; drawing a second register here would
 *  be the two-doors-to-one-subject shape this file has paid for twice. What the
 *  hub gives everybody is the same thing: what is coming, what is over, where you
 *  stand, and — for anybody who was ASKED — the answer. */
/** ⚠ `bare` IS FOR WHATEVER ALREADY NAMED IT (28 Sep 2026, and still true one
 *  screen later). This was a section stacked under the two crew lists, so it
 *  wore its own top margin and its own YOUR PRACTICES head to separate it from
 *  them. Then it was a SEGMENT, whose pill named it; it is a PAGE now, whose
 *  `DeskHero` names it. In all three the head would be the heading said twice —
 *  the `TODAY` badge lesson in a third place. */
export function MyPractices({
  practices,
  todayIso,
  bare = false,
  empty = "Nothing arranged yet — when a crew you are on arranges one you are asked here.",
}: {
  practices: CrewPractice[];
  todayIso: string;
  bare?: boolean;
  /** what an empty list says — each of `/practice`'s two columns has its own */
  empty?: string;
}) {
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
          {empty}
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
