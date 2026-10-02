"use client";

import { useState } from "react";

import { QRBlock } from "@/components/ui/QRBlock";
import { SKY } from "@/lib/design/tokens";
import { qrMatrix } from "@/lib/qr/encode";
import { dosKey } from "./ShareSheet";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** `QRBlock`'s own floor: three screen pixels a module, quiet zone included */
const PX_PER_MODULE = 3;
const QUIET = 4;

/** the smallest square this link can be drawn at and still scan (3 Oct 2026) */
function scannableSize(link: string): number {
  try {
    return Math.ceil((qrMatrix(link).size + QUIET * 2) * PX_PER_MODULE);
  } catch {
    return 124;
  }
}

/** SHARING IS PART OF THE DETAILS (29 Sep 2026, the user: "share should be part
 *  of the details with qr code with link and option to copy the link as well
 *  for the class").
 *
 *  It was behind the poster from 24 Aug — the poster opened a ticket that
 *  carried the art, an entry code AND the booking link, which is why pressing
 *  the poster did not show the poster. Here it is a block like every other
 *  block on the page: the code somebody points a camera at, the address in
 *  words for anybody reading over a shoulder, and two presses — copy it, or
 *  send it.
 *
 *  ⚠ A SHARE BUTTON BESIDE COPY LINK, AND A SMALLER CODE (3 Oct 2026, the user:
 *  "share button in class detail with copy link. smaller qr code in that
 *  section"). Share is the phone's own sheet (`navigator.share` — WhatsApp,
 *  Messages, Mail), the same as a profile's Share chip; a desktop browser has no
 *  such sheet, so it copies and says so rather than doing nothing.
 *
 *  ⚠ THE CODE IS DRAWN AT THE SMALLEST SIZE THAT STILL SCANS, computed from the
 *  link it encodes rather than typed — a live `/c/{slug}` is a version-4 code,
 *  41 modules with the quiet zone, so ~123px where it was a fixed 148. Any
 *  smaller and `QRBlock` would mark itself `data-qr-scannable="small"`, and the
 *  one thing this square exists for is a camera. It sits BESIDE the address and
 *  the two buttons now rather than above them, which is what makes the block
 *  compact.
 *
 *  ⚠ THE QR, THE COPY AND THE SHARE ENCODE THE SAME THING — the one `link` prop
 *  — so none of them can drift into pointing at a different class. */
export function ClassShare({
  link,
  title,
  fire,
}: {
  /** the full public address of this class — `{protocol}//{host}/c/{slug}` */
  link: string;
  title: string;
  fire?: (msg: string) => void;
}) {
  const [done, setDone] = useState(false);
  /* what a person reads is the address without its scheme — the scheme is
     noise on a phone, and the thing copied is still the whole URL */
  const shown = link.replace(/^https?:\/\//, "");
  const size = scannableSize(link);

  const copy = () => {
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
    setDone(true);
    fire?.("🔗 Link copied");
    setTimeout(() => setDone(false), 1800);
  };

  const share = async () => {
    /* the device's own sheet first; somebody dismissing it is not an error and
       must not fall through to a second, surprising action */
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: `${title} on DanceOS — book a spot`, url: link });
      } catch {
        /* dismissed */
      }
      return;
    }
    copy();
  };

  const btn = (active: boolean): React.CSSProperties => ({
    textAlign: "center",
    padding: "9px 10px",
    borderRadius: 999,
    background: "var(--solid)",
    border: "1.5px solid var(--el)",
    fontWeight: 800,
    fontSize: 12,
    color: active ? "#22C55E" : SKY,
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
      <div style={{ lineHeight: 0, flexShrink: 0 }}>
        <QRBlock code={link} size={size} label={`Booking link for ${title}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 10.5, color: "var(--sub)", lineHeight: 1.35 }}>Anyone who opens this can book a spot.</div>
        <div
          title={link}
          style={{
            fontFamily: DOS_MONO,
            fontSize: 11,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shown}
        </div>
        <div role="button" tabIndex={0} onKeyDown={dosKey} onClick={copy} aria-label="Copy the booking link" style={btn(done)}>
          {done ? "Copied ✓" : "Copy link"}
        </div>
        <div role="button" tabIndex={0} onKeyDown={dosKey} onClick={() => void share()} aria-label="Share the booking link" style={btn(false)}>
          {/* the share mark every platform draws: a node joined to two others */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="2.6" />
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="18" cy="19" r="2.6" />
            <path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4" />
          </svg>
          Share
        </div>
      </div>
    </div>
  );
}
