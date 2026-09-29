"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FORM_INPUT, FORM_LABEL, FormBar, FormConfirm, FormPage, FormSummary, FormToast, formPrimary, formSecondary } from "@/components/ui/FormPage";
import { saveCrewPracticeAction } from "@/features/crews/server-actions/practices";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import type { CrewPractice } from "@/types/crewPractice";

/** ARRANGE A PRACTICE (27 Sep 2026) — ONE PAGE, as a SHEET over the desk that
 *  offered it (`?new=1`, C54's grammar and C55's one-page rule: only the class
 *  and event forms keep steps, at the user's word).
 *
 *  ⚠ THE BUTTON NAMES THE MISSING ANSWER rather than sitting disabled and silent
 *  — `ClassForm`'s rule, and `ClassForm` has never carried a fixed `aria-label`
 *  for exactly this reason: its accessible name IS its visible text, so a screen
 *  reader hears the blocker too. The 22 Sep regression was five forms that forgot
 *  that, caught by the suite inside seven minutes.
 *
 *  ⚠ NO CAPACITY, NO PRICE, NO ROOM PICKER. A practice is not a class: there is
 *  nothing to sell, nobody to pay, and the place is free text because a crew
 *  rehearses wherever it found a floor — a room belongs to a studio, and a crew
 *  that books one is that studio's guest, not its business. */
export function PracticeForm({ crewId, crewName, practice = null }: { crewId: string; crewName: string; practice?: CrewPractice | null }) {
  const router = useRouter();
  const editing = Boolean(practice);
  /* the IST wall clock the person typed, which is what the action turns into an
     instant (+05:30) — never `new Date(...)` on a naive string */
  const istParts = (iso: string) => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
  };
  const from = practice ? istParts(practice.startsAt) : null;
  const to = practice ? istParts(practice.endsAt) : null;

  const [date, setDate] = useState(from?.date ?? "");
  const [startTime, setStartTime] = useState(from?.time ?? "19:00");
  const [endTime, setEndTime] = useState(to?.time ?? "21:00");
  const [place, setPlace] = useState(practice?.place ?? "");
  const [note, setNote] = useState(practice?.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* the one sentence the button says when it cannot be pressed (15568-15578) */
  const blocker = !date ? "Pick a day" : !startTime || !endTime ? "Pick the hours" : endTime <= startTime ? "It has to end after it starts" : !place.trim() ? "Say where" : null;

  const close = () => router.back();

  const submit = async () => {
    setBusy(true);
    const r = await saveCrewPracticeAction({ crewId, practiceId: practice?.id ?? null, date, startTime, endTime, place, note: note.trim() || null });
    setBusy(false);
    if (r.error) {
      setConfirm(false);
      setToast(r.error);
      return;
    }
    /* ⚠ THE CONFIRM CLOSES FIRST AND THE SHEET A TASK BEHIND IT (C54). Each owns
       its own history entry and the confirm's sits on top, so closing them in
       the other order leaves `?new=1` live underneath and the next back press
       re-opens the form — the loop this app has been bitten by three times.
       ⚠⚠ AND `refresh()` COMES **AFTER** `back()`, which is the order the four
       other sheets already use (routine, membership, room, asset) and the one I
       got wrong first: called before, it re-reads the route the sheet is ON, and
       the desk you land on is still the cached one — so the practice you had
       just arranged was not there until the next navigation. The shoot caught it
       in four checks at the same moment. */
    setConfirm(false);
    /* ⚠⚠ AND THE DELAY IS 600, NOT 0 — the same number the four other sheets
       use, and the reason is the one C54 wrote down: the CONFIRM owns its own
       history entry and spends it on a MICROTASK when it closes, so a `back()`
       fired in the same tick races that one and the sheet simply does not close.
       At 0 the shoot sat on `?new=1` until it timed out. */
    setTimeout(() => {
      router.back();
      router.refresh();
    }, 600);
  };

  return (
    <FormPage
      sheet
      onClose={close}
      onBack={close}
      title={editing ? "Move the practice" : "Arrange a practice"}
      sub={editing ? `${crewName} — everyone who said they are coming is told` : `${crewName} — everyone on the crew is asked`}
    >
      <label style={FORM_LABEL} htmlFor="practice-date">
        Day
      </label>
      <input id="practice-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={FORM_INPUT} />

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={FORM_LABEL} htmlFor="practice-from">
            Starts
          </label>
          <input id="practice-from" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={FORM_INPUT} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={FORM_LABEL} htmlFor="practice-to">
            Ends
          </label>
          <input id="practice-to" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={FORM_INPUT} />
        </div>
      </div>

      <label style={{ ...FORM_LABEL, marginTop: 14 }} htmlFor="practice-place">
        Where
      </label>
      <input id="practice-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Studio 4, Baner" maxLength={120} style={FORM_INPUT} />

      <label style={{ ...FORM_LABEL, marginTop: 14 }} htmlFor="practice-note">
        Anything to bring
      </label>
      <input id="practice-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Knee pads" maxLength={280} style={FORM_INPUT} />

      <FormBar>
        <button type="button" onClick={close} style={formSecondary}>
          Cancel
        </button>
        <button type="button" disabled={Boolean(blocker)} onClick={() => setConfirm(true)} style={formPrimary(!blocker)}>
          {blocker ?? (editing ? "Move it" : "Arrange it")}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label={editing ? "Move this practice?" : "Arrange this practice?"}
          title={editing ? "Move the practice" : "Arrange the practice"}
          sub={editing ? "Everyone who has not said no is told it moved — nobody is asked again." : "Everyone confirmed on the crew is asked. You are not: you arranged it."}
          confirmWord={editing ? "Move it" : "Arrange it"}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void submit()}
        >
          <FormSummary tint={DOS_TOOLS.practice.c} head={crewName}>
            <div>{date}</div>
            <div>
              {startTime} – {endTime}
            </div>
            <div>{place}</div>
            {note.trim() ? <div>{note.trim()}</div> : null}
          </FormSummary>
        </FormConfirm>
      ) : null}
      <FormToast msg={toast} />
    </FormPage>
  );
}
