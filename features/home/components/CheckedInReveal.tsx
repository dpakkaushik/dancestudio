"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** THE LAST BEAT OF A CHECK-IN (2 Oct 2026, the user: *"show the todays
 *  schedule section with some smooth animation with checked in on the class
 *  card. make this one smooth"*).
 *
 *  The QR sheet hands over with `?checkedin=<stamp>` once the door has let you
 *  in. That navigation is also what makes the server read the deck again, so
 *  the card arrives already wearing "✓ Checked in". This only glides Today's
 *  schedule into view, lets it rise, and takes the marker back off the address
 *  (a replace — the marker must not become a history entry that replays the
 *  moment on back). Renders nothing. */
export function CheckedInReveal() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const stamp = params.get("checkedin");

  useEffect(() => {
    if (!stamp) return;
    const el = document.getElementById("today-schedule");
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      if (!reduce) {
        el.animate(
          [
            { transform: "translateY(18px)", opacity: 0.35 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" }
        );
      }
    }
    const t = setTimeout(() => router.replace(pathname, { scroll: false }), 900);
    return () => clearTimeout(t);
  }, [stamp, router, pathname]);

  return null;
}
