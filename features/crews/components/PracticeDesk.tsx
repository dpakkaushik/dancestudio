"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, DeskHero } from "@/features/tenants/components/biz-kit";
import { cancelCrewPracticeAction, respondToPracticeAction, setPracticeAttendanceAction } from "@/features/crews/server-actions/practices";
import { findPracticePeopleAction } from "@/features/crews/server-actions/practicePeople";
import { photoUrl } from "@/lib/media/photo";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { PRACTICE_TINT, PRACTICE_WORD, practiceClock, practiceWhen, type CrewPractice, type PracticePerson } from "@/types/crewPractice";
import { CrewFace, Toast, bizBtn, bizCard, pressKey } from "./crew-kit";

const TINT = DOS_TOOLS.practice.c;

/** THE PRACTICE DESK (27 Sep 2026, the user: *"crew should also get an option on
 *  home tab called Practice — which allows crew leader to create practice which
 *  sends invite to members and leader can mange attendace like how its done class
 *  for the same"*).
 *
 *  Behind the Practice tile on a crew's own home: what is coming, what is over,
 *  and — for the leader — the register on each one. `requireLedCrew` has already
 *  said this is the leader, so the controls are drawn without asking again; the
 *  DATABASE asks again anyway on every write, which is where the rule lives.
 *
 *  ⚠ THE REGISTER IS READ ON THE PRESS, not with the page. A crew with twenty
 *  practices would otherwise cost twenty roster reads on every visit for a panel
 *  most people never open — the same reasoning `loadFollowersAction` is built on,
 *  and it makes the desk cheaper than drawing them all would be. */
