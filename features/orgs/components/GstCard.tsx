"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearGstinAction, verifyGstinAction } from "@/features/orgs/server-actions/gst";
import { dateWords } from "@/features/settings/components/settings-kit";
import { checkGstin, normalizeGstin, GSTIN_EXAMPLE } from "@/lib/gst/gstin";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const GREEN = "#22C55E";
const RED = "#F87171";

/** THE ORGANIZATION'S GST NUMBER — ENTERED ONCE, IN SETTINGS (11 Sep 2026).
 *
 *  The user: *"GST verification step is showing here at the org main screen and
 *  that['s] stupid — better make it one of the options in Settings where the org
 *  user can click and enter the GST, a one-time option."*
 *
 *  They were right. It sat on Home as a permanent card, which made a one-time
 *  errand look like a standing chore on the screen an organization opens twenty
 *  times a day. It lives on its own screen now, reached from Settings, and Home
 *  says nothing about it at all.
 *
 *  It is also where somebody lands who tried to put on an event without it —
 *  `/business/…/events` sends them here — so the screen has to answer "why am I
 *  here?" as well as "what do I type?". That is what `cameForEvents` is for.
 *
 *  The check is the placeholder the user asked for: three letters, five digits.
 *  The government API goes inside `verify_gstin` in the database later, and
 *  this screen does not change when it does. */
export function GstCard({
  gstin,
  verifiedAt,
  cameForEvents = false,
}: {
  gstin: string | null;
  verifiedAt: string | null;
  /** true when an event was what sent them here — say so, do not make them guess */
  cameForEvents?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(gstin ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(verifiedAt);
  const [changing, setChanging] = useState(false);
  const [pending, start] = useTransition();

  const clean = normalizeGstin(value);
  /* the hint under the field is the same judgement the server will make — it
     simply arrives before the round trip */
  const hint = clean.length === 0 ? null : checkGstin(clean);
  const ready = hint?.ok === true;

  const verify = () =>
    start(async () => {
      setErr(null);
      const out = await verifyGstinAction({ gstin: clean });
      if (out.error) {
        setErr(out.error);
        setDone(null);
        return;
      }
      setDone(out.verifiedAt);
      setChanging(false);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      setErr(null);
      const out = await clearGstinAction();
      if (out.error) {
        setErr(out.error);
        return;
      }
      setDone(null);
      setValue("");
      setChanging(true);
      router.refresh();
    });

  /* ── DONE. One line, and nothing to do — which is the point of a one-time
        errand: once it is behind you the screen says so and stops asking. ── */
  if (done && !changing) {
    return (
      <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 18, padding: "16px 16px 17px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span role="status" aria-label="GST number: verified" style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 999, padding: "2px 8px" }}>
            VERIFIED
          </span>
          <span style={{ fontSize: 11, color: SUB }}>on {dateWords(done)}</span>
        </div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 19, fontWeight: 800, letterSpacing: 2, color: INK, margin: "6px 0 8px" }}>{gstin ?? clean}</div>
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>
          Your organization can put on events. Nothing else on DanceOS waits on this — studios, classes, bookings and Discover never did.
        </div>
        <button
          type="button"
          onClick={() => {
            setChanging(true);
            setValue("");
          }}
          style={{ background: "transparent", border: "none", padding: 0, marginTop: 12, fontSize: 11.5, fontWeight: 800, color: SUB, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Entered the wrong number?
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 18, padding: "16px 16px 17px" }}>
      {cameForEvents ? (
        <div role="status" aria-label="Why you are here" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", borderRadius: 13, background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.35)", marginBottom: 14 }}>
          <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.2 }}>🎟</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: INK, lineHeight: 1.5 }}>
            <b>Events need this first.</b> It is how DanceOS knows the business behind the ticket. Add it once and the events desk opens.
          </span>
        </div>
      ) : null}

      <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55, marginBottom: 13 }}>
        Enter it once. Your studios, classes, bookings and Discover do not wait on it — only <b style={{ color: INK }}>events</b> do.
      </div>

      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 6 }}>GST NUMBER</div>
      <input
        value={value}
        aria-label="GST number"
        onChange={(e) => {
          setValue(e.target.value);
          setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready && !pending) verify();
        }}
        placeholder={GSTIN_EXAMPLE}
        maxLength={20}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "var(--bg)",
          border: `1px solid ${err ? RED : EL}`,
          borderRadius: 13,
          padding: "13px 14px",
          fontSize: 17,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          letterSpacing: 2,
          textTransform: "uppercase",
          color: INK,
        }}
      />

      <div style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.45, color: err ? RED : MUTED, minHeight: 15 }}>
        {err ?? (hint && !hint.ok ? hint.reason : ready ? "Looks right. Press Verify." : `Three letters then five digits — like ${GSTIN_EXAMPLE}.`)}
      </div>

      <button
        type="button"
        onClick={verify}
        disabled={!ready || pending}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "14px 0",
          borderRadius: 999,
          border: "none",
          background: ready && !pending ? "var(--text)" : EL,
          color: ready && !pending ? "var(--solid)" : MUTED,
          fontSize: 14,
          fontWeight: 900,
          cursor: ready && !pending ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        {pending ? "Checking…" : "Verify"}
      </button>

      {done && changing ? (
        <button type="button" onClick={() => setChanging(false)} style={{ display: "block", margin: "10px auto 0", background: "transparent", border: "none", padding: 0, fontSize: 11.5, fontWeight: 800, color: SUB, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
          Keep {gstin}
        </button>
      ) : null}
      {gstin && !done ? (
        <button type="button" onClick={remove} disabled={pending} style={{ display: "block", margin: "10px auto 0", background: "transparent", border: "none", padding: 0, fontSize: 11.5, fontWeight: 800, color: SUB, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
          Remove the number on file
        </button>
      ) : null}
    </div>
  );
}
