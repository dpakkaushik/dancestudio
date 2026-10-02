import type { CSSProperties } from "react";

/** A CARD IN THE MIDDLE OF THE SCREEN (2 Oct 2026, the user: "qr code and scan
 *  should always come on centre of the screen right now coming from bottom").
 *  A QR is something you hold UP to somebody's camera and a scanner is a
 *  viewfinder — both read as an object in the middle, not as a sheet of
 *  controls. Every QR and the scanner share these two, so they cannot drift. */
export const CENTER_SCRIM: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.66)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  boxSizing: "border-box",
  zIndex: 950,
};

export const CENTER_CARD: CSSProperties = {
  background: "var(--solid)",
  color: "var(--text)",
  borderRadius: 24,
  padding: "18px 16px 18px",
  width: "100%",
  maxWidth: 380,
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  boxSizing: "border-box",
  boxShadow: "0 24px 64px rgba(0,0,0,.5)",
  animation: "dosPopIn .2s cubic-bezier(.22,.9,.34,1)",
};
