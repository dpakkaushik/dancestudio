"use client";

import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

/** THE SHAPE EVERY "ADD SOMETHING" FORM IN THIS APP WEARS (21 Sep 2026).
 *
 *  The user: *"Create Crew form in crews should look similar to add class page.
 *  same should be for new routine and new membership."* They are right that the
 *  four had drifted, and the drift was total rather than cosmetic:
 *
 *    · ADD CLASS was the prototype's S_classform (15108-15650) — a ← heading, a
 *      step bar, field blocks, a FIXED bottom action bar whose button NAMES the
 *      missing answer instead of greying out (15573-15578), and a confirm sheet
 *      with a summary card of the thing you are about to make (15595-15617);
 *    · CREATE CREW was a page with a blue sleeve and a plain "Save crew" row;
 *    · NEW ROUTINE and NEW MEMBERSHIP were not pages at all — they were cards
 *      that expanded inside their desk, with Cancel / Save at the bottom.
 *
 *  ⚠ THIS FILE IS THE SPEC, AND THAT IS THE WHOLE POINT. This repo has learnt
 *  three times over that a design copied into four screens is a design that
 *  disagrees with itself within a week (`linkChip` declared twice, the figure
 *  row written out three times, three copies of the identity band). So the
 *  anatomy lives here ONCE and `ClassForm` reads it too — the screen the other
 *  three are being matched to is not allowed to be the one that drifts.
 *
 *  What a caller still owns, because it is genuinely its own: the FIELDS, and
 *  the BODY of the confirm sheet (a class shows a calendar card, a membership
 *  shows what a pass is worth — they are different objects and should read
 *  differently). */

export const CARD = "var(--card)";
export const EL = "var(--el)";

/** the prototype's field eyebrow (15169) — ONE label tier per form, the rule
 *  written down on 16 Sep after a second heading style shipped over two blocks
 *  out of five and read as randomness because it was randomness */
export const FORM_LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  color: "var(--muted)",
  margin: "18px 0 8px",
};

export const FORM_INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: "none",
  borderRadius: 12,
  padding: "12px 14px",
  color: INK,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
  /* ⚠ text-transform INHERITS, and Tailwind v4's preflight gives every input
     `font: inherit` — a label wrapper once rendered a studio's whole About
     paragraph in uppercase at weight 800 (16 Sep 2026). This is the guard. */
  textTransform: "none",
};

export const formChip = (active: boolean): React.CSSProperties => ({
  padding: "9px 13px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
  border: `1.5px solid ${active ? INK : "transparent"}`,
  background: active ? EL : CARD,
  color: INK,
  transition: "all .15s",
  fontFamily: "inherit",
});

/** the primary pill. `enabled === false` paints it as the form's own "you have
 *  not answered this yet" state rather than disabling it, because the button
 *  then carries the REASON as its label. */
export const formPrimary = (enabled: boolean): React.CSSProperties => ({
  flex: 1.4,
  padding: 14,
  borderRadius: 999,
  border: "none",
  background: enabled ? INK : EL,
  color: enabled ? LILAC : "var(--muted)",
  fontWeight: 700,
  fontSize: enabled ? 15 : 13.5,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all .18s",
});

