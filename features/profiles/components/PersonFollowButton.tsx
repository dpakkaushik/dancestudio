"use client";

import Link from "next/link";
import { useState } from "react";
import { setPersonFollowAction } from "@/features/follows/server-actions/follows";
import { SUB } from "@/lib/design/tokens";
import { smallBox } from "./profile-kit";

/** Follow / Following for a PERSON — one cell of the small equal-buttons row
 *  (prototype 10875-10888: 38px tall, 11px type, the mark tinted in the page's
 *  own colour when it is on). "A state does not get to become a different
 *  object": Following keeps the ground and takes a lit edge and a filled star.
 *  The Followers figure above it is the page's, and the action revalidates the
 *  page, so the number moves without the button carrying a copy of it. A
 *  stranger's press leads to sign-in, because a follow is a fact about somebody
 *  who is on DanceOS. */
export function PersonFollowButton({ userId, initialFollowing, accent, signedIn }: { userId: string; initialFollowing: boolean; accent: string; signedIn: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const star = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={following ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3.6 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8z" />
    </svg>
  );

  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Follow" style={smallBox(false, accent)}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: SUB }}>{star}</span>Follow
      </Link>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await setPersonFollowAction({ userId, on: !following });
    setBusy(false);
    if (out.error || !out.state) {
      setError(out.error ?? "Could not update that follow");
      return;
    }
    setFollowing(out.state.following);
  };

  return (
    <>
      <button type="button" disabled={busy} aria-pressed={following} aria-label={following ? "Following" : "Follow"} onClick={() => void toggle()} style={{ ...smallBox(following, accent), cursor: busy ? "wait" : "pointer" }}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: following ? accent : SUB }}>{star}</span>
        {following ? "Following" : "Follow"}
      </button>
      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 5 }}>{error}</div> : null}
    </>
  );
}
