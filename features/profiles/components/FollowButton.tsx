"use client";

import Link from "next/link";
import { useState } from "react";
import { setFollowAction } from "@/features/follows/server-actions/follows";
import { SUB } from "@/lib/design/tokens";

/** The Follow control from the prototype's action row (10930-10936): "a state
 *  does not get to become a different object" — Following keeps the ground and
 *  takes a lit edge and a filled star instead. The followers figure above it
 *  moves with the answer, because the RPC hands the live count back. */
export function FollowButton({
  tenantId,
  initialFollowing,
  initialFollowers,
  accent,
  signedIn,
  onCount,
}: {
  tenantId: string;
  initialFollowing: boolean;
  initialFollowers: number;
  /** the page's own colour — the lit edge of a Following button */
  accent: string;
  signedIn: boolean;
  onCount?: (n: number) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followers, setFollowers] = useState(initialFollowers);

  const box: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 38,
    borderRadius: 11,
    cursor: busy ? "wait" : "pointer",
    fontWeight: 800,
    fontSize: 11,
    boxSizing: "border-box",
    padding: "0 4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    background: "var(--card)",
    color: "var(--text)",
    border: `1px solid ${following ? accent : "var(--el)"}`,
    boxShadow: following ? `0 0 0 1px ${accent}55` : "none",
    width: "100%",
    fontFamily: "inherit",
    textDecoration: "none",
  };

  const star = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={following ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3.6 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8z" />
    </svg>
  );

  if (!signedIn) {
    /* a stranger is offered the same button; it leads to sign-in, because a
       follow is a fact about a person */
    return (
      <Link href="/login" aria-label="Follow" style={box}>
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
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError(null);
          const out = await setFollowAction({ tenantId, on: !following });
          setBusy(false);
          if (out.error || !out.state) {
            setError(out.error ?? "Could not update that follow");
            return;
          }
          setFollowing(out.state.following);
          setFollowers(out.state.followers);
          onCount?.(out.state.followers);
        }}
        style={box}
      >
        <span style={{ flexShrink: 0, lineHeight: 0, color: following ? accent : SUB }}>{star}</span>
        {following ? "Following" : "Follow"}
        <span data-followers={followers} hidden />
      </button>
      {error ? <div style={{ fontSize: 11, color: "#F87171", marginTop: 6 }}>{error}</div> : null}
    </>
  );
}
