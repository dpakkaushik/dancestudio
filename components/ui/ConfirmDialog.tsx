"use client";

import type { ReactNode } from "react";
import { CENTER_CARD, CENTER_SCRIM } from "@/components/ui/centerModal";
import { Portal } from "@/components/ui/Portal";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { SUB } from "@/lib/design/tokens";

/** ARE YOU SURE? — one centred question before something is taken off (4 Oct
 *  2026, the user: "should confirm before deleting a routine … confirm before
 *  removing team member"). The membership delete's own dialog, made shared, so
 *  every removal asks in the same place and the same words.
 *
 *  ⚠ PORTALLED and CENTRED: a routine's question used to be an inline panel under
 *  the card, which on a long page sat below the fold — the press looked like it
 *  did nothing. And a sheet that animates traps a fixed child (the 16 Sep
 *  stacking lesson), so the Team desk's manage sheet could not host it either.
 *  ⚠ System back closes it, like every sheet here (`useCloseOnBack`). */
export function ConfirmDialog({
  title,
  body,
  keepWord = "Keep it",
  goWord,
  busy = false,
  err = null,
  onKeep,
  onGo,
}: {
  /** the question — also the dialog's accessible name */
  title: string;
  body?: ReactNode;
  keepWord?: string;
  goWord: string;
  busy?: boolean;
  err?: string | null;
  onKeep: () => void;
  onGo: () => void;
}) {
  useCloseOnBack(onKeep);
  return (
    <Portal>
      <div onClick={busy ? undefined : onKeep} style={CENTER_SCRIM}>
        <div role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ ...CENTER_CARD, padding: "18px 16px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 900, overflowWrap: "anywhere" }}>{title}</div>
          {body ? <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, margin: "6px 0 0" }}>{body}</div> : null}
          {err ? (
            <div role="alert" style={{ fontSize: 11, color: "#F87171", fontWeight: 700, marginTop: 8 }}>
              {err}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={onKeep}
              disabled={busy}
              autoFocus
              style={{ flex: 1, padding: "11px 12px", borderRadius: 12, background: "var(--el)", border: "none", color: "var(--text)", fontSize: 12.5, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {keepWord}
            </button>
            <button
              type="button"
              onClick={onGo}
              disabled={busy}
              style={{ flex: 1, padding: "11px 12px", borderRadius: 12, background: "#DC2626", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {busy ? "Working…" : goWord}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
