"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { Sheet, pictureChipPaint } from "@/features/profiles/components/profile-kit";
import { reportContentAction } from "@/features/reports/server-actions/reports";
import { INK, SUB } from "@/lib/design/tokens";
import type { ReportReason, ReportSubjectKind } from "@/repositories/adminPanel";

const EL = "var(--el)";

/** The reasons, in the words a person would actually use, and only the ones
 *  that make sense for the thing being reported. */
const REASONS: Record<ReportSubjectKind, Array<[ReportReason, string]>> = {
  business: [
    ["not_a_real_business", "This is not a real studio"],
    ["impersonation", "It is pretending to be someone else"],
    ["stolen_content", "It is using someone else's photos"],
    ["unsafe", "Something here is unsafe"],
    ["spam", "Spam"],
    ["other", "Something else"],
  ],
  profile: [
    ["impersonation", "Pretending to be someone else"],
    ["offensive", "Offensive"],
    ["stolen_content", "Using someone else's photos"],
    ["unsafe", "Unsafe behaviour"],
    ["spam", "Spam"],
    ["other", "Something else"],
  ],
  crew: [
    ["offensive", "Offensive"],
    ["impersonation", "Pretending to be someone else"],
    ["spam", "Spam"],
    ["other", "Something else"],
  ],
  event: [
    ["not_a_real_business", "This event is not real"],
    ["unsafe", "Something about it is unsafe"],
    ["stolen_content", "It is using someone else's photos"],
    ["spam", "Spam"],
    ["other", "Something else"],
  ],
  class: [
    ["not_a_real_business", "This class is not real"],
    ["unsafe", "Something about it is unsafe"],
    ["stolen_content", "It is using someone else's photos"],
    ["spam", "Spam"],
    ["other", "Something else"],
  ],
};

/* the flag the chip wears — one glyph, the same 36px chip on every profile */
const FLAG = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </svg>
);
/* ⚠ THE PICTURE CHIP'S SCRIM, NOT THE CARD VEIL: the corner sits ON the header
   banner, and `--card` (7% white) vanished into a light picture — measured by eye
   on the first screenshot. A dark scrim with a white glyph reads on anything. */
const CHIP: React.CSSProperties = { width: 36, height: 36, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", ...pictureChipPaint, color: "#fff", cursor: "pointer", flexShrink: 0, textDecoration: "none" };

/** REPORT — AN ICON AT THE PROFILE'S TOP RIGHT, OPENING A FORM FROM BELOW
 *  (11 Oct 2026, the user: "report profile button not on bottom of profile page
 *  but on top right of the profile with a icon button only which should open
 *  the segment from below like a form not a collapsible thing it is now").
 *
 *  It was an underlined line at the page's foot that unfolded a card in place
 *  (10 Sep 2026). What it keeps: the closed list of reasons (a free-text-only
 *  report cannot be counted), the optional note, the refusal in the database's
 *  own words when somebody reports twice, and that a signed-out visitor gets no
 *  form — the icon sends them to sign in instead. ⚠ The accessible names are
 *  unchanged (`Report {name}` / "Send report"), so the suite finds the same
 *  controls; the signed-out link is named "Sign in to report this page".
 *
 *  ⚠ The sheet is PORTALLED: the chip sits inside the hero's top panel, and a
 *  fixed child of an animated panel is clipped by it (the 16 Sep lesson). */
export function ReportButton({
  subjectKind,
  subjectId,
  subjectName,
  signedIn,
}: {
  subjectKind: ReportSubjectKind;
  subjectId: string;
  subjectName: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setReason(null);
    setNote("");
    setError(null);
  };

  const send = () => {
    if (!reason) return;
    start(async () => {
      const out = await reportContentAction({ subjectKind, subjectId, reason, note: note.trim() || null });
      if (out.error) {
        setError(out.error);
        return;
      }
      setReason(null);
      setNote("");
      setError(null);
      setSaid("Thank you — a DanceOS admin will read this.");
    });
  };

  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Sign in to report this page" title="Sign in to report this page" data-testid="report-button" style={CHIP}>
        {FLAG}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="report-button"
        aria-label={`Report ${subjectName}`}
        title={`Report this ${subjectKind === "business" ? "page" : subjectKind}`}
        onClick={() => {
          setSaid(null);
          setOpen(true);
        }}
        style={CHIP}
      >
        {FLAG}
      </button>
      {open ? (
        <Portal>
          <Sheet label={`Report ${subjectName}`} onClose={close} maxHeight="86vh">
            <b style={{ fontSize: 16 }}>Report {subjectName}</b>
            {said ? (
              <>
                <div role="status" style={{ fontSize: 12.5, color: SUB, margin: "10px 0 4px", lineHeight: 1.5 }}>
                  {said}
                </div>
                <button type="button" onClick={close} style={{ width: "100%", marginTop: 14, height: 42, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 13, background: "var(--text)", color: "var(--solid)" }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: SUB, margin: "4px 0 12px", lineHeight: 1.5 }}>
                  A DanceOS admin reads every report and tells you what they did about it. Nobody is told who reported them.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {REASONS[subjectKind].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setReason(key)}
                      aria-pressed={reason === key}
                      style={{ textAlign: "left", padding: "11px 13px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: reason === key ? 800 : 600, background: reason === key ? "var(--text)" : "var(--card)", color: reason === key ? "var(--solid)" : INK, border: `1.5px solid ${reason === key ? "var(--text)" : EL}` }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {reason ? (
                  <>
                    <label htmlFor="report-note" style={{ display: "block", fontSize: 10, fontWeight: 900, letterSpacing: 1, color: SUB, margin: "13px 0 6px" }}>
                      ANYTHING ELSE (OPTIONAL)
                    </label>
                    <textarea
                      id="report-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="What should the admin look at?"
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--card)", border: `1.5px solid ${EL}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: INK, fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, textTransform: "none", letterSpacing: "normal" }}
                    />
                  </>
                ) : null}
                {error ? (
                  <div role="alert" style={{ fontSize: 11.5, color: "#EF4444", marginTop: 9, lineHeight: 1.45 }}>
                    {error}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" onClick={close} style={{ height: 42, padding: "0 16px", borderRadius: 12, background: "var(--card)", border: `1.5px solid ${EL}`, color: SUB, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13 }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending || !reason}
                    onClick={send}
                    style={{ flex: 1, height: 42, borderRadius: 12, border: "none", cursor: reason ? "pointer" : "default", fontFamily: "inherit", fontWeight: 900, fontSize: 13, background: reason ? "#EF4444" : EL, color: reason ? "#fff" : SUB }}
                  >
                    {pending ? "Sending…" : "Send report"}
                  </button>
                </div>
              </>
            )}
          </Sheet>
        </Portal>
      ) : null}
    </>
  );
}