export const formSecondary: React.CSSProperties = {
  flex: 1,
  padding: 13,
  borderRadius: 999,
  border: `1.5px solid ${EL}`,
  background: "transparent",
  color: INK,
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

/** THE PAGE — the wash, the ← heading, the step line and the progress bars.
 *  `paddingBottom: 150` is what keeps the last field clear of the fixed bar. */
export function FormPage({
  title,
  sub,
  steps,
  step = 0,
  onBack,
  children,
}: {
  title: string;
  /** the line under the heading. When `steps` is given and this is absent, the
   *  page says "Step 1 of 2 — The session" itself. */
  sub?: string;
  steps?: readonly string[];
  step?: number;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const line = sub ?? (steps && steps.length > 1 ? `Step ${step + 1} of ${steps.length} — ${steps[step]}` : steps?.[0]);
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 150px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <button type="button" aria-label={step > 0 ? "Back a step" : "Back"} onClick={onBack} style={{ fontSize: 20, cursor: "pointer", lineHeight: 1, background: "none", border: "none", color: INK, padding: 0, fontFamily: "inherit" }}>
          ←
        </button>
        {/* ⚠ A REAL HEADING (21 Sep 2026). `ClassForm` drew this as a plain div
            for a year, so a form page had no heading at all for a screen reader
            — the same gap `DeskHero as="h1"` closed for the desks on 18 Sep. The
            e2e found it the moment a locator asked for one. Margins are zeroed
            so the look is identical to the div it replaces. */}
        <h1 style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, flex: 1, margin: 0 }}>{title}</h1>
      </div>
      {line ? <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>{line}</div> : null}
      {/* progress (prototype 15547-15550) — drawn only where there is more than
          one step, because a single full bar says nothing */}
      {steps && steps.length > 1 ? (
        <div style={{ display: "flex", gap: 5, margin: "12px 0 4px" }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? INK : EL, transition: "all .2s" }} />
          ))}
        </div>
      ) : (
        <div style={{ height: 6 }} />
      )}
      {children}
    </div>
  );
}

/** the sticky action bar, gesture-inset aware (15568-15582) */
export function FormBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 310, boxSizing: "border-box", background: "var(--solid)", borderTop: `1.5px solid ${EL}`, padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
      {children}
    </div>
  );
}

/** WHAT HAPPENS ON SAVE — the panel the class form prints on its last step, in
 *  the prototype's own place (15551-15567). Either the blockers, one per line,
 *  or one sentence saying where the thing is about to go. */
export function FormNote({ blockers, children }: { blockers?: string[]; children?: React.ReactNode }) {
  if (!blockers?.length && !children) return null;
  return (
    <div style={{ background: CARD, border: `1.5px solid ${EL}`, borderRadius: 14, padding: "12px 13px", margin: "16px 0 4px", fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
      {blockers?.length ? blockers.map((b) => <div key={b}>· {b}</div>) : children}
    </div>
  );
}

/** THE CONFIRM SHEET (15588-15625). The body is the caller's, because the thing
 *  you are about to make is different every time; everything around it is not.
 *  ⚠ System back closes it exactly as the scrim does — `useCloseOnBack` owns
 *  its own history entry, the 19 Sep rewrite. */
export function FormConfirm({
  label,
  title,
  sub,
  cancelWord = "Keep editing",
  confirmWord,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: {
  /** the dialog's accessible name — a question, the way the class form asks one */
  label: string;
  title: string;
  sub?: string;
  cancelWord?: string;
  confirmWord: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  useCloseOnBack(onCancel, true);
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "18px 16px 30px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: INK, animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 14px" }} />
        <b style={{ fontSize: 17 }}>{title}</b>
        {sub ? <div style={{ fontSize: 12, color: SUB, margin: "3px 0 14px" }}>{sub}</div> : <div style={{ height: 12 }} />}
        {children}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: INK }}>
            {cancelWord}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} style={{ flex: 1.4, textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: LILAC, fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
            {busy ? "Working…" : confirmWord}
          </button>
        </div>
      </div>
    </div>
  );
}

/** the summary card inside a confirm sheet — a tinted head over a plain body,
 *  which is what the class form's calendar card is underneath its own colours */
export function FormSummary({ tint, head, children }: { tint: string; head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", background: CARD, border: `1.5px solid ${EL}` }}>
      <div style={{ background: `${tint}40`, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>{head}</div>
      <div style={{ padding: "10px 12px" }}>{children}</div>
    </div>
  );
}

/** the app's one toast, at the height that clears the action bar */
export function FormToast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>
      {msg}
    </div>
  );
}
