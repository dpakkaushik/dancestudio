"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";

/** THE INVERTED PANEL — one squircle that reads as the OPPOSITE theme (21 Sep 2026).
 *
 *  The user: *"give the tools section on all profiles like squircle seprator and
 *  make it look opposite according to the dark and light theme"*, then *"give
 *  similar dark and light opposite theme like tools on the discover tab for
 *  section under the followed by you section."*
 *
 *  Two halves, because a panel has to invert for TWO kinds of reader:
 *
 *  · **CSS** — `.dos-invert` in globals.css swaps the whole neutral palette for
 *    this subtree, so `var(--card)`, `var(--el)`, `var(--text)`, `var(--sub)` and
 *    `var(--muted)` all mean the other theme in here. Every component that reads
 *    `lib/design/tokens` is therefore correct inside with no change of its own.
 *    ⚠ That is the part the first cut got wrong: painting `background: var(--text)`
 *    and nothing else works for the tool grid, whose tiles are opaque, and makes a
 *    Discover card invisible — its ground is an alpha veil and its ink is the
 *    page's ink, so both vanish into an inverted panel.
 *
 *  · **JAVASCRIPT** — some components do not read a variable, they read the theme:
 *    `useDosDark` asks the `<html>` class so the class tile can walk a style's
 *    colour toward the ink it will sit on. The html class does not change inside a
 *    panel, so that answer would be for the wrong ground. This context is what
 *    flips it, and `useDosDark` reads it — which means the correction reaches every
 *    such component that is ever put in here, rather than one prop at one call site.
 *
 *  A panel does not nest: the provider says `true` outright rather than toggling,
 *  because a panel inside a panel would read as the page again and there is no
 *  screen that wants that. */
const InvertedGround = createContext(false);

/** Is this subtree drawn on ground that is the opposite of the page's theme?
 *  Read by `useDosDark` — nothing else should need it. */
export const useInvertedGround = (): boolean => useContext(InvertedGround);

export function InvertedPanel({ head, children, style }: { head?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <InvertedGround.Provider value={true}>
      <div className="dos-invert" style={{ borderRadius: 22, padding: "14px 14px 16px", margin: "12px 0", boxSizing: "border-box", ...style }}>
        {head}
        {children}
      </div>
    </InvertedGround.Provider>
  );
}
