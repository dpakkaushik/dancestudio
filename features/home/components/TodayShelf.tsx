import { DosShelfHead, HOME_TYPE } from "@/features/home/components/home-kit";
import { PassDeck } from "@/features/home/components/PassDeck";
import { CARD, LINE, SUB } from "@/lib/design/tokens";
import type { DeckItem } from "@/types/home";

/** ⚠ THE HEAD HAS NO DOORS ANY MORE (18 Sep 2026, the user: "remove all blue
 *  buttons besides Todays schedule"). `HEAD_LINK` was the one cyan thing on
 *  either Home — the Manage / All bookings / Classes / Calendar links sitting
 *  beside the heading — and it is deleted rather than recoloured, along with the
 *  `right` prop that had no other caller. What the head said, the tool grid
 *  under it says with a tile of its own: Classes opens the bookings, Events the
 *  desk, Calendar the calendar.
 *
 *  ⚠ AND THE EMPTY DAY'S PILLS WENT THE SAME WAY ON 21 Sep 2026 — `PILL_DARK`
 *  and `PILL_LIGHT` are deleted rather than left exported with no caller, which
 *  is the same lie as a prop no branch renders. The empty card is its heading
 *  and nothing else; the note on it says what that costs. */

/** TODAY, AS THE SCHEDULE IT ACTUALLY IS (prototype 7106-7204, 7500-7520) — the
 *  one shelf every identity page hangs under its hero (14 Sep 2026): the head
 *  with the count, then the deck, or the
 *  empty day with the page's own words and pills. Home asks it a person's
 *  question, a studio's home asks it the studio's; the shelf is the same. The
 *  wrapper runs the full width so the swiped rail, which reaches past the
 *  page's padding, is not clipped. */
export function TodayShelf({ deck }: { deck: DeckItem[] }) {
  return (
    <div data-dosfold="deck" style={{ margin: "10px -16px 14px", padding: "0 16px" }}>
      <DosShelfHead pad="2px 0 8px">
        Today’s schedule
        <span style={{ ...HOME_TYPE.meta, color: SUB, marginLeft: 8 }}>{deck.length} today</span>
      </DosShelfHead>

      {deck.length === 0 ? (
        /* ⚠ THE HEADING AND NOTHING ELSE (21 Sep 2026, the user: "when todays
           schedule blank just shouw card with Heading Nothing On Today's
           Schedule, no bottons below"). The card used to carry a line of the
           page's own words and a row of pills — "See everything you manage",
           "See all bookings", "Find a class" — and they are GONE, along with the
           `emptyTitle` / `emptyBody` / `emptyActions` props, which were three
           different sentences per kind of account for a day with nothing on it.
           ⚠ WHAT IT COSTS, SAID PLAINLY: `/managed` has no tile on any grid
           (C18, 19 Sep) and that pill was Home's ONLY door to it, so it is now
           reachable by its address alone. It goes anyway, and the reason it may
           is that /managed is a VIEW rather than a capability — every class and
           event on it is already reached through the Classes and Events tiles
           and their desks, so nothing becomes impossible, which is the test
           C31's cancel-door lesson sets. The other two pills led to
           /my-classes, the events desk and the studio list, all of which are
           tiles on the grid directly below. */
        <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "18px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>Nothing On Today&rsquo;s Schedule</div>
        </div>
      ) : (
        <PassDeck items={deck} />
      )}
    </div>
  );
}
