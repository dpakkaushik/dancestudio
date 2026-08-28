"use client";

import Link from "next/link";
import { useState } from "react";
import { setPersonFollowAction } from "@/features/follows/server-actions/follows";
import { CARD, INK, LINE } from "@/lib/design/tokens";
import { fmtFollowers } from "./PublicProfile";

/** Follow / Following for a PERSON — the same control the business page wears
 *  (prototype 10930: "a state does not get to become a different object", the lit
 *  edge in the page's own colour). A stranger's press leads to sign-in, because
 *  a follow is a fact about somebody who is on DanceOS. */
export function PersonFollowButton({
  userId,
  initialFollowing,
  initialFollowers,
  accent,
  signedIn,
}: {
  userId: string;
  initialFollowing: boolean;
  initialFollowers: number;
  accent: string;
  signedIn: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shell: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: 11,
    fontWeight: 800,
    fontSize: 11,
    cursor: "pointer",
    border: `1px solid ${following ? accent : LINE}`,
    background: following ? `${accent}1e` : CARD,
    color: following ? accent : INK,
    textDecoration: "none",
    fontFamily: "inherit",
    width: "100%",
  };

  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Sign in to follow" style={shell}>
        Follow
      </Link>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !following;
    const out = await setPersonFollowAction({ userId, on: next });
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
      <button type="button" disabled={busy} aria-pressed={following} aria-label={following ? "Following — press to unfollow" : "Follow"} onClick={() => void toggle()} style={shell}>
        {following ? "Following ✓" : "Follow"}
        <span style={{ fontSize: 10, opacity: 0.7 }}>{fmtFollowers(followers)}</span>
      </button>
      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 5 }}>{error}</div> : null}
    </>
  );
}
