"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_DISPLAY, DOS_UI, PINK } from "@/lib/design/tokens";

/** Enter/Space activate a role="button" span — the prototype's dosKey. */
export const dosKey = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
};

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* the page's own host, read the sanctioned way (no impure render access) */
const subscribeNever = () => () => {};
const readHost = () => window.location.host;
const readServerHost = () => "";

/** ShareSheet — the booking link people hand out after publishing. One sheet, one
 *  job: the link, and a way to copy it (prototype DanceOSApp.jsx:3980-4005). The
 *  prototype prints danceos.in/c/{slug}; here the link is this deployment's own
 *  /c/{slug}. Backdrop/dialog roles follow the repo's a11y-corrected sheet pattern. */
export function ShareSheet({
  title,
  slug,
  fire,
  onClose,
}: {
  title: string;
  slug: string;
  fire?: (msg: string) => void;
  onClose: () => void;
}) {
  useCloseOnBack(onClose);
  const host = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  const link = `${host}/c/${slug}`;
  const [done, setDone] = useState(false);
  const copy = () => {
    const full = `${window.location.protocol}//${window.location.host}/c/${slug}`;
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full);
    } catch {
      /* clipboard blocked — the link is still on screen to copy by hand */
    }
    setDone(true);
    fire?.("Link copied");
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <div
      onClick={onClose}
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
        aria-label="Share booking link"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--solid)",
          color: "var(--text)",
          borderRadius: "24px 24px 0 0",
          padding: "16px 16px 26px",
          width: "100%",
          maxWidth: 430,
          boxSizing: "border-box",
          fontFamily: DOS_UI,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>Share booking link</b>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--sub)",
            margin: "3px 0 13px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={copy}
          aria-label="Copy the booking link"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--card)",
            border: "1px solid var(--el)",
            borderRadius: 14,
            padding: "13px 13px",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: DOS_MONO,
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {link}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: done ? "#22C55E" : PINK, flexShrink: 0 }}>
            {done ? "Copied ✓" : "Copy"}
          </span>
        </div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={onClose}
          style={{
            marginTop: 10,
            textAlign: "center",
            padding: "12px",
            borderRadius: 999,
            background: "var(--card)",
            border: "1px solid var(--el)",
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Done
        </div>
      </div>
    </div>
  );
}
