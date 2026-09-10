"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";

/** "NEAR ME" MEANS ME (11 Sep 2026).
 *
 *  Discover has always measured from the CITY'S CENTRE. Everything on the
 *  shelf was "near you" in the sense of being in the same city as you, and the
 *  distance on every card was the distance from a point in the middle of town
 *  that nobody is standing at. This chip replaces that origin with where the
 *  person actually is.
 *
 *  It is a chip and not a default, deliberately: asking for somebody's location
 *  the moment they open a page is the kind of prompt people refuse on
 *  principle, and once refused a browser does not ask again. So it is offered,
 *  and it explains itself, and the city stays selected underneath — pressing it
 *  again turns it off and Discover goes back to the city centre.
 *
 *  The coordinates go in the URL, which means the server does the search (the
 *  browser never talks to the database) and the result is a link somebody can
 *  keep. They are rounded to three decimals — about 100 m — because that is
 *  plenty to sort studios by and a URL is not a place to put somebody's doorstep
 *  to five decimals. */
export function NearMeChip({ on, params }: { on: boolean; params: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = (near: string | null) => {
    const next = new URLSearchParams(params);
    if (near) {
      next.set("near", near);
    } else {
      next.delete("near");
    }
    router.push(`/discover?${next.toString()}`);
  };

  const press = () => {
    if (on) {
      go(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setErr("This browser will not share where you are.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        go(`${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)}`);
      },
      () => {
        setBusy(false);
        setErr("Not shared — the list stays measured from the city centre.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-pressed={on}
        disabled={busy}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 30,
          padding: "0 11px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          background: on ? "var(--text)" : CARD,
          color: on ? "var(--solid)" : SUB,
          border: `1px solid ${on ? "var(--text)" : EL}`,
        }}
      >
        ◎ {busy ? "Finding you…" : on ? "Near me · on" : "Near me"}
      </button>
      {err ? (
        <span role="status" style={{ fontSize: 10, color: INK, opacity: 0.75, marginLeft: 6 }}>
          {err}
        </span>
      ) : null}
    </>
  );
}
