"use client";

import { useState, useTransition } from "react";
import { reportContentAction } from "@/features/reports/server-actions/reports";
import { INK, SUB } from "@/lib/design/tokens";
import type { ReportReason, ReportSubjectKind } from "@/repositories/adminPanel";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** The reasons, in the words a person would actually use, and only the ones
 *  that make sense for the thing being reported. */
const REASONS: Record<ReportSubjectKind, Array<[ReportReason, string]>> = {
  tenant: [
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

/** REPORT (10 Sep 2026) — the quiet control at the foot of a public page.
 *
 *  Deliberately understated: it is not a button anybody should press by
 *  accident, and it is not a threat hanging over an honest studio's page. It
 *  opens a short form with a closed list of reasons, because a free-text-only
 *  report cannot be counted, sorted or acted on consistently.
 *
 *  A signed-out visitor sees the sentence and no form — reporting needs an
 *  account, or the queue fills with noise nobody can answer. */
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

  const send = () => {
    if (!reason) return;
    start(async () => {
      const out = await reportContentAction({ subjectKind, subjectId, reason, note: note.trim() || null });
      if (out.error) {
        setError(out.error);
        return;
      }
      setOpen(false);
      setReason(null);
      setNote("");
      setError(null);
      setSaid("Thank you — a DanceOS admin will read this.");
    });
  };

  if (said) {
    return (
      <div role="status" style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "14px 16px", lineHeight: 1.5 }}>
        {said}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ textAlign: "center", padding: "16px 16px 8px" }}>
        {signedIn ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Report ${subjectName}`}
            style={{ background: "none", border: "none", padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 700, color: MUTED, textDecoration: "underline" }}
          >
            Report this {subjectKind === "tenant" ? "page" : subjectKind}
          </button>
        ) : (
          <span style={{ fontSize: 10.5, color: MUTED }}>Sign in to report this page.</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ margin: "16px", background: CARD, border: `1px solid ${EL}`, borderRadius: 16, padding: "12px 13px" }}>
      <b style={{ fontSize: 13 }}>Report {subjectName}</b>
      <div style={{ fontSize: 11, color: SUB, margin: "3px 0 10px", lineHeight: 1.5 }}>
        A DanceOS admin reads every report and tells you what they did about it. Nobody is told who reported them.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {REASONS[subjectKind].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setReason(key)}
            aria-pressed={reason === key}
            style={{ textAlign: "left", padding: "9px 11px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: reason === key ? 800 : 600, background: reason === key ? "var(--text)" : "var(--bg)", color: reason === key ? "var(--solid)" : INK, border: `1px solid ${reason === key ? "var(--text)" : EL}` }}
          >
            {label}
          </button>
        ))}
      </div>

      {reason ? (
        <>
          <label htmlFor="report-note" style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "11px 0 5px" }}>
            ANYTHING ELSE (OPTIONAL)
          </label>
          <textarea
            id="report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="What should the admin look at?"
            style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 11, padding: "9px 11px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
          />
        </>
      ) : null}

      {error ? <div style={{ fontSize: 11, color: "#B42318", marginTop: 8, lineHeight: 1.45 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
        <button
          type="button"
          disabled={pending || !reason}
          onClick={send}
          style={{ flex: 1, height: 38, borderRadius: 11, border: "none", cursor: reason ? "pointer" : "default", fontFamily: "inherit", fontWeight: 900, fontSize: 12, background: reason ? "#EF4444" : EL, color: reason ? "#fff" : SUB }}
        >
          {pending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setReason(null); setNote(""); setError(null); }}
          style={{ height: 38, padding: "0 14px", borderRadius: 11, background: "var(--bg)", border: `1px solid ${EL}`, color: SUB, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
