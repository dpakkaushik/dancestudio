"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_UI } from "@/lib/design/tokens";

/** A PICTURE, FULL SIZE (16 Sep 2026, the user: "show the header picture
 *  section as an image gallery where user can click over a picture and expand
 *  and see it").
 *
 *  The chrome is the prototype's own full-screen viewer (DanceOSApp.jsx
 *  11440-11447): a near-black backdrop, a round ✕ at the top right, the picture,
 *  and a caption under it. Three things depart from it, and each is deliberate:
 *
 *   1. THE FRAME IS RECTANGULAR. The prototype's viewer exists to enlarge an
 *      AVATAR, so it draws a circle. A header picture is not round and cropping
 *      one into a circle to look at it closely would defeat the point.
 *   2. IT OPENS FROM A GRID TILE. The prototype's photo tiles have no onClick
 *      at all — it declares the viewer's state as `null | "avatar" | "cover"`
 *      (8705) and never renders the `"cover"` branch. So this completes a stub
 *      the prototype left rather than inventing a pattern; the backlog records
 *      it either way.
 *   3. IT PAGES. With more than one picture there are ‹ › and the arrow keys,
 *      because a gallery you can only leave and re-enter is a slideshow with
 *      extra steps.
 *
 *  ⚠ IT IS RENDERED AS A SIBLING OF `Sheet`, NEVER A CHILD. Two reasons, both
 *  real: the Sheet's panel carries a transform for the 280 ms of `dosSheetUp`,
 *  which would make it the containing block for anything `position: fixed`
 *  inside it; and both `e2e/happy-path.spec.ts` and `scripts/shots/shoot-hero.js`
 *  scope locators to `getByRole("dialog", { name: "Edit business" })`, so a
 *  dialog nested inside that one makes every such scope ambiguous.
 *
 *  ⚠ AND IT IS PORTALLED TO `document.body`, which is not decoration either.
 *  The Edit sheets open from a pencil that lives in `IdentityHero`'s corner —
 *  `position: absolute, zIndex: 3` — so everything rendered there sits inside a
 *  stacking context at level 3, while `AppChrome`'s top bar is `zIndex: 400` in
 *  the ROOT context. A z-index of 700 inside a context of 3 is still under 400:
 *  the first cut drew the whole viewer beneath the top bar, and the close
 *  button at top-right was the part you could see was wrong — Playwright found
 *  it as "visible, enabled and stable" and then could not click it, because the
 *  bell was on top. The portal takes it out to the root, where 700 means 700.
 *  (The Sheet has the same ancestry and gets away with it only because its
 *  panel is at the BOTTOM of the screen, below the bar.)
 *
 *  `useCloseOnBack` needs no argument beyond the closer: it keeps a LIFO stack
 *  over one history entry, and because this registers after the sheet did, the
 *  system back gesture peels this first and re-arms for the sheet underneath.
 *  No focus trap and no Escape handler — not one dialog in this repo has
 *  either, and being the only one would be inconsistency rather than
 *  accessibility. Never `aria-hidden` on the backdrop: that is the bug the
 *  bottom sheets were fixed for on 24 Aug 2026. */

export interface LightboxShot {
  key: string;
  src: string | null;
  alt: string;
  /** a signed private-bucket URL must bypass the Next optimizer, which would
   *  re-fetch it server-side without the signature and get a 400 */
  signed: boolean;
}

const round: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  border: "1.5px solid rgba(255,255,255,.22)",
  background: "rgba(255,255,255,.12)",
  color: "#fff",
  fontSize: 16,
  lineHeight: 1,
  padding: 0,
  fontFamily: "inherit",
};

export function PhotoLightbox({
  shots,
  index,
  onIndex,
  onClose,
  label,
}: {
  shots: LightboxShot[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  label: string;
}) {
  useCloseOnBack(onClose);
  const many = shots.length > 1;
  const at = Math.min(Math.max(index, 0), Math.max(0, shots.length - 1));
  const shot = shots[at];

  const step = useCallback(
    (by: number) => {
      if (!many) return;
      onIndex((at + by + shots.length) % shots.length);
    },
    [at, many, onIndex, shots.length]
  );

  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, step]);

  /* the portal target is a browser object. There is no hydration risk in
     reading it here: this component is only ever mounted from a press, so the
     server renders nothing of it and there is nothing for a client render to
     disagree with. A `useState` + effect would say the same thing and trip this
     repo's own setState-in-effect rule. */
  if (!shot || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 700,
        background: "rgba(0,0,0,.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
        animation: "dosFadeIn .18s ease",
        fontFamily: DOS_UI,
      }}
    >
      <button type="button" aria-label="Close the picture" onClick={onClose} style={{ ...round, position: "absolute", top: 20, right: 20 }}>
        ✕
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} — picture ${at + 1} of ${shots.length}`}
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: "100%" }}
      >
        {many ? (
          <button type="button" aria-label="Previous picture" onClick={() => step(-1)} style={round}>
            ‹
          </button>
        ) : null}
        {shot.src ? (
          <Image
            src={shot.src}
            alt={shot.alt}
            width={1200}
            height={1200}
            unoptimized={shot.signed}
            style={{ width: "auto", maxWidth: "100%", height: "auto", maxHeight: "74vh", objectFit: "contain", display: "block", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
          />
        ) : (
          <div style={{ padding: "40px 28px", color: "rgba(255,255,255,.7)", fontSize: 12.5, textAlign: "center" }}>
            This picture could not be loaded. Close and reopen the page to sign it again.
          </div>
        )}
        {many ? (
          <button type="button" aria-label="Next picture" onClick={() => step(1)} style={round}>
            ›
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 18, color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 700 }}>
        Picture {at + 1} of {shots.length}
      </div>
    </div>,
    document.body
  );
}
