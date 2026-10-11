import type { CSSProperties } from "react";

/** ⚠⚠ ONE LOOK FOR EVERY ROW OF COLUMNS (11 Oct 2026, the user: "use same columns
 *  style use for to do past and upcoming for all other columns on home tab pages
 *  inside"). The Classes screen's To do · Upcoming · Past is the pattern: a round
 *  track in `--el`, the chosen column a solid pill in ink, and the count as a
 *  small badge inside it. Every desk's columns (`SegmentedPanels`), Earnings'
 *  period, the Upcoming · Completed pair and the Artist · Studio · Dance style
 *  groupings read these, so the rows cannot drift apart again.
 *
 *  Styles, not a component: the callers are a `<Link>`, an `<a>` and a `<button>`,
 *  and each keeps its own element and accessible name. */

/** the track the columns sit in */
export const columnTrack = (wrap = false): CSSProperties => ({
  display: "flex",
  gap: 4,
  padding: 4,
  borderRadius: wrap ? 22 : 999,
  background: "var(--el)",
  ...(wrap ? { flexWrap: "wrap", rowGap: 4 } : null),
});

/** one column — solid when it is the one shown. More than four wrap 3 + 2. */
export const columnTab = (on: boolean, wrap = false): CSSProperties => ({
  flex: wrap ? "1 0 30%" : "1 1 0",
  minWidth: 0,
  padding: "9px 4px",
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  background: on ? "var(--text)" : "transparent",
  color: on ? "var(--solid)" : "var(--text)",
});

/** the count inside a column — amber when it is waiting on you */
export function ColumnCount({ n, on, attention = false }: { n: number; on: boolean; attention?: boolean }) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 900,
        minWidth: 18,
        padding: "1px 6px",
        borderRadius: 999,
        fontVariantNumeric: "tabular-nums",
        background: attention ? "#F59E0B" : on ? "var(--solid)" : "var(--card)",
        color: attention ? "#1a1406" : on ? "var(--text)" : "var(--sub)",
      }}
    >
      {n}
    </span>
  );
}
