"use client";

import { useState, useSyncExternalStore } from "react";
import { QRBlock } from "@/components/ui/QRBlock";
import { DOS_DISPLAY, DOS_UI, PINK } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

/* the page's own host, read the sanctioned way (no impure render access) */
const subscribeNever = () => () => {};
const readHost = () => `${window.location.protocol}//${window.location.host}`;
const readServerHost = () => "";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** The QR beside the name (prototype 10688-10697): "what it shares is the thing
 *  it is next to". Opens the app's one share sheet shape — the drawn code, the
 *  link, a way to copy it. */
export function ProfileShare({ path, name }: { path: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const origin = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  useCloseOnBack(() => setOpen(false), open);
  const link = `${origin}${path}`;

  const copy = () => {
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link);
    } catch {
      /* clipboard blocked — the link is still on screen */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Share this profile — QR code"
        onClick={() => setOpen(true)}
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 19,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: "var(--text)",
          color: "var(--solid)",
          border: "none",
          boxShadow: "0 4px 14px -6px rgba(0,0,0,.6)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 14px" }}>
              Scan to open this profile, or pass the link on.
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <QRBlock code={link} size={168} label={`Profile code for ${name}`} />
            </div>
            <div
              style={{
                fontFamily: DOS_MONO,
                fontSize: 12,
                background: "var(--card)",
                border: "1px solid var(--el)",
                borderRadius: 12,
                padding: "10px 12px",
                wordBreak: "break-all",
                marginBottom: 12,
              }}
            >
              {link.replace(/^https?:\/\//, "")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={copy}
                style={{
                  flex: 1.4,
                  padding: 13,
                  borderRadius: 999,
                  background: done ? "#22C55E" : PINK,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 13.5,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {done ? "Copied ✓" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  padding: 13,
                  borderRadius: 999,
                  background: "var(--card)",
                  border: "1px solid var(--el)",
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
        </div>
      ) : null}
    </>
  );
}
