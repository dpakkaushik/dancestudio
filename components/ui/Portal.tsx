"use client";

import { useSyncExternalStore, type ReactNode } from "react";
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
 *  `getByRole("dialog", …)` finds exactly what it found before.
 *
 *  ⚠ NOTHING UNTIL HYDRATION IS DONE (26 Sep 2026). The first cut rendered null
 *  on the server (`typeof document === "undefined"`) and the portal on the
 *  client — which is fine for a sheet that mounts from a press, and a HYDRATION
 *  MISMATCH for one that is open in the first HTML: a deep link to `?new=1` or
 *  `?edit=1` (C54's sheets, the Edit-details sheet) rendered `<Suspense>` on the
 *  server where the client drew the scrim `<div>`, React #418, and the tree was
 *  thrown away and regenerated — a flash, and a page error `shoot-tiles` counts
 *  as red. `useSyncExternalStore` with a false SERVER snapshot is the sanctioned
 *  shape (the theme reads the `<html>` class the same way): hydration sees
 *  nothing on both sides, and the portal mounts on the re-render straight
 *  after, with no state written in an effect. */
const subscribe = () => () => {};
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
