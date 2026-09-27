import Link from "next/link";
import { GREEN, INK, SOLID } from "@/lib/design/tokens";

const EL = "var(--el)";

const chip = (color: string): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 900,
  padding: "6px 11px",
  borderRadius: 999,
  background: `${color}1c`,
  color,
});

/** ⚠ `--text` OVER `--solid`, never over `--bg` — `EnrollButton` has the whole
 *  reason written out: `--bg` is the body's and `InvertedPanel` leaves it alone,
 *  so on Discover the two are the same colour and the label disappears. */
const btn = (solid: boolean): React.CSSProperties => ({
  flex: 1,
  fontSize: 11.5,
  fontWeight: 900,
  padding: "9px 13px",
  borderRadius: 999,
  cursor: "pointer",
  border: solid ? "none" : `1.5px solid ${EL}`,
  background: solid ? INK : "transparent",
  color: solid ? SOLID : INK,
  textAlign: "center",
  textDecoration: "none",
  display: "block",
});

/** THE BOOKING CONTROL ON AN EVENT CARD (27 Sep 2026, the user: *"fix the
 *  buttons for all class and event cards"*) — `EnrollButton`'s grammar, for an
 *  event.
 *
 *  ⚠ **EVERY PATH IS A LINK TO `/e/{slug}`, AND THAT IS THE DESIGN.** A class
 *  seat can be taken in one press because there is one seat to take; an event
 *  booking never can — the person has to say which side they are on
 *  (participant or spectator), which format they are entering as, which crew or
 *  partner, and how many seats. That is the event page's confirm sheet, and a
 *  card cannot hold it. So this is exactly what `EnrollButton` already does for
 *  a PRICED class: name the act, and open the screen where the act happens.
 *
 *  ⚠ The words are the event page's own, so pressing one does not land on a
 *  different sentence: "Sign in to book", "Sold out", the organization's line.
 *  What it adds is the state a card can usefully say from the shelf — that you
 *  already hold something — which the page says only once it is open. */
export function EventBookButton({
  shareSlug,
  isSignedIn,
  held,
  soldOut,
  isPast = false,
  cannotBookWhy = null,
  as = null,
}: {
  shareSlug: string;
  isSignedIn: boolean;
  /** what this person already holds on this event, if anything */
  held: { participant: boolean; spectator: boolean } | null;
  /** neither side has anywhere left to put somebody */
  soldOut: boolean;
  /** over — the page draws its final figures rather than a bar */
  isPast?: boolean;
  /** ⚠ THE REASON, NOT A BOOLEAN — `EnrollButton` carries the whole story. Null
   *  means you may book; a crew may, a studio and an organization may not. */
  cannotBookWhy?: string | null;
  /** the profile the shelf was read as, carried on so the page agrees with the
   *  card that sent you (`?as=`) */
  as?: string | null;
}) {
  const href = as ? `/e/${shareSlug}?as=${encodeURIComponent(as)}` : `/e/${shareSlug}`;

  if (isPast) {
    return (
      <Link href={href} style={btn(false)}>
        See how it went ›
      </Link>
    );
  }

  if (!isSignedIn) {
    return (
      <Link href="/login" style={btn(true)}>
        Sign in to book
      </Link>
    );
  }

  if (held && (held.participant || held.spectator)) {
    return (
      <>
        <span style={chip(GREEN)}>{held.participant && held.spectator ? "Entered ✓ · Seat ✓" : held.participant ? "Entered ✓" : "Seat booked ✓"}</span>
        <Link href={href} style={btn(false)}>
          Your ticket ›
        </Link>
      </>
    );
  }

  /* a business browses and books nothing — said, not refused after the press.
     Only where there is nothing held, so an entry made before the person
     switched profiles keeps its way in (EnrollButton's own rule). */
  if (cannotBookWhy) {
    return (
      <div data-testid="org-cannot-book" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.45, padding: "4px 2px" }}>
        {cannotBookWhy}
      </div>
    );
  }

  if (soldOut) {
    return (
      <Link href={href} style={{ ...btn(false), color: "#F87171" }}>
        Sold out — see the event ›
      </Link>
    );
  }

  return (
    <Link href={href} style={btn(true)}>
      Book this event
    </Link>
  );
}
