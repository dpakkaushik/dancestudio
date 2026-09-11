"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearGstinAction, verifyGstinAction } from "@/features/orgs/server-actions/gst";
import { dateWords } from "@/features/settings/components/settings-kit";
import { checkGstin, normalizeGstin, GSTIN_LENGTH } from "@/lib/gst/gstin";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const GREEN = "#22C55E";
const RED = "#F87171";

/** THE ORGANIZATION'S GST NUMBER (11 Sep 2026 — the user: "instead of social
 *  media use GST number. GST verification will be by API; right now bypass —
 *  just give a Verify button: if it's in format then verified, else reject.
 *  If a user doesn't have a GST he can still create a studio but can't create
 *  an event").
 *
 *  So this card is not a queue and there is nobody to wait for. A number is
 *  typed, Verify is pressed, and the answer comes back in the same second —
 *  either a tick and the date, or the exact reason it is not a GST number.
 *
 *  It says plainly what the number unlocks and what does NOT depend on it,
 *  because the most likely reader is an organization that has none: studios,
 *  classes, bookings and Discover all work without it. Events do not. */
export function GstCard({
  gstin,
  verifiedAt,
}: {
  gstin: string | null;
  verifiedAt: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(gstin ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(verifiedAt);
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
      router.refresh();
    });

  return (
    <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 18, padding: "15px 16px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <b style={{ fontSize: 14, color: INK }}>GST number</b>
        {done ? (
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 999, padding: "2px 7px" }}>VERIFIED</span>
        ) : (
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: MUTED, border: `1px solid ${EL}`, borderRadius: 999, padding: "2px 7px" }}>NOT VERIFIED</span>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, marginBottom: 11 }}>
        {done
          ? `Verified on ${dateWords(done)}. Your organization can put on events.`
          : "Events need the business behind the ticket. Your studios, classes, bookings and Discover do not — only events wait on this."}
      </div>

      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, fontWeight: 800, letterSpacing: 1, color: INK }}>{gstin ?? clean}</span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            style={{ background: "transparent", border: "none", padding: 0, fontSize: 11, fontWeight: 800, color: SUB, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {pending ? "Removing…" : "Use a different number"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
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
              placeholder="27ABCDE1234F1Z5"
              maxLength={24}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: "border-box",
                background: "var(--bg)",
                border: `1px solid ${err ? RED : EL}`,
                borderRadius: 12,
                padding: "10px 11px",
                fontSize: 13.5,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                letterSpacing: 1,
                textTransform: "uppercase",
                color: INK,
              }}
            />
            <button
              type="button"
              onClick={verify}
              disabled={!ready || pending}
              style={{
                flex: "0 0 auto",
                padding: "0 18px",
                borderRadius: 12,
                border: "none",
                background: ready && !pending ? "var(--text)" : EL,
                color: ready && !pending ? "var(--solid)" : MUTED,
                fontSize: 12.5,
                fontWeight: 900,
                cursor: ready && !pending ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              {pending ? "Checking…" : "Verify"}
            </button>
          </div>

          <div style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.45, color: err ? RED : MUTED }}>
            {err ??
              (hint && !hint.ok
                ? hint.reason
                : ready
                  ? `Looks like a GST number from state ${hint.stateCode}. Press Verify.`
                  : `${GSTIN_LENGTH} characters, as printed on your registration certificate.`)}
          </div>
        </>
      )}
    </div>
  );
}
