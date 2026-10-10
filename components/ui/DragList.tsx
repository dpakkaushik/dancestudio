"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A LIST YOU ARRANGE BY PRESSING A TILE AND DRAGGING IT (11 Oct 2026).
 *
 *  The user: *"the selection of dance styles and rearrangement should be like
 *  pressing on the tiles and dragging them up and down, like a drag and drop and
 *  should be smooth."* It replaces the prototype's ▲▼ pair on every styles list.
 *
 *  ⚠ RE-CUT 10 Oct 2026 (the user: *"dance style reorder drag drop not working
 *  when picking and dragging in between 2 tiles in middle — bigger tiles to hold
 *  and drop"*). Three real faults, all fixed here:
 *   1. **The list locked itself while a save was out.** Callers pass the save's
 *      `pending` as `disabled`, so the second drag in a row was silently ignored
 *      for the length of a round trip. Every caller is optimistic, so the list
 *      no longer locks: a drag is always a drag.
 *   2. **The drop slot was decided by EDGES, not midpoints.** A tile became the
 *      target the moment the dragged tile's centre touched its border, so a tile
 *      released "in between two" landed one slot early or late depending on which
 *      border it had last brushed. The slot is now the number of neighbours whose
 *      MIDPOINT the dragged centre has passed — the rule every phone list uses.
 *   3. **A long list could not be dragged past what the sheet showed.** Holding
 *      the tile near the sheet's top or bottom edge now scrolls it, and the drag
 *      follows the scroll.
 *
 *  ⚠ HOW IT STAYS SMOOTH: nothing is re-ordered while the finger moves. The
 *  dragged tile follows the pointer by a transform, the tiles it passes slide by
 *  ONE tile's height with a short transition, and the list is re-ordered once,
 *  on release — with transitions switched off for that one frame, so the tiles
 *  land where they already are instead of animating back from their old place.
 *
 *  ⚠ A TOUCH ON THE TILE IS A SCROLL UNTIL IT HOLDS STILL (HOLD_MS); a touch on
 *  the GRIP drags at once — the grip is a 44px target with `touch-action: none`,
 *  so the handle never fights the sheet's scroll. Once a drag starts, a
 *  NON-PASSIVE touchmove listener calls preventDefault — iOS does not reliably
 *  honour `touch-action` inside a fixed sheet (the 2 Oct 2026 lesson).
 *
 *  ⚠ THE KEYBOARD STILL WORKS: each grip is a button named "Move {x}" that
 *  answers ArrowUp / ArrowDown. */

const HOLD_MS = 180;
const SLOP = 6;
const EDGE = 56;

type Live = {
  from: number;
  startY: number;
  startX: number;
  tops: number[];
  heights: number[];
  pointerId: number;
  active: boolean;
  timer: number | null;
  scroller: HTMLElement | null;
  startScroll: number;
  lastY: number;
};

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return null;
}

