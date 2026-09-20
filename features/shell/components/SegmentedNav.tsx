"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type CSSProperties } from "react";
import { INK, SUB } from "@/lib/design/tokens";

/** THE SEGMENTED CONTROL, AND WHY IT IS A CLIENT COMPONENT (20 Sep 2026).
 *
 *  The user: *"when switching between class columns its lagging … check from
 *  artist profiles saw it there. see such bug doesnt appear anywhere in the
 *  system where things are getting stuck."*
 *
 *  They are right, and the cause is worth writing down because it is the same on
 *  every desk that keeps its segment in the URL. Booked · Assist · Manage are
 *  real links — the address IS the state, which is the rule this app keeps so a
 *  narrowed list can be sent to somebody (19 Sep, Discover's filters). But that
 *  means a tap is a SERVER round trip, and on an artist's own page the Manage
 *  segment reads the whole register: the classes, the seat counts, the publish
 *  state, the artists and `why_no_class`. Until that comes back a plain `<Link>`
 *  gives the finger NOTHING — the old segment stays lit, nothing moves, and the
 *  screen reads as STUCK rather than as busy.
 *
 *  So the segment is pressed OPTIMISTICALLY: `useOptimistic` lights the one you
 *  tapped the instant you tap it and React puts it back if the navigation never
 *  lands, `useTransition` marks the list underneath as busy, and the URL still
 *  changes — back still works, the link is still shareable, and the SERVER is
 *  still what decides what is in the list. Nothing about the data moves to the
 *  client; only the answer to "did it hear me" does.
 *
 *  ⚠ ONE COMPONENT ON PURPOSE. The same control was written out three times —
 *  Your classes, Your events and the Memberships desk — so the same lag was in
 *  all three, and a fix in one would not have reached the others. */

/** the mechanic on its own, for a control whose SHAPE is not a segmented pill —
 *  Discover's five icon tiles are the other place a tap is a server round trip
 *  and the old tile stayed lit while it happened. `shown` is what to draw as
 *  pressed; `go` is what an onClick calls. */
export function useOptimisticNav(active: string): { shown: string; go: (key: string, href: string, e: React.MouseEvent) => void } {
  const router = useRouter();
  const [, start] = useTransition();
  const [shown, press] = useOptimistic(active);
  return {
    shown,
    go: (key, href, e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (key === active) return;
      start(() => {
        press(key);
        router.replace(href, { scroll: false });
      });
    },
  };
}

export interface Segment {
  key: string;
  href: string;
  label: string;
  /** the count inside the toggle (19 Sep 2026, the user: "counts inside the toggles") */
  n?: number;
  aria: string;
}

const WRAP: CSSProperties = { display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 10 };

export function SegmentedNav({ segments, active, label = "Show" }: { segments: Segment[]; active: string; label?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  /* ⚠ `useOptimistic`, not `useState` + an effect: this repo's lint forbids
     setState in an effect, and the optimistic value also REVERTS by itself when
     the transition settles — so a navigation that fails leaves the lit segment
     telling the truth rather than a lie that needs clearing up. */
  const [shown, press] = useOptimistic(active);

  return (
    <div role="group" aria-label={label} style={WRAP}>
      {segments.map((s) => {
        const on = shown === s.key;
        return (
          <a
            key={s.key}
            href={s.href}
            aria-label={`${s.aria}${s.n == null ? "" : ` (${s.n})`}`}
            aria-current={on ? "page" : undefined}
            onClick={(e) => {
              /* a modified click stays the browser's — new tab, copy link */
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              if (s.key === active) return;
              start(() => {
                press(s.key);
                router.replace(s.href, { scroll: false });
              });
            }}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "8px 2px",
              borderRadius: 9,
              fontSize: 11.5,
              fontWeight: 800,
              textDecoration: "none",
              background: on ? "var(--solid)" : "transparent",
              color: on ? INK : SUB,
              boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none",
            }}
          >
            {s.label}
            {s.n == null ? null : <span style={{ fontVariantNumeric: "tabular-nums", opacity: on ? 0.75 : 0.6 }}> {s.n}</span>}
          </a>
        );
      })}
    </div>
  );
}
