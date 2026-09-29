"use client";

import Link from "next/link";
import { useState } from "react";
import { setCrewFollowAction, setFollowAction, setPersonFollowAction, type FollowActionResult } from "@/features/follows/server-actions/follows";
import { PROFILE_CHIP } from "./profile-band";

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
  target.kind === "business" ? setFollowAction({ businessId: target.id, on }) : target.kind === "person" ? setPersonFollowAction({ userId: target.id, on }) : setCrewFollowAction({ crewId: target.id, on });

export function FollowToggle({
  target,
  initialFollowing,
  initialFollowers = null,
  accent,
  signedIn,
  cannotFollow = null,
}: {
  target: FollowTarget;
  initialFollowing: boolean;
  /** the live count, when the page read one — carried as data, never printed */
  initialFollowers?: number | null;
  /** the page's own colour — the lit edge of a Following button */
  accent: string;
  signedIn: boolean;
  /** ⚠⚠ `variant` IS GONE (27 Sep 2026). It carried `pill` — the prototype's
   *  Follow button with its word and its star — and `chip`, the bell beside the
   *  QR and Stats that C27 made every surface use on 20 Sep. **Every one of the
   *  five callers has passed `"chip"` since that day**, so the `pill` branch has
   *  rendered nowhere for a week while still defaulting to itself, which is this
   *  repo's own worst shape: a branch nobody draws is where a defect hides, and
   *  this one was hiding a real difference — the pill printed `error` and the
   *  chip did not. The bell is the control, and the star glyph went with the
   *  branch. ⚠ `smallBox` did NOT — it still dresses four other buttons
   *  (the Followers sheet, a crew's Manage, a studio's) and is only unused
   *  HERE, which is a different thing from unused. */
  /** when the database would refuse this follow, the chip is still DRAWN and
   *  says why rather than vanishing — "available to all" is about the control
   *  being there, never about promising a press that would be refused (R31).
   *  ⚠ NO CALLER PASSES ONE TODAY (20 Sep 2026): its one reason was "an
   *  organization does not follow", and an organization follows since
   *  `20260920180000_an_organization_follows`. The mechanism is kept rather than
   *  deleted because the refusals it was built for are still in the doors — a
   *  private organization, a crew you are in, a business you belong to — and the
   *  pages that meet those simply do not draw the bell at all yet. */
  cannotFollow?: string | null;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState<number | null>(initialFollowers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  /** ⚠ A FAILED FOLLOW SAID NOTHING AT ALL UNTIL 27 Sep 2026, and removing the
   *  dead branch is what surfaced it. The old `pill` shape printed `error` under
   *  itself; the CHIP never did — so a refusal from the door (suspended, not on
   *  DanceOS, your own crew) left a 44px bell that simply did not change, which
   *  reads as a broken button rather than as a rule.
   *
   *  ⚠ It goes in the ACCESSIBLE NAME and the tooltip rather than under the
   *  chip, because this control sits in the figures row between the QR and
   *  Stats: a sentence rendered there would move three chips and the figures
   *  beside them. The same treatment `cannotFollow` already gets, for the same
   *  reason — and it is the one place the chip can speak without relaying out
   *  the row it lives in. */
  const word = following ? "Following" : "Follow";
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={following}
      aria-label={error ? `${word} — ${error}` : word}
      title={error ?? word}
      data-testid="follow-toggle"
      data-followers={followers ?? undefined}
      onClick={() => void toggle()}
      style={{ ...PROFILE_CHIP, cursor: busy ? "wait" : "pointer", background: following ? accent : "var(--text)", border: error ? "1.5px solid #F87171" : PROFILE_CHIP.border }}
    >
      {bell(following)}
    </button>
  );
}
