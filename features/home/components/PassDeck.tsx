"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { DOS_UI, LINE, SKY } from "@/lib/design/tokens";
import type { DeckClassItem, DeckItem } from "@/types/home";

/** THE PASS DECK — lifted from the prototype (PassDeck 6863-7204, the rail at
 *  7183-7199): today's sessions as ONE swiped rail of 88%-width cards, snapped to
 *  centre, a row of dots under them saying where you are. One card, everywhere —
 *  the same ClassTile the calendar and Discover draw — each wearing the chip that
 *  says what the session is to you and, on exactly one of them, the Live frame.
 *
 *  ⚠⚠ NOTHING UNDER THE CARD ANY MORE (2 Oct 2026, the user: "should not show
 *  invoice and cancel booking option on todays schedule tile on home … can also
 *  remove you are booked an everything in that section below the bar"). The
 *  BookingActions strip — "You're booked", the reference, "Your own profile QR
 *  is what gets you in" and the Invoice | Cancel booking pill — is gone with the
 *  two sheets it opened. Both are still on the class page, which the card opens;
 *  Home's deck is for glancing at today, not for the money side of a booking.
 *
 *  ⚠ A CARD SAYS "CHECKED IN" once the door has let you in (`checkedIn`, off
 *  your live attendance row) — the other half of the approved-QR moment. */
export function PassDeck({ items }: { items: DeckItem[] }) {
  const [at, setAt] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  /* ⚠ THE FINISHED CARDS ARE TO THE LEFT (2 Oct 2026), so the rail opens on the
     first card that is not over — the live one, or the next — with the morning a
     swipe back. Set once per day's list; the rail's own onScroll moves the dots */
  const firstOpen = items.findIndex((p) => p.state !== "done");
  useEffect(() => {
    const el = rail.current;
    if (!el || firstOpen <= 0) return;
    const card = el.children[firstOpen] as HTMLElement | undefined;
    if (!card) return;
    // measured against the rail itself — offsetLeft is relative to whatever ancestor is positioned
    const left = card.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = left - (el.clientWidth - card.offsetWidth) / 2;
  }, [firstOpen]);

  const classCard = (p: DeckClassItem): ReactNode => (
    <ClassTile
      danceClass={p.danceClass}
      filled={p.filled}
      artist={p.artist}
      city={p.businessCity}
      href={p.href}
      /* every card in this rail is today, so the date block says so (8290-8293) */
      isToday
      roleLabel={p.roleLabel}
      /* done · live · upcoming — red, green, amber (2 Oct 2026); `live` rides on it */
      deckState={p.state}
      checkedIn={Boolean(p.checkedIn)}
    />
  );

  return (
    <>
      {/* one card, everywhere — the same component the calendar and Discover draw, swiped (7183-7192) */}
      <div
        ref={rail}
        data-testid="home-deck"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth * 0.88)));
        }}
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          margin: "0 -16px",
          padding: "4px 16px 2px",
          fontFamily: DOS_UI,
        }}
      >
        {items.map((p) => (
          <div key={p.key} data-testid="deck-card" style={{ flex: "0 0 88%", scrollSnapAlign: "center", minWidth: 0 }}>
            {classCard(p)}
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 2, marginBottom: 4 }} aria-hidden="true">
          {items.map((p, i) => (
            <span key={p.key} style={{ width: i === at ? 14 : 5, height: 5, borderRadius: 3, transition: "width .2s", background: i === at ? SKY : LINE }} />
          ))}
        </div>
      ) : null}
    </>
  );
}
