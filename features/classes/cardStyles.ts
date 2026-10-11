import type { CSSProperties } from "react";

/** THE CLASS CARD'S BUTTON PAINT, in a PLAIN module (11 Oct 2026). It lived in
 *  `ClassCardActions.tsx`, which is "use client" — and a value exported from a
 *  client module is a client REFERENCE on the server, so a server page calling
 *  `cardBtn()` would throw the moment the branch ran (the 26 Sep
 *  `orgStandingWords` lesson, and `isClassAsk` on 11 Oct). Both the client
 *  buttons and the server-built cards read it from here. */
export const cardBtn = (primary: boolean): CSSProperties => ({
  flex: "1 1 0",
  minWidth: 0,
  textAlign: "center",
  padding: "11px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  fontFamily: "inherit",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  border: primary ? "none" : "1.5px solid var(--el)",
  /* `--text` on `--solid`, never `--bg`: a card can sit inside an inverted panel */
  background: primary ? "var(--text)" : "var(--card)",
  color: primary ? "var(--solid)" : "var(--text)",
});
