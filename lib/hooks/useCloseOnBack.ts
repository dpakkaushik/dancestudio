"use client";

import { useEffect, useRef } from "react";

/** The marker our own history entry carries, so we can tell it from a route's. */
const SHEET_STATE_KEY = "dosSheet";

/**
 * The system back gesture closes the sheet that is open, instead of leaving the
 * page under it — the prototype's own rule (DanceOSApp.jsx:19039-19064: "system
 * back / edge-swipe pops one screen"). It matters most inside the Android
 * wrapper, where back is a system gesture rather than a browser button: without
 * this, opening a sheet and swiping back drops the whole screen and the work
 * in it.
 *
 * The caller's contract: `useCloseOnBack(onClose)` in a conditionally-mounted
 * sheet component, or `useCloseOnBack(() => setFlag(false), flag)` beside an
 * inline one.
 *
 * REWRITTEN 19 Sep 2026 — the user: "back button / swipe issues, page keeps on
 * looping at times". The first design shared ONE history entry between every
 * open sheet and, on a button-close, LEFT IT STANDING (a programmatic back had
 * once raced a redirect). Left standing, every sheet opened and closed by its
 * button was one more same-URL entry, so back "did nothing" once per sheet,
 * and a closer that navigated (Settings) replaced the wrong entry and bounced
 * between two pages. Three rules now:
 *
 *  1. EVERY SHEET HAS ITS OWN ENTRY, pushed when it opens (a numbered token in
 *     `history.state`). Back pops exactly one entry and closes exactly the
 *     sheet that owns it; nested sheets peel one at a time with no re-arming
 *     from inside the popstate handler.
 *  2. A BUTTON-CLOSE SPENDS ITS ENTRY: if the sheet's entry is still the
 *     current one when it closes, one `history.back()` takes it out, and the
 *     popstate that follows is swallowed here (Next's router still gets it and
 *     treats it as a same-URL traverse, which is cheap). It is deferred by a
 *     microtask so a successor sheet opening in the same commit (the event
 *     page's confirm step → payment step) ADOPTS the entry instead of the app
 *     going back and forward in one tick. A sheet whose close is followed by a
 *     navigation in the same interaction passes `{ spend: false }` — a back()
 *     there would race the router and cancel the navigation — and the entry it
 *     leaves is handled by rule 3. A closer that NAVIGATES should navigate
 *     instead of closing: the route change unmounts the sheet, and by then the
 *     current entry is the new route's, so nothing is spent.
 *  3. AN ORPHANED ENTRY IS SKIPPED. Two shapes, both real (the first was found
 *     by probing a real browser: after a `spend: false` close the orphan is the
 *     entry you are STANDING ON, so the next back lands on the page's own
 *     same-URL entry — a visual no-op). (a) Standing on one: the close records
 *     it (`orphan`), and the first popstate that follows — while no sheet is
 *     open and the entry landed on carries no token — goes back once more, on
 *     its own; any pushState/replaceState in between (a Link, a redirect, Show
 *     results) forgets it, because the entry is then a page of its own. (b)
 *     Landing on one: a back press that arrives ON one of our entries while no
 *     sheet is open (left behind a route that pushed over it) goes back once
 *     more. Either way the person pressed back once and moved once.
 *
 * `pushState` is a sanctioned Next.js 16 API: the router copies its own
 * internal state onto the entry we push and answers the popstate with a
 * traverse to the same URL (app-router.js, `copyNextJsInternalHistoryState` /
 * `onPopState`). The URL is deliberately left alone, so a sheet is a moment in
 * the page's history rather than an address of its own.
 */

type Closer = () => void;
interface Entry {
  token: number;
  close: Closer;
}

/* one stack for the whole app — sheets are global UI, whatever component owns them */
const stack: Entry[] = [];
let seq = 0;
let listening = false;
/** popstates this module caused itself (a spend) and must not act on */
let swallow = 0;
/** an entry a button-close is about to spend — a successor sheet may adopt it first */
let pendingSpend: number | null = null;
/** the entry we are STANDING ON after a `spend: false` close — rule 3(a): its
 *  token and its URL. The URL is the tell: the page's own entry beneath it has
 *  the SAME URL (the sheet's entry copied it), while an entry a replace turned
 *  into a page of its own (Show results) has a different one. */
