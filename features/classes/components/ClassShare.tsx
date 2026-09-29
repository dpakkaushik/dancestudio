"use client";

import { useState } from "react";

import { QRBlock } from "@/components/ui/QRBlock";
import { PINK } from "@/lib/design/tokens";
import { dosKey } from "./ShareSheet";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** SHARING IS PART OF THE DETAILS (29 Sep 2026, the user: "share should be part
 *  of the details with qr code with link and option to copy the link as well
 *  for the class").
 *
 *  It was behind the poster from 24 Aug — the poster opened a ticket that
 *  carried the art, an entry code AND the booking link, which is why pressing
 *  the poster did not show the poster. Here it is a block like every other
 *  block on the page: the code somebody points a camera at, the address in
 *  words for anybody reading over a shoulder, and one press to copy.
 *
 *  ⚠ THE QR AND THE COPY ENCODE THE SAME THING. The square is built from the
 *  link this component is handed and `copy` writes that same string, so the two
 *  cannot drift into pointing at different classes — which is the whole reason
 *  the link is a prop rather than rebuilt on each press.
 *
 *  ⚠ AND THE SQUARE IS 148px BECAUSE A SMALLER ONE WOULD NOT SCAN. A `/c/{slug}`
 *  link is a version-3 or -4 code — about 37 to 41 modules once the quiet zone
 *  is counted — so under ~125px it falls below the three pixels a module a phone
 *  camera needs, and `QRBlock` would mark itself `data-qr-scannable="small"`.
 *  The one thing this block exists for is somebody holding a camera up to it. */
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
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", lineHeight: 0 }}>
        <QRBlock code={link} size={148} label={`Booking link for ${title}`} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 9 }}>
        Anyone who opens this can book a spot.
      </div>
      <div
        style={{
          fontFamily: DOS_MONO,
          fontSize: 11,
          color: "var(--text)",
          marginTop: 7,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {shown}
      </div>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={dosKey}
        onClick={copy}
        aria-label="Copy the booking link"
        style={{
          marginTop: 11,
          textAlign: "center",
          padding: "11px",
          borderRadius: 999,
          background: "var(--solid)",
          border: "1.5px solid var(--el)",
          fontWeight: 800,
          fontSize: 12,
          color: done ? "#22C55E" : PINK,
          cursor: "pointer",
        }}
      >
        {done ? "Copied ✓" : "Copy link"}
      </div>
    </div>
  );
}
