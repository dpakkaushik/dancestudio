"use client";

import { useEffect } from "react";

/** A TAP THAT IS FELT (12 Oct 2026, the user: "make the app haptic for all
 *  clicks toggles everything").
 *
 *  ONE listener for the whole app, in the capture phase, so every control — a
 *  button, a link, a switch, a tab, a chip, a checkbox — gets the same short tick
 *  without a single component having to remember to ask for it.
 *
 *  ⚠ TWO ENGINES, because the platforms disagree. Android's browsers (and the
 *  installed TWA) answer `navigator.vibrate`. iOS Safari has no vibrate at all,
 *  and since iOS 18 the ONE thing that makes the Taptic Engine fire from a web
 *  page is toggling a native `<input type="checkbox" switch>` — so a hidden one
 *  is kept on the page and its label is clicked inside the user's own gesture.
 *  Anything else (a laptop) silently does nothing, which is the right answer.
 *
 *  ⚠ The hidden label's own click bubbles through this same listener, so a flag
 *  stops it ticking itself; and two ticks closer than 35 ms collapse into one, so
 *  a press that lands on a label AND its control is felt once. */
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], [role="radio"], [role="checkbox"], input[type="checkbox"], input[type="radio"], select, summary, label';

/** ⚠ the iOS engine toggles a real checkbox, and doing that while somebody is
 *  typing could take the focus — and the keyboard — away from their field */
const isTyping = () => {
  const a = document.activeElement;
  return a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(a.type)) || (a instanceof HTMLElement && a.isContentEditable);
};

export function Haptics() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canVibrate = typeof navigator.vibrate === "function";
    let label: HTMLLabelElement | null = null;
    if (!canVibrate) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
    }
    let self = false;
    let last = 0;
    const onClick = (e: MouseEvent) => {
      if (self) return;
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const el = target.closest(CONTROL);
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      const now = performance.now();
      if (now - last < 35) return;
      last = now;
      try {
        if (canVibrate) {
          navigator.vibrate(8);
        } else if (label && !isTyping()) {
          self = true;
          label.click();
          self = false;
        }
      } catch {
        self = false;
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      label?.remove();
    };
  }, []);
  return null;
}
