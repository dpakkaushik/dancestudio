"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  cancelEnrollmentAction,
  enrollAction,
  type EnrollActionState,
} from "@/features/enrollments/server-actions/enrollments";
import { GOLD, GREEN, INK, SOLID } from "@/lib/design/tokens";
import type { EnrollmentStatus } from "@/types/enrollment";
import { NO_BOOKING_FOR_AN_ORGANIZATION } from "@/types/profile";

const EL = "var(--el)";
const initialState: EnrollActionState = { error: null, outcome: null };

const chip = (color: string): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 900,
  padding: "6px 11px",
  borderRadius: 999,
  background: `${color}1c`,
  color,
});

/** ⚠⚠ THE INK BUTTON'S TEXT IS `--solid`, NEVER `--bg` (27 Sep 2026) — and that
 *  one token is why the primary control on every class card on Discover was
 *  INVISIBLE, in both themes.
 *
 *  `INK` is `var(--text)` and `LILAC` is `var(--bg)`. At page level those two are
 *  opposites, so `background: INK; color: LILAC` reads perfectly — which is why
 *  it survived unnoticed. But `InvertedPanel` (21 Sep, C39) redeclares
 *  `--solid --card --el --text --sub --muted` for its subtree and DELIBERATELY
 *  leaves `--bg` alone, because `--bg` is the BODY's and nothing inside a panel
 *  has business reading it. So inside the panel the ground flipped to the other
 *  theme's ink and the label did not: `var(--text)` on `var(--bg)`, which is the
 *  same colour by construction in both themes — 1:1, not a near miss.
 *
 *  Discover's shelf has been inside that panel since 21 Sep, so "Book a spot",
 *  "Book this class" and "Sign in to book" have all been blank pills there for
 *  six days. `SOLID` is `var(--solid)` — the page surface the panel DOES swap —
 *  which is what every other inked control in the app already pairs with
 *  (`pillBtn` on the Inbox, Done in ArrangeTools, the desks' `bizBtn`).
 *
 *  ⚠ The identity is the tell and it is worth carrying: two tokens that are
 *  equal at page level are not a colour pair, they are a coincidence. Anything
 *  that may ever be drawn inside a panel pairs `--text` with `--solid`. */
const btn = (solid: boolean): React.CSSProperties => ({
  flex: 1,
  fontSize: 11.5,
  fontWeight: 900,
  padding: "9px 13px",
  borderRadius: 999,
  cursor: "pointer",
  border: solid ? "none" : `1.5px solid ${EL}`,
  background: solid ? INK : "transparent",
  color: solid ? SOLID : "#F87171",
  textAlign: "center",
});

/** The booking control on a class card. Full class → the waitlist takes over
 *  (prototype: "join the waitlist and we'll tell you if one opens", 12420-12423).
 *  Step 9: money lives on the class page — a priced class's book button and a
 *  paid booking's cancel both open /c/{slug}, where the pay sheets and the
 *  refund sheet are. Free bookings and waitlist moves stay one tap. */
export function EnrollButton({
  sessionId,
  isFull,
  isSignedIn,
  mine,
  priceInr,
  shareSlug,
  canBook = true,
}: {
  sessionId: string;
  isFull: boolean;
  isSignedIn: boolean;
  mine: { id: string; status: EnrollmentStatus } | null;
  priceInr: number;
  shareSlug: string;
  /** false for an ORGANIZATION account (19 Sep 2026) — `guard_person_only` has
   *  refused it since 8 Sep, and until today the screen did not say so */
  canBook?: boolean;
}) {
  const [enrollState, enrollForm, enrollPending] = useActionState(enrollAction, initialState);
  const [cancelState, cancelForm, cancelPending] = useActionState(cancelEnrollmentAction, initialState);
  const error = enrollState.error || cancelState.error;
  const isPaid = priceInr > 0;

  if (!isSignedIn) {
    return (
      <Link href="/login" style={{ ...btn(true), textDecoration: "none", display: "block" }}>
        Sign in to book
      </Link>
    );
  }

  /* An organization browses Discover and books nothing — said, not refused after
     the press. ⚠ Only where there is nothing to cancel: `guard_person_only` has
     refused an organization a seat since 8 Sep 2026, but a row written BEFORE
     that guard existed would otherwise lose its way out. */
  if (!canBook && !mine) {
    return (
      <div data-testid="org-cannot-book" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.45, padding: "4px 2px" }}>
        {NO_BOOKING_FOR_AN_ORGANIZATION}
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {mine ? (
          <>
            <span style={chip(mine.status === "enrolled" ? GREEN : GOLD)}>
              {mine.status === "enrolled" ? "Enrolled ✓" : "📋 On the waitlist"}
            </span>
            {mine.status === "enrolled" && isPaid ? (
              <Link href={`/c/${shareSlug}`} style={{ ...btn(false), textDecoration: "none" }}>
                Cancel / refund ›
              </Link>
            ) : (
              <form action={cancelForm} style={{ flex: 1, display: "flex" }}>
                <input type="hidden" name="enrollmentId" value={mine.id} />
                <button type="submit" disabled={cancelPending} style={btn(false)}>
                  {cancelPending ? "Cancelling…" : mine.status === "enrolled" ? "Cancel booking" : "Leave waitlist"}
                </button>
              </form>
            )}
          </>
        ) : isPaid && !isFull ? (
          <Link href={`/c/${shareSlug}`} style={{ ...btn(true), textDecoration: "none" }}>
            Book this class
          </Link>
        ) : (
          <form action={enrollForm} style={{ flex: 1, display: "flex" }}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button type="submit" disabled={enrollPending} style={btn(true)}>
              {enrollPending ? "Booking…" : isFull ? "Join waitlist" : "Book a spot"}
            </button>
          </form>
        )}
      </div>
      {enrollState.outcome === "waitlisted" && (
        <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 800, marginTop: 6 }}>
          📋 On the waitlist — you get the next freed spot.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 10.5, color: "#EF4444", fontWeight: 700, marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}
