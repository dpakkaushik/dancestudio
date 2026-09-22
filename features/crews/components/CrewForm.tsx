"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCrewAction } from "@/features/crews/server-actions/crews";
import { PeoplePicker, personGradient, personInitials } from "@/features/people/components/PeoplePicker";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import {
  EL,
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
  formSecondary,
} from "@/components/ui/FormPage";
import { dosStyleColor } from "@/lib/constants/styles";
import { SUB } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";
import { pressKey } from "./crew-kit";

/** Create your crew — the prototype's `crewFormOnly` (9545-9611) wearing the
 *  ADD CLASS anatomy (21 Sep 2026, the user: *"Create Crew form in crews should
 *  look similar to add class page"*). Its own content is unchanged: DETAILS,
 *  then MEMBERS as a row of faces with the dashed ＋, then the confirm sheet.
 *  What changed is the frame — `components/ui/FormPage`, which is now the one
 *  place that anatomy is written down.
 *
 *  ⚠ THE TWO STEPS ARE NOT DECORATION. Step one is what a crew IS and cannot be
 *  skipped; step two is who is in it, and is legitimately EMPTY — a crew of one
 *  is a real crew, and the bar says so rather than blocking. Splitting them is
 *  also what lets the primary button name the missing answer the way the class
 *  form's does, which needs a step whose answers are all required.
 *
 *  ⚠ Everyone named is ASKED, never written onto a public roster — the rule
 *  since Step 22, and the confirm sheet says it in as many words. */

export function CrewForm({ defaultCity, sheet = false }: { defaultCity: string | null; sheet?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  /* the leader's own city to start with; a crew has no address to read one off,
     so the field is the app's one city control (11 / 19 Sep 2026) */
  const [city, setCity] = useState<string>(defaultCity?.trim() || "");
  const [style, setStyle] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [pick, setPick] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };

  /* the button NAMES what is missing rather than greying out (15573-15578) */
  const stepOneErr = !name.trim() ? "Name your crew first" : !city ? "Pick a city" : null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const out = await createCrewAction({ name: name.trim(), city, style: style || "All styles", memberIds: members.map((m) => m.id) });
    setBusy(false);
    setConfirm(false);
    if (out.error || !out.crewId) {
      fire(out.error ?? "Give the crew a name first");
      return;
    }
    fire(`🎉 ${name.trim()} created — you're the leader`);
    /* ⚠ A SHEET REPLACES ITS OWN ENTRY ON THE WAY OUT (22 Sep 2026). Unlike a
       routine or a membership, making a crew LEAVES for the thing you just made
       — so a `push` from a sheet would stack the crew's home on top of the
       `?new=1` entry that opened it, and the first back press would re-open the
       form over the hub. That is the looping shape this app has been bitten by
       twice already; `replace` spends the sheet's entry instead. */
    setTimeout(() => {
      const to = `/crews/${out.crewId}/manage`;
      if (sheet) router.replace(to);
      else router.push(to);
    }, 700);
  };

  return (
    <FormPage title="Create crew" steps={["The crew", "Members"]} step={step} sheet={sheet} onClose={() => router.back()} onBack={() => (step > 0 ? setStep(0) : router.back())}>
      {step === 0 ? (
        <>
          <div style={FORM_LABEL}>CREW NAME</div>
          <input value={name} aria-label="Crew name" onChange={(e) => setName(e.target.value.slice(0, 64))} placeholder="e.g. EEE Crew" style={FORM_INPUT} />

          <div style={FORM_LABEL}>CITY</div>
          <CityPicker value={city || null} label="City" onChange={(next) => setCity(next ?? "")} />

          <div style={FORM_LABEL}>DANCE STYLE</div>
          {/* the app's one style picker (9561) — searchable, "All styles" above the list */}
          <DosStylePicker value={style} onChange={setStyle} all placeholder="Dance style" />
        </>
      ) : (
        <>
          <div style={FORM_LABEL}>MEMBERS · {members.length} added</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
            {members.map((m) => {
              const g = personGradient(m.fullName);
              return (
                <div key={m.id} style={{ textAlign: "center", width: 58, flexShrink: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${m.fullName} from the list`}
                    onKeyDown={pressKey(() => setMembers((ms) => ms.filter((x) => x.id !== m.id)))}
                    onClick={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))}
                    style={{ width: 44, height: 44, borderRadius: 22, margin: "0 auto", background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}
                  >
                    {personInitials(m.fullName)}
                  </div>
                  <div style={{ fontSize: 9, color: SUB, marginTop: 3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fullName.split(" ")[0]}</div>
                </div>
              );
            })}
            <div role="button" tabIndex={0} aria-label="Add a member" onKeyDown={pressKey(() => setPick((v) => !v))} onClick={() => setPick((v) => !v)} style={{ textAlign: "center", width: 58, flexShrink: 0, cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, border: `2px dashed ${EL}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: SUB, margin: "0 auto" }}>＋</div>
              <div style={{ fontSize: 9, color: SUB, marginTop: 3, fontWeight: 700 }}>Add</div>
            </div>
          </div>
          {pick ? (
            <div style={{ marginTop: 10 }}>
              <PeoplePicker
                title="CREW MEMBERS"
                placeholder="Add dancers or artists…"
                actionWord="Add ›"
                exclude={members.map((m) => m.id)}
                pickLabel={(p) => `Add ${p.fullName} to the crew`}
                onPick={(p) => {
                  setMembers((ms) => (ms.some((x) => x.id === p.id) ? ms : [...ms, p]));
                  fire(`✅ ${p.fullName} added — they'll be asked to confirm`);
                }}
              />
            </div>
          ) : null}

          <FormNote>
            {members.length
              ? `Nobody is put on a public roster without saying yes — each of the ${members.length} will be asked, and the crew is yours from the moment you create it.`
              : "A crew of one is a real crew. You can ask people onto it any time from the crew's own desk."}
          </FormNote>
        </>
      )}

      <FormBar>
        {step === 0 ? (
          <button
            type="button"
            aria-disabled={Boolean(stepOneErr)}
            onClick={() => (stepOneErr ? fire(stepOneErr) : setStep(1))}
            style={{ ...formPrimary(!stepOneErr), flex: 1 }}
          >
            {stepOneErr ?? "Continue"}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setStep(0)} style={formSecondary}>
              Back
            </button>
            <button type="button" aria-label="Create crew" onClick={() => setConfirm(true)} style={formPrimary(true)}>
              Create crew
            </button>
          </>
        )}
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Create this crew?"
          title="Create this crew?"
          sub={members.length ? `${members.length} ${members.length === 1 ? "person is" : "people are"} asked to confirm — the crew is yours either way.` : "You will be its leader. Add people any time from the crew's desk."}
          confirmWord={busy ? "Creating…" : "Create crew"}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void create()}
        >
          <FormSummary
            tint={dosStyleColor(style || "All styles")}
            head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>👥 {style || "All styles"} · {city}</span>}
          >
            <b style={{ fontSize: 15 }}>{name.trim()}</b>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>
              {members.length} member{members.length === 1 ? "" : "s"} + you as leader
            </div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
