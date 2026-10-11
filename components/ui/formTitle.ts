import type { CSSProperties } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/** THE ONE HEADING EVERY FORM WEARS (12 Oct 2026, the user: "fix all forms
 *  headings are same size and in same way. no subheading in forms for things
 *  should be clean").
 *
 *  Before today a form's heading was 16, 16.5, 17 or 21px, in the display face
 *  or the UI face, at weight 800 or 900 — one per author. And most of them had
 *  a grey line under them restating what the heading or the fields already say.
 *  So: one size, one face, one weight, and NOTHING under it — the fields start
 *  directly after it.
 *
 *  ⚠ A plain module, not a `"use client"` one: a value exported from a client
 *  file is a client REFERENCE on the server (the 11 Oct `isClassAsk` lesson), and
 *  both kinds of component import this. */
export const FORM_TITLE: CSSProperties = {
  display: "block",
  margin: 0,
  fontSize: 19,
  fontWeight: 800,
  fontFamily: DOS_DISPLAY,
  letterSpacing: -0.4,
  lineHeight: 1.2,
  color: "var(--text)",
  overflowWrap: "anywhere",
};
