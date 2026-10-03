import type { CSSProperties, ReactNode } from "react";

/** THE TOP OF A TAB, AS A SQUIRCLE (3 Oct 2026, the user: "even top of all home,
 *  discover and inbox to be rounded squircle").
 *
 *  Each of those screens is now two shapes: this one up top on the page's own
 *  theme, and the `InvertedPanel` below it on the opposite one — the same 22px
 *  radius on both, so the page reads as two cards rather than a wash that fades
 *  into a panel. A tab's own colour (Discover's sky, the Inbox's profile tint)
 *  moves INSIDE the squircle as a soft wash instead of bleeding off the screen.
 *
 *  ⚠ NO `overflow: hidden`, on purpose. Discover's search box drops its results
 *  under itself and a clip would cut them off; nothing here needs clipping,
 *  because the posters inside a home's hero already round their own corners and
 *  sit 16px in from the edge. And no z-index, so it is not a stacking context —
 *  the sheets that open from inside it (the enquiry sheet, the filter sheet) are
 *  `position: fixed` and must stay laid out against the screen. */
export function TopPanel({ children, tint, style, testId = "top-panel" }: { children: ReactNode; tint?: string; style?: CSSProperties; testId?: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        position: "relative",
        borderRadius: 22,
        border: "1.5px solid var(--el)",
        background: tint ? `linear-gradient(180deg, ${tint}40 0%, ${tint}14 55%, var(--card) 100%)` : "var(--card)",
        padding: "14px 14px 14px",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