export function DragList<T>({
  items,
  keyOf,
  nameOf,
  render,
  onReorder,
  gap = 8,
  disabled = false,
}: {
  items: T[];
  keyOf: (item: T) => string;
  /** the words a grip button and a screen reader use for this item */
  nameOf: (item: T) => string;
  /** the tile's own content; `grip` is the handle to put somewhere visible */
  render: (item: T, grip: ReactNode, dragging: boolean) => ReactNode;
  onReorder: (next: T[]) => void;
  gap?: number;
  /** only for a list that genuinely cannot change — never a save in flight */
  disabled?: boolean;
}) {
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [drag, setDrag] = useState<{ from: number; dy: number; over: number; height: number } | null>(null);
  const [settling, setSettling] = useState(false);
  /* the drag as the handlers last set it — read on release, so the drop runs
     once and outside a state updater (React may call an updater twice) */
  const dragRef = useRef<{ from: number; dy: number; over: number; height: number } | null>(null);
  const setDragBoth = (d: { from: number; dy: number; over: number; height: number } | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const live = useRef<Live | null>(null);
  const raf = useRef<number | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /* ⚠ iOS: once a drag is live, stop the page from scrolling under it */
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (live.current?.active) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("touchmove", stop);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const can = !disabled && items.length > 1;

  /* the slot: how many neighbours' MIDPOINTS the dragged centre has passed */
  const overFor = (dy: number): number => {
    const l = live.current;
    if (!l) return 0;
    const centre = l.tops[l.from] + l.heights[l.from] / 2 + dy;
    let over = l.from;
    for (let i = l.from + 1; i < l.tops.length; i++) {
      if (centre > l.tops[i] + l.heights[i] / 2) over = i;
      else break;
    }
    for (let i = l.from - 1; i >= 0; i--) {
      if (centre < l.tops[i] + l.heights[i] / 2) over = i;
      else break;
    }
    return over;
  };

  const dyNow = () => {
    const l = live.current;
    if (!l) return 0;
    const scrolled = l.scroller ? l.scroller.scrollTop - l.startScroll : 0;
    return l.lastY - l.startY + scrolled;
  };

  const repaint = () => {
    const d = dragRef.current;
    if (!d) return;
    const dy = dyNow();
    setDragBoth({ ...d, dy, over: overFor(dy) });
  };

  /* holding near the scroller's edge scrolls it, a little faster the closer you are */
  const edgeLoop = () => {
    raf.current = null;
    const l = live.current;
    if (!l?.active || !l.scroller) return;
    const r = l.scroller.getBoundingClientRect();
    let v = 0;
    if (l.lastY < r.top + EDGE) v = -Math.ceil(((r.top + EDGE - l.lastY) / EDGE) * 14);
    else if (l.lastY > r.bottom - EDGE) v = Math.ceil(((l.lastY - (r.bottom - EDGE)) / EDGE) * 14);
    if (v !== 0) {
      const before = l.scroller.scrollTop;
      l.scroller.scrollTop = before + v;
      if (l.scroller.scrollTop !== before) repaint();
      raf.current = requestAnimationFrame(edgeLoop);
    }
  };
  const kickEdge = () => {
    if (raf.current == null) raf.current = requestAnimationFrame(edgeLoop);
  };

  const begin = () => {
    const l = live.current;
    if (!l) return;
    l.active = true;
    setDragBoth({ from: l.from, dy: 0, over: l.from, height: l.heights[l.from] });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        /* a phone that will not buzz still drags */
      }
    }
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!can) return;
    const target = e.target as HTMLElement;
    const onGrip = !!target.closest("[data-drag-grip]");
    /* a press on a real control inside the tile (Remove) is that control's */
    if (!onGrip && target.closest("button, a, input, select, textarea")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rows = rowRefs.current.slice(0, items.length);
    const tops = rows.map((el) => el?.offsetTop ?? 0);
    const heights = rows.map((el) => el?.offsetHeight ?? 52);
    const scroller = scrollParent(e.currentTarget);
    live.current = {
      from: i,
      startY: e.clientY,
      startX: e.clientX,
      lastY: e.clientY,
      tops,
      heights,
      pointerId: e.pointerId,
      active: false,
      timer: null,
      scroller,
      startScroll: scroller?.scrollTop ?? 0,
    };
    const el = e.currentTarget;
    if (onGrip) {
      /* the handle drags at once, finger or mouse */
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* still follows the moves */
      }
      begin();
      return;
    }
    if (e.pointerType === "touch") {
      /* the element, captured now — a React event's currentTarget is gone by the time a timer fires */
      live.current.timer = window.setTimeout(() => {
        if (live.current && !live.current.active) {
          try {
            el.setPointerCapture(live.current.pointerId);
          } catch {
            /* the pointer may already be gone; the drag still follows the moves */
          }
          begin();
        }
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const l = live.current;
    if (!l || e.pointerId !== l.pointerId) return;
    l.lastY = e.clientY;
    if (!l.active) {
      const moved = Math.abs(e.clientY - l.startY) > SLOP || Math.abs(e.clientX - l.startX) > SLOP;
      if (e.pointerType === "touch") {
        /* moved before the hold — it was a scroll, not a drag */
        if (moved) {
          if (l.timer) window.clearTimeout(l.timer);
          live.current = null;
        }
        return;
      }
      if (!moved) return;
      e.currentTarget.setPointerCapture(l.pointerId);
      begin();
    }
    e.preventDefault();
    repaint();
    kickEdge();
  };

  const finish = () => {
    const l = live.current;
    if (l?.timer) window.clearTimeout(l.timer);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    live.current = null;
    const d = dragRef.current;
    setDragBoth(null);
    if (d && d.over !== d.from) {
      const next = [...itemsRef.current];
      const [moved] = next.splice(d.from, 1);
      next.splice(d.over, 0, moved);
      setSettling(true);
      onReorder(next);
      requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    }
  };

  const shiftFor = (i: number): number => {
    if (!drag) return 0;
    const step = drag.height + gap;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -step;
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return step;
    return 0;
  };

  const keyMove = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap, position: "relative" }} data-testid="drag-list">
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        const grip = (
          <button
            type="button"
            data-drag-grip=""
            aria-label={`Move ${nameOf(item)} — drag, or use the arrow keys`}
            disabled={!can}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                keyMove(i, -1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                keyMove(i, 1);
              }
            }}
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              width: 44,
              height: 44,
              padding: 0,
              background: "none",
              border: "none",
              cursor: !can ? "default" : dragging ? "grabbing" : "grab",
              flexShrink: 0,
              opacity: !can ? 0.3 : 0.8,
              color: "inherit",
              touchAction: "none",
            }}
          >
            {[0, 1, 2].map((r) => (
              <span key={r} aria-hidden="true" style={{ display: "block", width: 18, height: 2.5, borderRadius: 2, background: "currentColor" }} />
            ))}
          </button>
        );
        return (
          <div
            key={keyOf(item)}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onContextMenu={(e) => {
              /* a long press on a phone opens no menu over the tile being dragged */
              if (live.current) e.preventDefault();
            }}
            data-dragging={dragging ? "true" : undefined}
            style={{
              transform: `translateY(${shiftFor(i)}px)${dragging ? " scale(1.03)" : ""}`,
              transition: dragging || settling ? "none" : "transform .18s ease",
              zIndex: dragging ? 3 : 1,
              position: "relative",
              touchAction: dragging ? "none" : "pan-y",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              cursor: !can ? "default" : dragging ? "grabbing" : "grab",
              boxShadow: dragging ? "0 14px 30px rgba(0,0,0,.32)" : "none",
              borderRadius: 16,
              opacity: drag && !dragging ? 0.92 : 1,
            }}
          >
            {render(item, grip, dragging)}
          </div>
        );
      })}
    </div>
  );
}
