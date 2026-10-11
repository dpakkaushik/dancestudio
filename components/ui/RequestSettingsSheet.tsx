"use client";

import type { CSSProperties, ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_UI, MUTED, SUB } from "@/lib/design/tokens";

/** ⚠⚠ ONE HEAD, ONE SETTINGS SHEET, ONE ANSWERED SHEET (11 Oct 2026, the user:
 *  "check alignment of settings on headings for crew, studio" and "settings
 *  sections for classes and crew, studio and team can be better").
 *
 *  Classes drew its Answered button and its gear in the hero's top right; the
 *  Studios and Crews hubs drew a gear of their own two pixels off, and each
 *  screen carried its own copy of the sheet. They are one set of parts now:
 *
 *   · `HeadCorner` — the hero's top right, `top: 10, right: 10`, the buttons in a
 *     row 8px apart. The hero it sits on must be `position: relative`.
 *   · `AnsweredButton` / `GearButton` — the two 38px round buttons, the count
 *     badge on Answered whenever there is something in it.
 *   · `RequestSettingsSheet` — a title, ONE short line, then a `SettingRow` per
 *     switch (an icon, the label, one line saying what it governs, the switch),
 *     then Done.
 *   · `AnsweredSheet` — the answered cards, scrolling, with an honest empty line.
 *
 *  ⚠ A `SettingRow` IS `role="switch"` WITH THE LABEL AS ITS ACCESSIBLE NAME,
 *  exactly as the `Switch` it replaces in these sheets — so "Taking requests",
 *  "Team invites" and "Crew invites" are still found by the names they had. */

export const HEAD_BTN: CSSProperties = {
  position: "relative",
  width: 38,
  height: 38,
  borderRadius: 19,
  border: "none",
  background: "rgba(255,255,255,.22)",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

/** the hero's top-right corner — the same place on every screen that has one */
export function HeadCorner({ children }: { children: ReactNode }) {
  return <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 8, zIndex: 1 }}>{children}</div>;
}

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/** a speech bubble with a tick — what has had its answer */
const AnsweredIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8.5 10.5l2.2 2.2 4.8-4.8" />
  </svg>
);

/** Answered — drawn whatever the count, so it is always where it was last time */
export function AnsweredButton({ count, testId, label, onClick }: { count: number; testId: string; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={`${label} (${count})`} data-testid={testId} onClick={onClick} style={HEAD_BTN}>
      <AnsweredIcon />
      {count > 0 ? (
        <span style={{ position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, padding: "0 4px", boxSizing: "border-box", borderRadius: 999, background: "#fff", color: "#111", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function GearButton({ testId, label = "Request settings", onClick }: { testId: string; label?: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} data-testid={testId} onClick={onClick} style={HEAD_BTN}>
      <GearIcon />
    </button>
  );
}

/** the bottom sheet both uses wear — portalled, back closes it, Done at the foot */
export function BottomSheet({ title, onClose, children, scroll = false }: { title: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  useCloseOnBack(onClose);
  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 640 }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "14px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .22s ease-out", ...(scroll ? { maxHeight: "88vh", display: "flex", flexDirection: "column" as const } : {}) }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px", flexShrink: 0 }} />
          <div style={{ fontSize: 17, fontWeight: 900, fontFamily: DOS_UI, flexShrink: 0 }}>{title}</div>
          {scroll ? <div style={{ overflowY: "auto", margin: "10px -4px 0", padding: "0 4px", minHeight: 0 }}>{children}</div> : children}
          <button type="button" onClick={onClose} style={{ marginTop: 16, width: "100%", padding: 12, borderRadius: 999, border: "none", background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            Done
          </button>
        </div>
      </div>
    </Portal>
  );
}

/** THE REQUEST SETTINGS — a title, one line, a row per switch */
export function RequestSettingsSheet({ title, line = "Off turns new asks away.", onClose, children }: { title: string; line?: string; onClose: () => void; children: ReactNode }) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div style={{ fontSize: 12, color: SUB, marginTop: 3, lineHeight: 1.45 }}>{line}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </BottomSheet>
  );
}

/* the small marks a row wears — one stroke family */
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const SETTING_ICONS = {
  class: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  room: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <path d="M5 21V4.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V21M3 21h18" />
      <circle cx="15" cy="12.5" r="1" />
    </svg>
  ),
  team: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 20c.6-3.4 2.9-5.2 6-5.2s5.4 1.8 6 5.2" />
      <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.2 14.9c2 .6 3.3 2.3 3.8 5.1" />
    </svg>
  ),
  crew: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <circle cx="12" cy="6.5" r="2.6" />
      <circle cx="5.5" cy="10" r="2.1" />
      <circle cx="18.5" cy="10" r="2.1" />
      <path d="M7.6 20c.4-3.3 2.1-5.3 4.4-5.3s4 2 4.4 5.3M2.5 18c.3-2 1.4-3.3 3-3.5M21.5 18c-.3-2-1.4-3.3-3-3.5" />
    </svg>
  ),
} as const;

/** one switch: its mark, its label, one line saying what it governs, the switch.
 *  ⚠ `readOnly` draws the state without the control, for a seat that may not
 *  change it (a studio's room requests are the owner's). */
export function SettingRow({
  icon,
  tint = "#0EA5E9",
  label,
  note,
  on,
  onClick,
  busy = false,
  readOnly = null,
  testId,
}: {
  icon: ReactNode;
  tint?: string;
  label: string;
  note: string;
  on: boolean;
  onClick: () => void;
  busy?: boolean;
  /** a sentence in place of the switch, when this seat may not flip it */
  readOnly?: string | null;
  testId?: string;
}) {
  const face = (
    <>
      <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${tint}1f`, color: tint }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: readOnly ? SUB : MUTED, marginTop: 2, lineHeight: 1.35 }}>{readOnly ?? note}</span>
      </span>
    </>
  );
  const box: CSSProperties = { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)", boxSizing: "border-box", fontFamily: "inherit", color: "var(--text)", textAlign: "left" };
  if (readOnly) {
    return (
      <div data-testid={testId} style={box}>
        {face}
      </div>
    );
  }
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={testId} onClick={onClick} disabled={busy} style={{ ...box, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
      {face}
      <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: on ? "#22C55E" : "var(--el)", position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
      </span>
    </button>
  );
}

/** the answered things, scrolling, with an honest empty line */
export function AnsweredSheet({ title = "Answered", count, listTestId, onClose, children }: { title?: string; count: number; listTestId: string; onClose: () => void; children: ReactNode }) {
  return (
    <BottomSheet title={`${title} · ${count}`} onClose={onClose} scroll>
      <div data-testid={listTestId}>{count === 0 ? <div style={{ fontSize: 13, color: SUB, padding: "18px 2px" }}>Nothing answered yet.</div> : children}</div>
    </BottomSheet>
  );
}
