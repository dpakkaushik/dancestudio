"use client";

import Link from "next/link";
import { useState } from "react";
import { setCrewFollowAction, setFollowAction, setPersonFollowAction, type FollowActionResult } from "@/features/follows/server-actions/follows";
import { SUB } from "@/lib/design/tokens";
import { PROFILE_CHIP } from "./profile-band";
import { smallBox } from "./profile-kit";

/** FOLLOW · FOLLOWING, ONE CONTROL FOR EVERY PROFILE PAGE (19 Sep 2026, the user:
 *  "Follow with Following toggle for all" — an organization, a studio, an
 *  artist, a crew, a user). It is the prototype's Follow from the action row
 *  (10930-10936) — "a state does not get to become a different object":
 *  Following keeps the ground and takes a lit edge and a filled star — drawn
 *  once here for the three things a follow can name (`follows.business_id`,
 *  `followee_id`, `crew_id`), where it used to be two components that had
 *  already drifted (one carried a count, one did not).
 *
 *  THE COUNT IS ON IT (19 Sep 2026, later — the user: "Follow Following count
 *  on Profile Pages"): "Follow · 12" / "Following · 13", the live figure the
 *  RPC hands back after every press, and `data-followers` still carries it for
 *  the suite. The accessible name stays the bare word so every locator that
 *  asks for "Follow" or "Following" finds the same control. A stranger's press
 *  leads to sign-in, because a follow is a fact about somebody who is on
 *  DanceOS. */

export type FollowTarget = { kind: "business" | "person" | "crew"; id: string };

const send = (target: FollowTarget, on: boolean): Promise<FollowActionResult> =>
  target.kind === "business" ? setFollowAction({ tenantId: target.id, on }) : target.kind === "person" ? setPersonFollowAction({ userId: target.id, on }) : setCrewFollowAction({ crewId: target.id, on });

export function FollowToggle({
  target,
  initialFollowing,
  initialFollowers = null,
  accent,
  signedIn,
  variant = "pill",
  cannotFollow = null,
}: {
  target: FollowTarget;
  initialFollowing: boolean;
  /** the live count, when the page read one — carried as data, never printed */
  initialFollowers?: number | null;
  /** the page's own colour — the lit edge of a Following button */
  accent: string;
  signedIn: boolean;
  /** ⚠ `chip` is the BELL beside the QR and Stats in the figures row (20 Sep
   *  2026, the user: "Follow button to be a bell with qr code and stats"). It is
   *  a variant rather than a second component on purpose: two controls for one
   *  fact is how Follow came to exist twice before, one carrying a count and one
   *  not (19 Sep). Same state, same action, same accessible name. */
  variant?: "pill" | "chip";
  /** when the database would refuse this follow — your own team, or an
   *  organization account, which `guard_person_only` has refused since 8 Sep —
   *  the chip is still DRAWN and says why rather than vanishing. "Available to
   *  all" is about the control being there, never about promising a press that
   *  would be refused (R31's rule). */
  cannotFollow?: string | null;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState<number | null>(initialFollowers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const star = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={following ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3.6 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8z" />
    </svg>
  );

  /* ⚠ DEFINED BEFORE THE FIRST `return`, not after it. The chip branch below
     returns early, and a `const` arrow declared after that point is in the
     temporal dead zone for the closure that captured it — the press would throw
     rather than follow anybody. */
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await send(target, !following);
    setBusy(false);
    if (out.error || !out.state) {
      setError(out.error ?? "Could not update that follow");
      return;
    }
    setFollowing(out.state.following);
    setFollowers(out.state.followers);
  };

  /* the BELL the chip wears — filled once you follow, so the two states read at
     a glance the way the star's fill already did on the pill */
  const bell = (on: boolean) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );

  if (variant === "chip") {
    /* the database would refuse it — drawn, disabled, and it says why */
    if (cannotFollow) {
      return (
        <button type="button" disabled aria-label={cannotFollow} title={cannotFollow} data-testid="follow-toggle" data-followers={initialFollowers ?? undefined} style={{ ...PROFILE_CHIP, opacity: 0.45, cursor: "not-allowed" }}>
          {bell(false)}
        </button>
      );
    }
    if (!signedIn) {
      return (
        <Link href="/login" aria-label="Follow" title="Follow" data-testid="follow-toggle" data-followers={initialFollowers ?? undefined} style={PROFILE_CHIP}>
          {bell(false)}
        </Link>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? "Following" : "Follow"}
        title={following ? "Following" : "Follow"}
        data-testid="follow-toggle"
        data-followers={followers ?? undefined}
        onClick={() => void toggle()}
        style={{ ...PROFILE_CHIP, cursor: busy ? "wait" : "pointer", background: following ? accent : "var(--text)" }}
      >
        {bell(following)}
      </button>
    );
  }

  /* the figures moved to their own line under the hero (`FollowFigures`, later
     on 19 Sep 2026: "follow following counts visible on every profile") — the
     button is the word alone again, and `followers` rides as data */
  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Follow" data-testid="follow-toggle" data-followers={initialFollowers ?? undefined} style={smallBox(false, accent)}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: SUB }}>{star}</span>Follow
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? "Following" : "Follow"}
        data-testid="follow-toggle"
        data-followers={followers ?? undefined}
        onClick={() => void toggle()}
        style={{ ...smallBox(following, accent), cursor: busy ? "wait" : "pointer" }}
      >
        <span style={{ flexShrink: 0, lineHeight: 0, color: following ? accent : SUB }}>{star}</span>
        {following ? "Following" : "Follow"}
      </button>
      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 5 }}>{error}</div> : null}
    </>
  );
}
