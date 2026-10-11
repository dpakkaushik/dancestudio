"use client";

import { useState, useSyncExternalStore } from "react";
import { Portal } from "@/components/ui/Portal";
import { DOS_DISPLAY, INK, LINE, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

/** SYNC THE WHOLE CALENDAR (12 Oct 2026, the user: "add to calendar not on
 *  individual class cards but the entire calendar sync from the calendar
 *  page"). One chip beside the Calendar heading opens a sheet with a FEED —
 *  subscribed once in Google, Apple or Outlook, it keeps itself up to date, so
 *  a class booked tomorrow appears there without anybody pressing anything.
 *  The URL carries its own key (`lib/calendar/feedToken.ts`), so it is said in
 *  the sheet that it is private. */

const noop = () => () => {};
const readOrigin = () => window.location.origin;
const noOrigin = () => "";

export function CalendarSync({ feedPath }: { feedPath: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, readOrigin, noOrigin);
  useCloseOnBack(() => setOpen(false), open);

  const https = `${origin}${feedPath}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14,
    background: "var(--card)", border: `1.5px solid ${LINE}`, color: INK,
    fontSize: 14, fontWeight: 800, textDecoration: "none", cursor: "pointer", textAlign: "left",
  };

  return (
    <>
      <button
        type="button"
        data-testid="calendar-sync"
        aria-label="Sync your calendar"
        onClick={() => setOpen(true)}
        style={{
          height: 38, padding: "0 13px", borderRadius: 999, border: "1.5px solid var(--chip-line)",
          background: "var(--chip-bg)", color: "var(--text)", fontSize: 12.5, fontWeight: 800,
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
          <path d="M21 4v5h-5M3 20v-5h5" />
        </svg>
        Sync
      </button>
      {open ? (
        <Portal>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 960, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end" }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Sync your calendar"
              data-testid="calendar-sync-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 520, margin: "0 auto", background: "var(--solid)", color: INK,
                borderRadius: "24px 24px 0 0", padding: "10px 16px calc(18px + env(safe-area-inset-bottom))",
                animation: "dosSheetUp .22s ease-out", boxSizing: "border-box", display: "grid", gap: 9,
              }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 4, background: LINE, margin: "0 auto 6px" }} />
              <div style={{ fontFamily: DOS_DISPLAY, fontSize: 19, fontWeight: 800 }}>Sync your calendar</div>
              <a href={google} target="_blank" rel="noreferrer" style={row} data-testid="sync-google">
                Add to Google Calendar <span aria-hidden>›</span>
              </a>
              <a href={webcal} style={row} data-testid="sync-webcal">
                Add to Apple or Outlook <span aria-hidden>›</span>
              </a>
              <button type="button" onClick={copy} style={row} data-testid="sync-copy">
                {copied ? "Link copied ✓" : "Copy the feed link"} <span aria-hidden>⧉</span>
              </button>
              <a href={https} download="danceos.ics" style={row} data-testid="sync-download">
                Download once (.ics) <span aria-hidden>↓</span>
              </a>
              <div style={{ fontSize: 12, color: SUB, lineHeight: 1.45 }}>
                Updates on its own. The link is private to you.
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}
