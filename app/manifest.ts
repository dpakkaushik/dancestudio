import type { MetadataRoute } from "next";

/** The web app manifest, served at /manifest.webmanifest.
 *
 *  Two things read this. A phone browser reads it to offer "install" and to know
 *  what the installed app is called and looks like. **Bubblewrap reads it to
 *  build the Android APK** — the Trusted Web Activity is generated FROM these
 *  fields, so `name`, `short_name`, the colours and the 512px icon are what end
 *  up on the launcher and the splash screen. Changing them changes the app.
 *
 *  The colours are the app's own dark palette (DOS_PALETTE.dark, via
 *  lib/design/tokens.ts): `background_color` paints the splash screen while the
 *  page loads and `theme_color` paints the Android status bar, so both are
 *  #0A0A0A — the same ground the top bar sits on. Picking white here is what
 *  makes a wrapped app flash white before it opens.
 *
 *  `display: "standalone"` is what makes the APK open without browser chrome.
 *  The icons are generated from the app's own mark by scripts/icons/make-icons.js.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DanceOS",
    short_name: "DanceOS",
    description: "Where India dances — classes, studios, crews, and stages.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    categories: ["education", "social", "sports"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /* Android may crop an adaptive icon to a circle; the maskable art is drawn
         smaller so the crop takes background rather than the mark. */
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