export function PracticeDesk({ crewId, crewName, practices, todayIso }: { crewId: string; crewName: string; practices: CrewPractice[]; todayIso: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, PracticePerson[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  const now = new Date(todayIso).getTime();
  const coming = practices.filter((p) => new Date(p.endsAt).getTime() >= now && p.status !== "cancelled");
  const over = practices.filter((p) => new Date(p.endsAt).getTime() < now || p.status === "cancelled");

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const openRegister = (id: string) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (people[id]) return;
    setBusy(id);
    void findPracticePeopleAction({ practiceId: id }).then((rows) => {
      setPeople((p) => ({ ...p, [id]: rows }));
      setBusy(null);
    });
  };

  const mark = (practiceId: string, userId: string, present: boolean) => {
    start(async () => {
      const r = await setPracticeAttendanceAction({ practiceId, userId, present, crewId });
      if (r.error) {
        say(r.error);
        return;
      }
      setPeople((p) => ({ ...p, [practiceId]: (p[practiceId] ?? []).map((x) => (x.userId === userId ? { ...x, present } : x)) }));
      say(present ? "Marked in" : "Taken off the register");
    });
  };

  const answer = (practiceId: string, accept: boolean) => {
    start(async () => {
      const r = await respondToPracticeAction({ practiceId, accept, crewId });
      say(r.error ?? (accept ? "You are coming" : "They know you cannot make it"));
    });
  };

  const callOff = (practiceId: string) => {
    start(async () => {
      const r = await cancelCrewPracticeAction({ practiceId, crewId });
      say(r.error ?? "Called off — everyone is told");
    });
  };

  const card = (p: CrewPractice) => {
    const isOpen = open === p.id;
    const rows = people[p.id] ?? [];
    const cancelled = p.status === "cancelled";
    const past = new Date(p.endsAt).getTime() < now;
    return (
      <div key={p.id} style={{ ...bizCard, borderLeft: `4px solid ${cancelled ? "var(--el)" : TINT}`, opacity: cancelled ? 0.7 : 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 14.5 }}>{practiceWhen(p.startsAt)}</b>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>to {practiceClock(p.endsAt)}</span>
          {cancelled ? <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "var(--el)", color: "var(--sub)" }}>CALLED OFF</span> : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3 }}>{p.place}</div>
        {p.note ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{p.note}</div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: `${PRACTICE_TINT[p.myStatus]}22`, color: PRACTICE_TINT[p.myStatus] }}>{PRACTICE_WORD[p.myStatus].toUpperCase()}</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {p.going} of {p.asked} coming
          </span>
        </div>

        {/* ⚠ THE PERSON ASKED ANSWERS HERE TOO, not only in their Inbox. A
            confirmed member reads this desk (the policy admits the whole crew),
            and a practice they have not answered with no way to answer it on the
            screen that shows it is the shape this repo calls a door that is not a
            door. The Inbox keeps its row for the same ask — one fact, two places
            you can act on it, exactly as a class ask is answerable from the Inbox
            and from the class page. */}
        {!cancelled && !past && p.myStatus !== "leader" ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => answer(p.id, false)} aria-label={`Cannot make ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1, borderStyle: "solid", opacity: p.myStatus === "rejected" ? 0.5 : 1 }}>
              Cannot make it
            </button>
            <button type="button" onClick={() => answer(p.id, true)} aria-label={`Coming to ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1, borderStyle: "solid", background: TINT, color: "#fff", borderColor: TINT, opacity: p.myStatus === "confirmed" ? 0.5 : 1 }}>
              I am coming
            </button>
          </div>
        ) : null}

        {p.iLead ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => openRegister(p.id)} aria-expanded={isOpen} aria-label={`Register for ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1, borderStyle: "solid" }}>
              {isOpen ? "Hide the register" : "Register"}
            </button>
            {!cancelled && !past ? (
              <button type="button" onClick={() => callOff(p.id)} aria-label={`Call off ${practiceWhen(p.startsAt)}`} style={{ ...bizBtn, flex: 1 }}>
                Call it off
              </button>
            ) : null}
          </div>
        ) : null}

        {isOpen ? (
          <div style={{ marginTop: 10, borderTop: "1.5px solid var(--el)", paddingTop: 8 }}>
            {busy === p.id ? <div style={{ fontSize: 11.5, color: "var(--sub)", padding: "8px 0" }}>Reading the register…</div> : null}
            {busy !== p.id && rows.length === 0 ? <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "8px 0" }}>Nobody on it yet.</div> : null}
            {rows.map((m) => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                {m.avatarPath ? (
                  <Image src={photoUrl(m.avatarPath) as string} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} unoptimized />
                ) : (
                  <CrewFace name={m.fullName} size={36} grad={[TINT, TINT]} radius={11} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fullName}</span>
                  <span style={{ display: "block", fontSize: 10, color: PRACTICE_TINT[m.status], marginTop: 1, fontWeight: 800 }}>{m.isLeader ? "Leader" : PRACTICE_WORD[m.status]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => mark(p.id, m.userId, !m.present)}
                  onKeyDown={pressKey(() => mark(p.id, m.userId, !m.present))}
                  aria-pressed={m.present}
                  aria-label={m.present ? `Take ${m.fullName} off the register` : `Check ${m.fullName} in`}
                  style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${m.present ? TINT : "var(--el)"}`, background: m.present ? TINT : "transparent", color: m.present ? "#fff" : "var(--sub)" }}
                >
                  {m.present ? "✓ In" : "Check in"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, padding: "0 16px", boxSizing: "border-box", paddingBottom: "var(--dos-foot)" }}>
      <DeskHero tool="practice" as="h1" margin="12px 0 8px" />
      <div style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 12px" }}>{crewName}</div>

      {/* ＋ ON TOP (20 Sep 2026's rule for every desk), the shared control */}
      <DeskAddButton label="Arrange a practice" href="?new=1" />

      {coming.length === 0 && over.length === 0 ? (
        <div style={{ ...bizCard, textAlign: "center", fontSize: 12, color: "var(--sub)", border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
          Nothing arranged yet — a practice asks everyone on the crew and lands on their calendar.
        </div>
      ) : null}

      {coming.length ? (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "14px 0 8px" }}>COMING UP</div>
          {coming.map(card)}
        </>
      ) : null}

      {over.length ? (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "14px 0 8px" }}>OVER</div>
          {over.map(card)}
        </>
      ) : null}

      <Toast msg={toast} />
    </div>
  );
}
