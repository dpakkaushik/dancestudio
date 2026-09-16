"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** A MODAL BELONGS AT THE ROOT OF THE DOCUMENT (16 Sep 2026).
 *
 *  `z-index` is only comparable INSIDE one stacking context, and the app's two
 *  Edit sheets open from a pencil that lives in `IdentityHero`'s corner —
 *  `position: absolute, zIndex: 3`. That corner is a stacking context, so
 *  everything rendered from it is stamped "3" no matter what its own z-index
 *  says: the sheet's 600 and the lightbox's 700 both lost to `AppChrome`'s top
 *  bar at 400 and its floating tab bar at 300.
 *
 *  What that cost was not theoretical. On a TAB page — anyone's own Home — the
 *  tab bar painted over the bottom of the Edit-profile sheet, which is where
 *  Save and Cancel are: the sheet opened, and its two buttons could not be
 *  pressed. It went unnoticed because the shot script wrapped that press in a
 *  `.catch(() => {})` and moved on. A studio's own home is a drill page with no
 *  tab bar, which is why the same sheet worked there and only there.
 *
 *  Portalling to `document.body` puts the sheet back in the root context, where
 *  600 means 600. Nothing about the React tree changes — state, context and
 *  event bubbling all still flow through the component that rendered it — so
 *  `getByRole("dialog", …)` finds exactly what it found before. */
export function Portal({ children }: { children: ReactNode }) {
  /* the target is a browser object, and these sheets only ever mount from a
     press, so the server renders nothing of them and there is nothing for a
     client render to disagree with. (A `useState` + effect would say the same
     and trip this repo's own setState-in-effect rule.) */
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
