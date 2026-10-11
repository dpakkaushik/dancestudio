"use client";

import { createContext, useContext } from "react";
import { INK } from "@/lib/design/tokens";
import type { ViewMode } from "@/features/shell/viewMode";

/** CARD · LIST, ON THE PAGE'S OWN HEADING (12 Oct 2026, the user: "list and card
 *  switcher on top right with the heading of the page not on top bar").
 *
 *  The chrome still OWNS the choice — it knows the pathname, so it knows which
 *  tool a page is, and it stamps `data-dos-view` on `#dos-main` — and hands it
 *  down through this context. The switch is drawn wherever a heading asks for
 *  it (`DeskHero`, and `HeadCorner` beside Answered and the gear), and draws
 *  nothing on a page that is not a tool's list (`mode` is null there). */
export const ViewModeContext = createContext<{ mode: ViewMode | null; pick: (m: ViewMode) => void }>({ mode: null, pick: () => {} });

export function ViewToggle() {
  const { mode, pick } = useContext(ViewModeContext);
  if (!mode) return null;
  return (
    <span role="group" aria-label="View" data-testid="view-toggle" style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 38, padding: 2, borderRadius: 19, boxSizing: "border-box", background: "var(--chip-bg)", border: "1.5px solid var(--chip-line)", flexShrink: 0, position: "relative" }}>
      {(["card", "list"] as const).map((m) => {
        const on = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-label={m === "card" ? "Card view" : "List view"}
            aria-pressed={on}
            data-testid={`view-${m}`}
            onClick={() => pick(m)}
            style={{ width: 30, height: 30, borderRadius: 15, border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? INK : "transparent", color: on ? "var(--solid)" : INK, transition: "background .18s, color .18s" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {m === "card" ? (
                <>
                  <rect x="4" y="4" width="16" height="7" rx="2" />
                  <rect x="4" y="14" width="16" height="7" rx="2" />
                </>
              ) : (
                <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
              )}
            </svg>
          </button>
        );
      })}
    </span>
  );
}
