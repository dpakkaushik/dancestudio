"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A LIST YOU ARRANGE BY PRESSING A TILE AND DRAGGING IT (11 Oct 2026).
 *
 *  The user: *"the selection of dance styles and rearrangement should be like
 *  pressing on the tiles and dragging them up and down, like a drag and drop and
 *  should be smooth."* It replaces the prototype's ▲▼ pair on every styles list.
 *
 *  ⚠ HOW IT STAYS SMOOTH: nothing is re-ordered while the finger moves. The
 *  dragged tile follows the pointer by a transform, the tiles it passes slide by
 *  ONE tile's height with a short transition, and the list is re-ordered once,
 *  on release — with transitions switched off for that one frame, so the tiles
 *  land where they already are instead of animating back from their old place.
 *
 *  ⚠ A TOUCH IS A SCROLL UNTIL IT HOLDS STILL. On a phone the same finger that
 *  drags a tile also scrolls the sheet, so a touch only becomes a drag after
 *  it has held for HOLD_MS without moving; move first and it is a scroll. Once a
 *  drag starts, a NON-PASSIVE touchmove listener calls preventDefault — iOS does
 *  not reliably honour `touch-action` inside a fixed sheet, which is the same
 *  lesson the profile switcher's swipe taught (2 Oct 2026). A mouse drags after
 *  a few pixels, with no hold.
 *
 *  ⚠ THE KEYBOARD STILL WORKS: each tile carries a grip button named "Move {x}"
 *  that answers ArrowUp / ArrowDown, so the order can be changed without a
 *  pointer at all. */

const HOLD_MS = 160;
const SLOP = 6;

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
  const live = useRef<{ from: number; startY: number; tops: number[]; height: number; pointerId: number; active: boolean; timer: number | null; startX: number } | null>(null);

  /* ⚠ iOS: once a drag is live, stop the page from scrolling under it */
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (live.current?.active) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  const overFor = (dy: number): number => {
    const l = live.current;
    if (!l) return 0;
    const centre = l.tops[l.from] + l.height / 2 + dy;
    let over = l.from;
    for (let i = 0; i < l.tops.length; i++) {
      const top = l.tops[i];
      const bottom = top + (rowRefs.current[i]?.offsetHeight ?? l.height);
      if (centre >= top - gap / 2 && centre <= bottom + gap / 2) over = i;
    }
    if (centre < l.tops[0]) over = 0;
    const last = l.tops.length - 1;
    if (centre > l.tops[last] + (rowRefs.current[last]?.offsetHeight ?? l.height)) over = last;
    return over;
  };

  const begin = () => {
    const l = live.current;
    if (!l) return;
    l.active = true;
    setDragBoth({ from: l.from, dy: 0, over: l.from, height: l.height });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        /* a phone that will not buzz still drags */
      }
    }
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || items.length < 2) return;
    /* a press on a real control inside the tile (Remove, the grip's keys) is that control's */
    const target = e.target as HTMLElement;
    if (target.closest("button:not([data-drag-grip]), a, input, select, textarea")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const tops = rowRefs.current.map((el) => el?.offsetTop ?? 0);
    const height = rowRefs.current[i]?.offsetHeight ?? 44;
    live.current = { from: i, startY: e.clientY, startX: e.clientX, tops, height, pointerId: e.pointerId, active: false, timer: null };
    if (e.pointerType === "touch") {
      /* the element, captured now — a React event's currentTarget is gone by the time a timer fires */
      const el = e.currentTarget;
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
    const dy = e.clientY - l.startY;
    if (!l.active) {
      const moved = Math.abs(dy) > SLOP || Math.abs(e.clientX - l.startX) > SLOP;
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
    const d = dragRef.current;
    if (d) setDragBoth({ ...d, dy, over: overFor(dy) });
  };

  const finish = () => {
    const l = live.current;
    if (l?.timer) window.clearTimeout(l.timer);
    live.current = null;
    const d = dragRef.current;
    setDragBoth(null);
    if (d && d.over !== d.from) {
      const next = [...items];
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
            disabled={disabled || items.length < 2}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                keyMove(i, -1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                keyMove(i, 1);
              }
            }}
            style={{ display: "inline-flex", flexDirection: "column", gap: 3, padding: "6px 4px", background: "none", border: "none", cursor: items.length < 2 ? "default" : "grab", flexShrink: 0, opacity: items.length < 2 ? 0.3 : 0.75 }}
          >
            {[0, 1, 2].map((r) => (
              <span key={r} aria-hidden="true" style={{ display: "block", width: 14, height: 2, borderRadius: 2, background: "currentColor" }} />
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
            data-dragging={dragging ? "true" : undefined}
            style={{
              transform: `translateY(${shiftFor(i)}px)${dragging ? " scale(1.02)" : ""}`,
              transition: dragging || settling ? "none" : "transform .18s ease",
              zIndex: dragging ? 2 : 1,
              position: "relative",
              touchAction: dragging ? "none" : "pan-y",
              userSelect: "none",
              WebkitUserSelect: "none",
              cursor: disabled || items.length < 2 ? "default" : dragging ? "grabbing" : "grab",
              boxShadow: dragging ? "0 10px 26px rgba(0,0,0,.28)" : "none",
              borderRadius: 14,
            }}
          >
            {render(item, grip, dragging)}
          </div>
        );
      })}
    </div>
  );
}