let orphan: { token: number; href: string } | null = null;

const tokenOf = (state: unknown): number | null => {
  const v = state && typeof state === "object" ? (state as Record<string, unknown>)[SHEET_STATE_KEY] : null;
  return typeof v === "number" ? v : null;
};

function onPop(e: PopStateEvent) {
  if (swallow > 0) {
    swallow -= 1;
    return;
  }
  const leftOrphan = orphan;
  orphan = null;
  const landed = tokenOf(e.state);
  const top = stack[stack.length - 1];
  if (top) {
    /* forward onto the open sheet's own entry (rare): nothing to close */
    if (landed === top.token) return;
    stack.pop();
    top.close();
    return;
  }
  /* rule 3(b): no sheet open and we LANDED on one of our entries — skip it */
  if (landed != null) {
    swallow += 1;
    window.history.back();
    return;
  }
  /* rule 3(a): we just LEFT the orphan we were standing on and landed on the
     page's own same-URL entry — one more step is the one the person meant. A
     different URL means the entry had become a page of its own (a replace
     turned it into the results list), and the step just taken was the real one. */
  if (leftOrphan && window.location.href === leftOrphan.href) {
    swallow += 1;
    window.history.back();
  }
}

function listen() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", onPop);
  /* a PUSH moves us off the entry we stand on — a Link, a redirect — so it is
     no orphan any more (a replace is judged by the URL instead: Next's own
     history sync replaces state on every traverse, so it cannot be the signal) */
  const h = window.history;
  const push = h.pushState.bind(h);
  const replace = h.replaceState.bind(h);
  h.pushState = (data, unused, url) => {
    orphan = null;
    return push(data, unused, url);
  };
  /* a replace that CHANGES the URL (Show results, a router.replace) has made
     the entry a page of its own; one that keeps it (Next's sync on a traverse)
     has not — the URL, not the call, is the tell */
  h.replaceState = (data, unused, url) => {
    if (url != null && new URL(String(url), window.location.href).href !== window.location.href) orphan = null;
    return replace(data, unused, url);
  };
  listening = true;
  /* a read-only window on the module's state, for the browser probes and the suite */
  Object.defineProperty(window, "__dosSheets", {
    configurable: true,
    get: () => ({ orphan, stack: stack.length, swallow, pendingSpend }),
  });
}

function register(close: Closer): number {
  listen();
  /* a successor opening in the commit that closed its predecessor takes over
     the entry that was about to be spent (confirm step -> payment step) */
  if (pendingSpend != null && tokenOf(window.history.state) === pendingSpend) {
    const token = pendingSpend;
    pendingSpend = null;
    stack.push({ token, close });
    return token;
  }
  const token = ++seq;
  window.history.pushState({ [SHEET_STATE_KEY]: token }, "");
  stack.push({ token, close });
  return token;
}

function unregister(token: number, spend: boolean) {
  const at = stack.findIndex((e) => e.token === token);
  if (at < 0) return; // back already popped it (rule 1) — nothing to spend
  stack.splice(at, 1);
  if (tokenOf(window.history.state) !== token) return; // the route moved on: nothing to spend, nothing orphaned
  if (!spend) {
    orphan = { token, href: window.location.href }; // rule 3(a): we are standing on it
    return;
  }
  pendingSpend = token;
  queueMicrotask(() => {
    if (pendingSpend !== token) return; // adopted by a successor
    pendingSpend = null;
    if (tokenOf(window.history.state) !== token) return;
    swallow += 1;
    window.history.back();
  });
}

export function useCloseOnBack(onClose: () => void, open: boolean = true, opts: { spend?: boolean } = {}) {
  const spend = opts.spend !== false;
  /* the latest onClose without re-registering: a caller passing an inline arrow
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
    const token = register(() => closeRef.current());
    return () => unregister(token, spend);
  }, [open, spend]);
}
