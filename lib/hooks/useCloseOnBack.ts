"use client";

import { useEffect, useRef } from "react";

/** The marker our own history entry carries, so we can tell it from a route's. */
const SHEET_STATE_KEY = "dosSheet";

/**
 * The system back gesture closes the sheet that is open, instead of leaving the
 * page under it — the prototype's own rule (DanceOSApp.jsx:19039-19064: "system
 * back / edge-swipe pops one screen — exactly one sentinel entry is kept while
 * a drill page is open"). It matters most inside the Android wrapper, where
 * back is a system gesture rather than a browser button: without this, opening
 * a sheet and swiping back drops the whole screen and the work in it.
 *
 * The caller's contract: call this in any sheet that closes through a function
 * — `useCloseOnBack(onClose)` in a conditionally-mounted sheet component, or
 * `useCloseOnBack(() => setFlag(false), flag)` beside an inline one.
 *
 * The design is the prototype's, deliberately: a module-level stack of open
 * sheets shares ONE history entry, armed when the first sheet opens and
 * re-armed while any remain (19047's "still deep: re-arm"). Back pops the
 * entry and closes the top sheet only.
 *
 * **A button-close leaves the entry where it is — nothing here ever calls
 * `history.back()`.** The first cut "spent" the entry on close, and the
 * happy-path e2e caught what that costs: ClassForm's "Publish it" closes the
 * confirm sheet AND submits, and the spend's popstate made Next's router abort
 * the in-flight redirect to the register — the app simply never left the form.
 * Any programmatic back() races any navigation started in the same
 * interaction. The prototype's comment records the same class of bug ("that
 * double-pushed before, which swallowed the first back press") and its answer
 * is the one taken here: leave the entry, accept that one later back press
 * over it is a visual no-op (same URL), and never fight the router. The
 * disarm is deferred a microtask so a sheet HANDING OVER to another in the
 * same commit (EventPage's confirm step -> payment step) reuses the armed
 * entry instead of pushing a second one.
 *
 * `pushState` is a sanctioned Next.js 16 API and integrates with its router
 * (next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
 * "Native History API"); the URL is deliberately left alone, so a sheet is a
 * moment in the page's history rather than an address of its own.
 */

type Closer = () => void;

/* one stack for the whole app — sheets are global UI, whatever component owns them */
const openSheets: Closer[] = [];
let armed = false;
let releaseScheduled = false;

const stateCarriesSentinel = () => {
  const state = window.history.state as Record<string, unknown> | null;
  return Boolean(state && state[SHEET_STATE_KEY]);
};

const arm = () => {
  window.history.pushState({ [SHEET_STATE_KEY]: true }, "");
  armed = true;
};

function onPop() {
  /* the armed entry was popped by the system back gesture */
  armed = false;
  const close = openSheets.pop();
  if (close) close();
  if (openSheets.length > 0) {
    arm(); // still sheets under it: re-arm, so the next back peels the next one
  } else {
    window.removeEventListener("popstate", onPop);
  }
}

function register(close: Closer) {
  openSheets.push(close);
  if (!armed) {
    /* arm only when the sentinel is not ALREADY the current entry — a sheet
       re-opened right after a button-close (its entry still standing) reuses
       it rather than stacking a second one */
    window.addEventListener("popstate", onPop);
    if (stateCarriesSentinel()) {
      armed = true;
    } else {
      arm();
    }
  }
}

function unregister(close: Closer) {
  const at = openSheets.lastIndexOf(close);
  if (at >= 0) openSheets.splice(at, 1); // absent when back already popped it
  if (openSheets.length === 0 && armed && !releaseScheduled) {
    /* Closed by a button. Release the entry a microtask later, so a successor
       sheet opening in this same React commit (confirm step -> payment step)
       takes the armed entry over instead of pushing its own. NO history call
       happens here — see the header for the navigation race that forbids it. */
    releaseScheduled = true;
    queueMicrotask(() => {
      releaseScheduled = false;
      if (openSheets.length > 0 || !armed) return; // a successor owns it now
      armed = false;
      window.removeEventListener("popstate", onPop);
    });
  }
}

export function useCloseOnBack(onClose: () => void, open: boolean = true) {
  /* the latest onClose without re-arming: a caller passing an inline arrow
     re-renders a new function every time, and re-running the effect on that
     would churn the stack. A ref write during render is what this repo's lint
     forbids (react-hooks/refs), so it happens in its own effect. */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !window.history) return;
    const close = () => closeRef.current();
    register(close);
    return () => unregister(close);
  }, [open]);
}
