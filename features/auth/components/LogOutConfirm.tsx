"use client";

import { useEffect, useRef } from "react";
import { Portal } from "@/components/ui/Portal";
import { CENTER_CARD, CENTER_SCRIM } from "@/components/ui/centerModal";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { RED } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

/** ARE YOU SURE? (3 Oct 2026, the user: "should not log out without
 *  confirmation"). Log out sat as the last row of the profile switcher — a menu
 *  you open to change PROFILE, on a chip at the screen's right edge where a
 *  thumb lands by accident — and one press ended the session on the spot. Now
 *  that press asks, in the middle of the screen, and only "Log out" in here
 *  submits `signOutAction`.
 *
 *  Mounted only while open (so `useCloseOnBack` is the hook's documented
 *  conditional-mount shape): system back, the scrim, Escape and Cancel all
 *  close it, and Cancel takes focus first, because the safe answer is the
 *  default one. */
export function LogOutConfirm({ onClose, word = "Log out" }: { onClose: () => void; word?: string }) {
  useCloseOnBack(onClose);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const btn: React.CSSProperties = { flex: 1, padding: "12px 10px", borderRadius: 999, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" };
  return (
    <Portal>
      <div onClick={onClose} style={{ ...CENTER_SCRIM, zIndex: 960 }}>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dos-logout-title"
          aria-describedby="dos-logout-sub"
          onClick={(e) => e.stopPropagation()}
          style={{ ...CENTER_CARD, maxWidth: 320, textAlign: "center", padding: "22px 18px 18px" }}
        >
          <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 15, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${RED}1f` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 17l5-5-5-5M20 12H9M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
            </svg>
          </span>
          <div id="dos-logout-title" style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.3 }}>
            {word} of DanceOS?
          </div>
          <div id="dos-logout-sub" style={{ fontSize: 12, color: "var(--sub)", marginTop: 6, lineHeight: 1.45 }}>
            You will need your email and password to sign back in.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button ref={cancelRef} type="button" onClick={onClose} style={{ ...btn, background: "var(--el)", color: "var(--text)", border: "none" }}>
              Cancel
            </button>
            <form action={signOutAction} style={{ flex: 1, display: "flex" }}>
              <button type="submit" style={{ ...btn, background: RED, color: "#fff", border: "none" }}>
                {word}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Portal>
  );
}
