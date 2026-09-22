import type { CSSProperties, ReactNode } from "react";

/** A SECTION HEADING AND THE FIGURE THAT BELONGS TO IT, WITH A RULE BETWEEN THEM
 *  (22 Sep 2026, the user: *"for all column on any page in home tab for any
 *  profile there should be a sprator between title and figure"*).
 *
 *  Every one of these was `marginLeft: auto` or a "·" — the figure pushed to the
 *  right edge by empty space, so on a short heading the two read as two unrelated
 *  things and on a long one they nearly touched. A rule FILLS that gap, which is
 *  what makes the number belong to the heading it trails.
 *
 *  ⚠ THE LAYOUT IS SHARED AND THE TYPE IS NOT, deliberately. These heads are
 *  legitimately different sizes — a 17px shelf head on Home, 9.5px micro-caps on
 *  a money desk, 13px on a roster — and forcing one scale would be the 16 Sep
 *  mistake in reverse (a second label tier shipped over two blocks out of five
 *  and read as randomness because it was randomness). So a caller passes nodes it
 *  has already styled, and what is written down ONCE is the thing the user
 *  actually asked for: the rule, its weight, and the gap either side of it.
 *
 *  ⚠ `aria-hidden` on the rule, and the gap either side is the 8 these rows
 *  already had: a screen reader hears "Teach 3" exactly as before, because a line
 *  is a drawing and not a word. 1.5px is the app's own outline weight since C43.
 *
 *  ⚠ AND THE RULE IS NOT DRAWN WITHOUT A FIGURE. A separator with nothing after
 *  it is a line that trails off — the ask names two things and a rule between
 *  them, so a heading that carries no figure is just a heading. */
export function FigureHead({
  title,
  figure,
  after,
  margin,
  padding,
  align = "baseline",
}: {
  /** already styled by the caller — this component owns the rule, not the type */
  title: ReactNode;
  /** a count, a money total, anything. Null draws no rule. */
  figure?: ReactNode;
  /** anything that rides AFTER the figure (a badge, a chevron) */
  after?: ReactNode;
  margin?: string;
  /** a shelf head is inset by padding rather than margin, so it takes both */
  padding?: string;
  /** "baseline" for text against text; "center" where the title is a chip or a dot */
  align?: CSSProperties["alignItems"];
}) {
  return (
    <div style={{ display: "flex", alignItems: align, gap: 8, margin, padding }}>
      {title}
      {figure == null ? null : (
        <>
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              height: 1.5,
              minWidth: 12,
              background: "var(--el)",
              borderRadius: 1,
              /* baseline alignment would sit the rule ON the text's baseline, so
                 it is lifted to the optical middle of the line it runs along */
              transform: align === "baseline" ? "translateY(-3px)" : undefined,
            }}
          />
          {figure}
        </>
      )}
      {after}
    </div>
  );
}
