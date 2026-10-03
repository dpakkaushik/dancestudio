import type { CSSProperties, ReactNode } from "react";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { TopPanel } from "@/components/ui/TopPanel";

/** EVERY TOOL PAGE IN SECTIONS (3 Oct 2026, the user: "how you segregated
 *  sections in discover inbox and home now do that for all pages inside the home
 *  tools for all profiles").
 *
 *  The same three shapes Discover and the Inbox stand on, written once so no tool
 *  page can drift from the others:
 *
 *  · `DeskTop` — the TOP squircle: the tool's heading (its `DeskHero`) and the
 *    controls that choose WHAT is shown — segments, sides, period chips, a room
 *    picker, the primary add button.
 *  · `DeskMiddle` — optional: the figures that SUMMARISE what is shown (stat
 *    tiles, a money card, a chart, a pipeline). Only where a page has them.
 *  · `DeskBody` — the LOWER squircle: the list or the content itself.
 *
 *  All three are on the PAGE's own theme (the opposite-theme panel came off on
 *  the same day — C115), the same 22px radius, the card veil and the 1.5px
 *  outline. ⚠ None is a stacking context and none clips, so a `position: fixed`
 *  sheet opened from inside still lays out against the screen, and a `sticky`
 *  block placed inside `DeskBody` sticks for the whole of the list. */

export function DeskTop({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <TopPanel testId="desk-top" style={{ margin: "12px 0 12px", ...style }}>
      {children}
    </TopPanel>
  );
}

export function DeskMiddle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <TopPanel testId="desk-middle" style={{ margin: "0 0 12px", ...style }}>
      {children}
    </TopPanel>
  );
}

export function DeskBody({ children, head, style }: { children: ReactNode; head?: ReactNode; style?: CSSProperties }) {
  return (
    <InvertedPanel ground="page" testId="desk-body" head={head} style={{ margin: "0 0 16px", ...style }}>
      {children}
    </InvertedPanel>
  );
}
