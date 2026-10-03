"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { reclaimCrewAction } from "@/features/crews/server-actions/crews";
import { CREW_TINT } from "@/types/crew";

/** TAKE THE CREW BACK (30 Sep 2026).
 *
 *  ⚠ "Make leader" hands a crew over and was a ONE-WAY DOOR: the founder became
 *  a plain member, `is_crew_leader` answered false for them, and they could not
 *  take it back, remove the new leader or hand it on. This is the way back, and
 *  it is offered ONLY to `crews.created_by` — the row below already knows,
 *  because the read answers `foundedByMe` rather than handing over a user id.
 *
 *  ⚠ It sits on the row in the "You are in" column, which is where a founder who
 *  handed their crew over now finds it: they are a member of it.
 *
 *  ⚠ THE REFUSAL IS THE DATABASE'S OWN WORDS. `reclaim_crew` refuses somebody
 *  who is not the founder, somebody who already leads it, and a founder who has
 *  LEFT the crew — and printing its sentence rather than a generic one is this
 *  app's grammar everywhere a door can say no. */
export function ReclaimCrewButton({
  crewId,
  crewName,
  buttonStyle,
  wrapStyle,
}: {
  crewId: string;
  crewName: string;
  /** the card's action bar draws it as one of its own buttons (3 Oct 2026) */
  buttonStyle?: CSSProperties;
  wrapStyle?: CSSProperties;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={wrapStyle ?? { marginTop: 6 }}>
      <button
        type="button"
        disabled={busy}
        aria-label={`Take ${crewName} back`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await reclaimCrewAction({ crewId });
            if (r.error) setError(r.error);
          })
        }
        style={{
          padding: "7px 13px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          cursor: busy ? "default" : "pointer",
          background: "transparent",
          color: CREW_TINT,
          border: `1.5px solid ${CREW_TINT}`,
          fontFamily: "inherit",
          opacity: busy ? 0.6 : 1,
          ...buttonStyle,
        }}
      >
        {busy ? "Taking it back…" : "Take it back"}
      </button>
      {error ? (
        <div role="alert" style={{ fontSize: 10.5, color: "#F87171", marginTop: 5, lineHeight: 1.45 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
