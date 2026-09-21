"use client";

import { useState, useSyncExternalStore } from "react";
import { QRBlock } from "@/components/ui/QRBlock";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { PROFILE_CHIP } from "./profile-band";

/* the page's own host, read the sanctioned way (no impure render access) */
const subscribeNever = () => () => {};
const readHost = () => `${window.location.protocol}//${window.location.host}`;
const readServerHost = () => "";

/** ⚠ THE QR IS THE QR, AND SHARE IS ITS OWN BUTTON (21 Sep 2026).
 *
 *  The user: *"Seprate current Qr Code from share option and share to directly
 *  send link of that profile."* They are right that one control was doing two
 *  jobs: this chip was labelled "Share this profile — QR code" and opened a
 *  sheet that was a QR AND a copy-link — so somebody who wanted to send a link
 *  had to open a code, read past it, and find a button. Two intentions, one
 *  door.
 *
 *  So this is the QR alone now (the prototype's own 10688-10697: "what it
 *  shares is the thing it is next to"), and `ProfileLink` below is the share —
 *  one press, the phone's own share sheet, no sheet of ours in between.
 *
 *  ⚠ **AND THE SHEET IS THE CODE AND NOTHING ELSE SINCE 21 Sep 2026**, on the
 *  user's *"qr code button should just open qr not link on all profiles."* It
 *  had kept the printed link and a Copy button — which was the first cut's own
 *  reasoning ("somebody on a laptop still needs the text") and is the same
 *  mistake one step smaller: a sheet reached by pressing a QR, most of which is
 *  not the QR. Copying is `ProfileLink`'s job, it is the chip directly beside
 *  this one, and it falls back to the clipboard on exactly the laptop that
 *  argument was about. ⚠ Nothing became unreachable, which is the test C31 sets. */
export function ProfileShare({ path, name }: { path: string; name: string }) {
  const [open, setOpen] = useState(false);
  const origin = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  useCloseOnBack(() => setOpen(false), open);
  const link = `${origin}${path}`;

  return (
    <>
      <button
        type="button"
        aria-label="QR code"
        onClick={() => setOpen(true)}
        style={PROFILE_CHIP}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 3h8v8H3zM5 5v4h4V5zM13 3h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zM13 13h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z" />
        </svg>
      </button>
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.66)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 950,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Share ${name}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--solid)",
              color: "var(--text)",
              borderRadius: "24px 24px 0 0",
              padding: "16px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              fontFamily: DOS_UI,
              textAlign: "center",
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 14px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{name}</b>
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 16px" }}>
              Point a camera at this to open the profile.
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <QRBlock code={link} size={232} label={`Profile code for ${name}`} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                padding: 13,
                borderRadius: 999,
                background: "var(--card)",
                border: "1.5px solid var(--el)",
                color: "var(--text)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** SHARE — one press, the link goes (21 Sep 2026, the user: *"share to directly
 *  send link of that profile"*).
 *
 *  ⚠ THE PHONE'S OWN SHARE SHEET, NOT ONE OF OURS. `navigator.share` is what
 *  every other app on the device hands a link to — WhatsApp, Messages, Mail,
 *  AirDrop — and it is the whole point of "directly": nothing of ours stands
 *  between the press and the person they are sending it to.
 *
 *  ⚠ AND A DESKTOP BROWSER HAS NO SUCH SHEET, so the fallback is the clipboard
 *  and the chip SAYS so for a moment ("Link copied"). A control that silently
 *  does nothing on half the machines that can press it is the thing this app
 *  keeps refusing to ship — the same reasoning as the students invite. */
export function ProfileLink({ path, name }: { path: string; name: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const origin = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  const link = `${origin}${path}`;

  const send = async () => {
    /* the device's own sheet first; a refusal (or somebody dismissing it) is
       not an error and must not fall through to a second, surprising action */
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, text: `${name} on DanceOS`, url: link });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setSaid("Link copied");
    } catch {
      setSaid("Could not copy the link");
    }
    setTimeout(() => setSaid(null), 1800);
  };

  return (
    <>
      <button type="button" aria-label={`Share ${name}`} onClick={() => void send()} style={PROFILE_CHIP}>
        {/* the share mark every platform draws: a node joined to two others */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="2.6" />
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="19" r="2.6" />
          <path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4" />
        </svg>
      </button>
      {said ? (
        <span role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 650, fontFamily: DOS_UI }}>
          {said}
        </span>
      ) : null}
    </>
  );
}
