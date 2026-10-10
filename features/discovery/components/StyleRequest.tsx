"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { Sheet, fieldInput, fieldLabel, sheetBtn } from "@/features/profiles/components/profile-kit";
import { openSupportThreadAction } from "@/features/support/server-actions/support";
import { CARD, INK, LINE, SUB } from "@/lib/design/tokens";

/** "CAN'T FIND YOUR DANCE STYLE LISTED HERE?" (11 Oct 2026). The user: *"styles
 *  page on discover should have a button at the bottom of the page with a line
 *  Can't find your Dance Style listed here, Request button to send a name of the
 *  missing dance style to the admin for adding."*
 *
 *  ⚠ IT RIDES THE SUPPORT CONVERSATION RATHER THAN A TABLE OF ITS OWN: a
 *  request is a message to DanceOS, the admin already has a desk that lists
 *  every thread with an unread badge, and the answer ("added" / "it is listed as
 *  X") lands back in the same thread where the person reads it. Five new
 *  conversations an hour per account (the existing limit) is the spam guard.
 *  The style registry is code, so "adding" is a deploy — the admin's job, not a
 *  button. A signed-out visitor is sent to sign in: there is no thread to reply
 *  into without an account. */
export function StyleRequest({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    const style = name.trim();
    if (!style) return;
    setError(null);
    start(async () => {
      const res = await openSupportThreadAction({
        subject: `Style request: ${style}`.slice(0, 140),
        body: `Please add the dance style "${style}" to DanceOS — I could not find it on the Styles list.`,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSent(style);
      setName("");
    });
  };

  const button = { fontSize: 13, fontWeight: 800, padding: "10px 18px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "none", display: "inline-block" } as const;

  return (
    <div data-testid="style-request" style={{ marginTop: 18, padding: "16px 14px", borderRadius: 18, background: CARD, border: `1.5px dashed ${LINE}`, textAlign: "center" }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Can&apos;t find your Dance Style listed here?</div>
      <div style={{ fontSize: 12, color: SUB, margin: "4px 0 12px" }}>Send us its name and we&apos;ll add it.</div>
      {signedIn ? (
        <button
          type="button"
          style={button}
          onClick={() => {
            setSent(null);
            setError(null);
            setOpen(true);
          }}
        >
          Request
        </button>
      ) : (
        <Link href="/login" style={button}>
          Request
        </Link>
      )}
      {open ? (
        <Portal>
          <Sheet label="Request a dance style" onClose={() => setOpen(false)}>
            <b style={{ fontSize: 16 }}>Request a dance style</b>
            {sent ? (
              <>
                <div role="status" style={{ fontSize: 13, color: SUB, margin: "10px 0 4px" }}>
                  ✓ Sent — DanceOS will look at adding <b style={{ color: INK }}>{sent}</b>. The reply lands in Help &amp; support.
                </div>
                <button type="button" onClick={() => setOpen(false)} style={{ ...sheetBtn(true), width: "100%", marginTop: 14 }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <label htmlFor="style-request-name" style={{ ...fieldLabel, display: "block" }}>
                  Style name
                </label>
                <input
                  id="style-request-name"
                  aria-label="Style name"
                  value={name}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder="e.g. Afro House"
                  style={fieldInput}
                />
                {error ? (
                  <div role="alert" style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>
                    {error}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" onClick={() => setOpen(false)} style={sheetBtn(false)}>
                    Cancel
                  </button>
                  <button type="button" disabled={pending || !name.trim()} onClick={send} style={{ ...sheetBtn(true), opacity: pending || !name.trim() ? 0.5 : 1 }}>
                    {pending ? "Sending…" : "Send request"}
                  </button>
                </div>
              </>
            )}
          </Sheet>
        </Portal>
      ) : null}
    </div>
  );
}
