"use client";

import { useState } from "react";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import type { ClassBookingStatus } from "@/types/classBooking";
import { FigureHead } from "@/components/ui/FigureHead";
import { LINE, SKY } from "@/lib/design/tokens";
import { TYPE } from "./profile-kit";
import { nextSessionsOf, tileClassOf, type CalendarEntry } from "@/types/calendar";

/** NEXT SESSIONS — the first few classes of a public schedule, on the profile
 *  page whose Schedule bar opens the rest (30 Sep 2026, backlog #0aj).
 *
 *  ⚠⚠ A RAIL, NOT A STACK (5 Oct 2026, the user: "Next Session - classes should
 *  slide left to right and upto 5 classes only on a profile"). Five full-width
 *  cards stacked would push everything under them off the screen, so they are
 *  Home's deck: one swiped row of 88%-width cards snapped to centre, the next one
 *  peeking so the row reads as swipeable, and dots under it saying where you are.
 *
 *  ⚠⚠ THIS IS THE SMALL HALF OF A QUESTION THAT WAS ASKED THE WRONG WAY. The
 *  backlog row had proposed folding the WHOLE public schedule into the profile
 *  page; a public schedule is `CalendarScreen mode="public"`, with a sticky
 *  controls block and a fixed scrim, and nesting it in a page section is the
 *  stacking-context family this repo has paid for four times. So what lands is a
 *  taste of what is behind the bar, and no second screen.
 *
 *  ⚠ NO "See the full schedule ›" OF ITS OWN — the white bar directly above goes
 *  exactly there, and a second door to one subject is what C31 and C51 undid.
 *
 *  ⚠ THE CARD IS THE APP'S ONE `ClassTile`, off `tileClassOf` — the conversion
 *  the schedule page uses — so a class cannot look different on the page it is
 *  linked from.
 *
 *  ⚠ SOONEST FIRST, SORTED HERE (5 Oct 2026): the read hands back a studio's
 *  own classes and THEN the artists' classes it holds, two lists concatenated,
 *  so its order is not the calendar's. "Next" has to mean next.
 *
 *  ⚠ NOTHING IS DRAWN WHEN THERE IS NOTHING. An empty shelf under a heading
 *  reads as a measured zero, where the truth is "nothing is published for the
 *  next three months"; the bar above still opens the schedule. */

/** WHAT THE RAIL NEEDS TO OFFER "Book Now" (5 Oct 2026, the user: "Book Now
 *  button for the next session on public profile pages"). Plain data, because the
 *  rail is a client component and its page is a server one. */
export interface NextSessionsBooking {
  signedIn: boolean;
  /** the viewer's own live seats, by session id — a booked card says Booked and
   *  offers the way out of the seat instead */
  mine: Record<string, { id: string; status: ClassBookingStatus }>;
  /** sessions the viewer RUNS — the studio's own classes for its owner, a class
   *  for the artist taking it — which offer no seat, the class page's rule (R61) */
  runs: string[];
  /** sessions that have already STARTED — the rail keeps a class until it ends,
   *  and `book_class_session` refuses a seat once it has begun, so a Book Now
   *  there would only be refused after the press. The class page says "This class
   *  has already started" in the same place; here the bar is simply not drawn
   *  (the card's own LIVE badge says why). Decided on the server, because a client
   *  component may not read the clock during render. */
  started: string[];
}

export function NextSessions({ entries, booking }: { entries: CalendarEntry[]; booking?: NextSessionsBooking }) {
  const [at, setAt] = useState(0);
  /* the server already trimmed to the soonest five (`findNextPublicSessions`);
     sorted and capped again here so a caller that forgets cannot draw fifty */
  const shown = nextSessionsOf(entries);
  if (shown.length === 0) return null;
  /* one card fills the row; two or more take 88% so the next one shows */
  const one = shown.length === 1;

  /* ⚠ THE COUNT IS WHAT IS SHOWN, NEVER WHAT WAS FOUND — the schedule behind the
     bar is where a total belongs (the number-and-list rule) */
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
      <div
        data-testid="next-sessions-rail"
        role="list"
        aria-label="Next sessions — swipe for more"
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          const step = card ? card.offsetWidth + 10 : el.clientWidth;
          setAt(Math.min(shown.length - 1, Math.round(el.scrollLeft / Math.max(1, step))));
        }}
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          padding: "2px 0 4px",
        }}
      >
        {shown.map((e) => {
          /* ⚠ THE CARD'S OWN BUTTON BAR, WITH THE APP'S ONE BOOKING CONTROL (5 Oct
             2026) — `EnrollButton`, exactly as Discover's shelf draws it: Book Now
             (a free class books here, a priced one opens its page, where the
             payment step is), Class full, Sign in to book, or — on a seat you
             already hold — the way out of it. No bar at all on your OWN profile
             (`booking` absent) or on a class you run. */
          const seat = booking?.mine[e.sessionId] ?? null;
          const offerTo = booking && !booking.runs.includes(e.sessionId) && (seat || !booking.started.includes(e.sessionId)) ? booking : null;
          return (
            <div key={e.sessionId} role="listitem" data-testid="next-session" style={{ flex: one ? "0 0 100%" : "0 0 88%", scrollSnapAlign: one ? "start" : "center", minWidth: 0 }}>
              <ClassTile
                danceClass={tileClassOf(e)}
                filled={e.filled}
                artist={e.artist}
                city={e.businessCity}
                href={`/c/${e.shareSlug}`}
                relation={seat ? "booked" : null}
                actions={
                  offerTo ? (
                    <EnrollButton
                      sessionId={e.sessionId}
                      isFull={e.filled >= e.capacity}
                      isSignedIn={offerTo.signedIn}
                      mine={seat}
                      priceInr={e.priceInr}
                      shareSlug={e.shareSlug}
                    />
                  ) : undefined
                }
              />
            </div>
          );
        })}
      </div>
      {!one ? (
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 4 }} aria-hidden="true">
          {shown.map((e, i) => (
            <span key={e.sessionId} style={{ width: i === at ? 14 : 5, height: 5, borderRadius: 3, transition: "width .2s", background: i === at ? SKY : LINE }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
