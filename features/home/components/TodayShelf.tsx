import type { CSSProperties, ReactNode } from "react";
import { DosShelfHead, HOME_TYPE } from "@/features/home/components/home-kit";
import { PassDeck } from "@/features/home/components/PassDeck";
import { CARD, INK, LINE, SOLID, SUB } from "@/lib/design/tokens";
import type { DeckItem } from "@/types/home";

/** ⚠ THE HEAD HAS NO DOORS ANY MORE (18 Sep 2026, the user: "remove all blue
 *  buttons besides Todays schedule"). `HEAD_LINK` was the one cyan thing on
 *  either Home — the Manage / All bookings / Classes / Calendar links sitting
 *  beside the heading — and it is deleted rather than recoloured, along with the
 *  `right` prop that had no other caller. What the head said, the tool grid
 *  under it says with a tile of its own: Classes opens the bookings, Events the
 *  desk, Calendar the calendar. ⚠ The one destination NOT on any grid is
 *  `/managed`, which now reaches Home only through the empty day's pill below.
 *
 *  The two pills the empty day offers are NOT blue and stay (7176-7181). */
export const PILL_DARK: CSSProperties = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: INK, color: SOLID, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none" };
export const PILL_LIGHT: CSSProperties = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, fontWeight: 900, fontSize: 11.5, cursor: "pointer", color: INK, textDecoration: "none" };

/** TODAY, AS THE SCHEDULE IT ACTUALLY IS (prototype 7106-7204, 7500-7520) — the
 *  one shelf every identity page hangs under its hero (14 Sep 2026): the head
 *  with the count, then the deck, or the
 *  empty day with the page's own words and pills. Home asks it a person's
 *  question, a studio's home asks it the studio's; the shelf is the same. The
 *  wrapper runs the full width so the swiped rail, which reaches past the
 *  page's padding, is not clipped. */
export function TodayShelf({
  deck,
  emptyTitle,
  emptyBody,
  emptyActions,
}: {
  deck: DeckItem[];
  emptyTitle: string;
  emptyBody: string;
  /** the pills under the empty day — links in PILL_DARK / PILL_LIGHT */
  emptyActions: ReactNode;
}) {
  return (
    <div data-dosfold="deck" style={{ margin: "10px -16px 14px", padding: "0 16px" }}>
      <DosShelfHead pad="2px 0 8px">
        Today’s schedule
        <span style={{ ...HOME_TYPE.meta, color: SUB, marginLeft: 8 }}>{deck.length} today</span>
      </DosShelfHead>

      {deck.length === 0 ? (
        <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{emptyTitle}</div>
          <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>{emptyBody}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>{emptyActions}</div>
        </div>
      ) : (
        <PassDeck items={deck} />
      )}
    </div>
  );
}
