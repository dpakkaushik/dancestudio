import { ClassTile } from "@/features/classes/components/ClassTile";
import { FigureHead } from "@/components/ui/FigureHead";
import { TYPE } from "./profile-kit";
import { tileClassOf, type CalendarEntry } from "@/types/calendar";

/** NEXT SESSIONS — the first few classes of a public schedule, on the profile
 *  page whose Schedule bar opens the rest (30 Sep 2026, backlog #0aj).
 *
 *  ⚠⚠ THIS IS THE SMALL HALF OF A QUESTION THAT WAS ASKED THE WRONG WAY, AND
 *  THE CORRECTION IS THE REASON IT IS SHAPED LIKE THIS. The backlog row had
 *  proposed folding the WHOLE public schedule into the profile page — one page
 *  fewer per profile — and the cost was put to the user as *a query*. That was
 *  wrong: a public schedule is `CalendarScreen mode="public"`, **1,085 lines**,
 *  with a `position: sticky` controls block the scroll helper MEASURES and a
 *  `position: fixed` scrim for its date panel. Folding it in nests a whole
 *  second screen inside a page section — a sticky bar stranded half way down a
 *  scroll, and a fixed child inside a transformed ancestor, which is the
 *  stacking-context family this repo has paid for four times (16 Sep, C54,
 *  `PickSheet`, the contact row). **A page-count target is not worth a worse
 *  page**, so what lands is the part that is only an improvement: a taste of
 *  what is behind the bar, and no second screen.
 *
 *  ⚠ NO "See the full schedule ›" OF ITS OWN. The white bar is directly above
 *  it and goes exactly there — a second door to one subject is the shape C31
 *  and C51 each cost a push to undo.
 *
 *  ⚠ THE CARD IS THE APP'S ONE `ClassTile`, off `tileClassOf` — the same
 *  conversion the schedule page itself uses, moved into `types/calendar.ts` the
 *  day this became its second caller, so a class cannot look like a different
 *  class on the page it is linked from.
 *
 *  ⚠ NOTHING IS DRAWN WHEN THERE IS NOTHING. An empty shelf under a heading
 *  reads as a measured zero — "this studio teaches nothing" — where the truth is
 *  "nothing is published for the next three months"; the bar above still opens
 *  the schedule, which has its own honest empty state. */

/** three is a taste, not a list — the bar above is the list */
export const NEXT_SESSIONS_SHOWN = 3;

export function NextSessions({ entries }: { entries: CalendarEntry[] }) {
  const shown = entries.slice(0, NEXT_SESSIONS_SHOWN);
  if (shown.length === 0) return null;

  /* ⚠ THE COUNT IS WHAT IS SHOWN, NEVER WHAT WAS FOUND. "3" over three cards is
     a caption; the studio's whole total over three cards is the number-and-list
     disagreement this app fixed in its follower counts twice, and the schedule
     behind the bar is where a total belongs. */
  return (
    <div style={{ marginTop: 14 }} data-testid="next-sessions">
      <FigureHead
        margin="0 0 8px"
        title={<span style={{ ...TYPE.shelf, color: "var(--text)" }}>Next sessions</span>}
        figure={
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {shown.length}
          </span>
        }
      />
      {shown.map((e) => (
        <ClassTile
          key={e.sessionId}
          danceClass={tileClassOf(e)}
          filled={e.filled}
          artist={e.artist}
          city={e.businessCity}
          href={`/c/${e.shareSlug}`}
        />
      ))}
    </div>
  );
}
