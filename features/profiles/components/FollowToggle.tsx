"use client";

import Link from "next/link";
import { useState } from "react";
import { setCrewFollowAction, setFollowAction, setPersonFollowAction, type FollowActionResult } from "@/features/follows/server-actions/follows";
import { SUB } from "@/lib/design/tokens";
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
}: {
  target: FollowTarget;
  initialFollowing: boolean;
  /** the live count, when the page read one — carried as data, never printed */
  initialFollowers?: number | null;
  /** the page's own colour — the lit edge of a Following button */
  accent: string;
  signedIn: boolean;
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
