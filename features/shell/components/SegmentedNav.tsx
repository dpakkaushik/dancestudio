"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition, type CSSProperties, type ReactNode } from "react";
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

/** THE PILL ROW ITSELF — drawn once, used by both controls below, so the
 *  navigating segment and the instant one cannot drift apart. */
function Pills({ segments, shown, label, onPress }: { segments: Segment[]; shown: string; label: string; onPress: (s: Segment, e: React.MouseEvent) => void }) {
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
            onClick={(e) => onPress(s, e)}
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

/** a modified click stays the browser's — new tab, copy link */
const plainClick = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

/* ⚠ `SegmentedNav` — the NAVIGATING segment, which pressed optimistically and
   then waited for a server round trip — is DELETED (20 Sep 2026). Every one of
   its three callers is `SegmentedPanels` now, and a component nothing renders is
   the same lie as a field no screen reads. The mechanic it was built on survives
   as `useOptimisticNav` above, which Discover's tiles still need, because each
   of those tabs IS a different server read. If a desk ever appears whose
   segments genuinely cannot all be rendered at once, that hook plus `Pills`
   below is what it is made of. */

/** ⚠ THE SEGMENT THAT DOES NOT GO TO THE SERVER AT ALL (20 Sep 2026).
 *
 *  The user, after the optimistic press landed: *"CLASSES LAG ISSUE IS THERE
 *  WHEN SWITCHING COLUMNS."* They were still right. `SegmentedNav` answers the
 *  finger — the pill lights the instant it is tapped — but the LIST underneath
 *  it does not move until a server round trip comes back, and on a phone on a
 *  slow connection that is the whole of what "lagging" means. Lighting the pill
 *  made the control honest; it did not make the page fast.
 *
 *  So where every segment's content is ALREADY on the page, the switch is pure
 *  client state and costs nothing: no fetch, no round trip, no waiting. The
 *  panels are rendered on the server in the one pass — Booked, Assist and
 *  Manage together — and handed here as props, so React only has to choose
 *  between them.
 *
 *  ⚠ THE ADDRESS IS STILL THE STATE, which is this app's rule since Discover's
 *  filters (19 Sep 2026): `history.replaceState` puts the segment in the URL
 *  without a navigation, so a narrowed list is still a link somebody can be
 *  sent and a reload lands on the same segment. It REPLACES rather than pushes,
 *  which is exactly what `router.replace` did before — back leaves the page
 *  instead of walking the segments, and that has not changed.
 *
 *  ⚠ AND IT IS STILL A REAL `<a href>`: ctrl-click opens the segment in a new
 *  tab, the link is copyable, and a crawler or a client with no JavaScript
 *  follows it to a server render of the same list. */
export function SegmentedPanels({
  segments,
  initial,
  panels,
  label = "Show",
}: {
  segments: Segment[];
  /** the segment the SERVER decided, from `?show=` — the URL still wins on load */
  initial: string;
  /** one node per segment; only the shown one is mounted */
  panels: Array<{ key: string; node: ReactNode }>;
  label?: string;
}) {
  /* ⚠ THE CALLER PASSES `key={initial}` — see the note at each call site. React
     keeps a component's state across a re-render at the same position, so
     arriving at `/my-classes?show=assist` from a LINK somewhere else in the app
     would otherwise redraw the pills from the old `shown` and ignore the address
     the person just followed. A changed key remounts; a client-side switch never
     changes it, because `initial` is the SERVER's answer and `replaceState` does
     not go to the server. */
  const [shown, setShown] = useState(initial);
  const on = panels.find((p) => p.key === shown) ?? panels.find((p) => p.key === initial);
  return (
    <>
      <Pills
        segments={segments}
        shown={shown}
        label={label}
        onPress={(s, e) => {
          if (!plainClick(e)) return;
          e.preventDefault();
          if (s.key === shown) return;
          setShown(s.key);
          /* the URL follows the finger rather than leading it. `replaceState`
             is Next's supported way to change the query without a navigation —
             no RSC request, no loading boundary, nothing to wait for. Wrapped
             because a browser that refuses it (a sandboxed frame) must still
             leave the list switched. */
          try {
            window.history.replaceState(window.history.state, "", s.href);
          } catch {
            /* the segment is switched; only the address failed to follow */
          }
        }}
      />
      {on?.node ?? null}
    </>
  );
}
