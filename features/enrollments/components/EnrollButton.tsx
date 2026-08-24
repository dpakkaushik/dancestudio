"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  cancelEnrollmentAction,
  enrollAction,
  type EnrollActionState,
} from "@/features/enrollments/server-actions/enrollments";
import { GOLD, GREEN, INK, LILAC } from "@/lib/design/tokens";
import type { EnrollmentStatus } from "@/types/enrollment";

const EL = "rgba(255,255,255,.13)";
const initialState: EnrollActionState = { error: null, outcome: null };

const chip = (color: string): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 900,
  padding: "6px 11px",
  borderRadius: 999,
  background: `${color}1c`,
  color,
});

const btn = (solid: boolean): React.CSSProperties => ({
  flex: 1,
  fontSize: 11.5,
  fontWeight: 900,
  padding: "9px 13px",
  borderRadius: 999,
  cursor: "pointer",
  border: solid ? "none" : `1.5px solid ${EL}`,
  background: solid ? INK : "transparent",
  color: solid ? LILAC : "#F87171",
  textAlign: "center",
});

/** The booking control on a class card. Full class → the waitlist takes over
 *  (prototype: "join the waitlist and we'll tell you if one opens", 12420-12423). */
export function EnrollButton({
  sessionId,
  isFull,
  isSignedIn,
  mine,
}: {
  sessionId: string;
  isFull: boolean;
  isSignedIn: boolean;
  mine: { id: string; status: EnrollmentStatus } | null;
}) {
  const [enrollState, enrollForm, enrollPending] = useActionState(enrollAction, initialState);
  const [cancelState, cancelForm, cancelPending] = useActionState(cancelEnrollmentAction, initialState);
  const error = enrollState.error || cancelState.error;

  if (!isSignedIn) {
    return (
      <Link href="/login" style={{ ...btn(true), textDecoration: "none", display: "block" }}>
        Sign in to book
      </Link>
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
            <form action={cancelForm} style={{ flex: 1, display: "flex" }}>
              <input type="hidden" name="enrollmentId" value={mine.id} />
              <button type="submit" disabled={cancelPending} style={btn(false)}>
                {cancelPending ? "Cancelling…" : mine.status === "enrolled" ? "Cancel booking" : "Leave waitlist"}
              </button>
            </form>
          </>
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
