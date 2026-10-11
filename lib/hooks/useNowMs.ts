"use client";

import { useSyncExternalStore } from "react";

/** THE CLOCK FOR A CLIENT COMPONENT, to the minute (11 Oct 2026, B19).
 *  `Date.now()` may not be read in a component body (react-hooks/purity), so it
 *  is read here through `useSyncExternalStore`: null on the server and during
 *  hydration (so the two renders agree), then the minute on the client, ticking
 *  every 30 s. The snapshot is the minute rounded down, so it is stable between
 *  ticks — a snapshot that changed on every call would loop. */
const subscribe = (cb: () => void) => {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
};
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverSnapshot = () => null;

export function useNowMs(): number | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
