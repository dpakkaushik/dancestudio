/* Renders the app icons from the app's OWN mark, so the launcher icon and the
 * mark in the top bar are the same drawing rather than two guesses at a logo.
 *
 * The source is DosMark (features/shell/components/AppChrome.tsx:16-48, itself
 * lifted from prototype/DanceOSApp.jsx:1614-1628): the dark gradient tile, the
 * two arcs in pink -> violet -> cyan, and the pink dot.
 *
 * Run:  NODE_PATH=$(pwd)/node_modules node scripts/icons/make-icons.js
 * Out:  public/icon-192.png, public/icon-512.png,
 *       public/icon-maskable-512.png, public/apple-touch-icon.png
 *
 * Why Playwright rather than an image library: it is already a dependency (the
 * e2e suite), so this adds nothing to install, and the icon is drawn by the same
 * engine that draws the real mark on the real screen.
 */

const path = require("path");
const fs = require("fs");
/* the repo depends on @playwright/test, which re-exports the browsers; there is
   no bare `playwright` package installed here */
const { chromium } = require("@playwright/test");

const OUT_DIR = path.join(__dirname, "..", "..", "public");

/** The mark, at a given fraction of the canvas. `pad` is the maskable safe zone:
 *  Android may crop an adaptive icon to a circle, so a maskable icon keeps its
 *  art well inside the square and lets the background take the crop. */
const page = (size, markFraction) => {
  const mark = Math.round(size * markFraction);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
  .tile{
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(145deg,#1B1030,#0C0714);
  }
</style></head>
<body>
  <div class="tile">
    <svg width="${mark}" height="${mark}" viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="dm" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stop-color="#EC4899"/>
          <stop offset=".55" stop-color="#A855F7"/>
          <stop offset="1" stop-color="#5AC8FA"/>
        </linearGradient>
      </defs>
      <path d="M24.8 7.2A12.4 12.4 0 1 0 27.5 20" stroke="url(#dm)" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M9.6 22.6a8 8 0 1 1 11.2-1.4" stroke="url(#dm)" stroke-width="3.2" stroke-linecap="round" opacity=".62"/>
      <circle cx="26.4" cy="6.2" r="3.5" fill="#EC4899"/>
    </svg>
  </div>
</body></html>`;
};

/* fraction of the canvas the mark occupies: generous for a normal icon, pulled
   in for the maskable one so a circular crop cannot clip the arc or the dot */
const TARGETS = [
  { file: "icon-192.png", size: 192, fraction: 0.62 },
  { file: "icon-512.png", size: 512, fraction: 0.62 },
  { file: "icon-maskable-512.png", size: 512, fraction: 0.46 },
  { file: "apple-touch-icon.png", size: 180, fraction: 0.62 },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const { file, size, fraction } of TARGETS) {
      const ctx = await browser.newContext({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      const p = await ctx.newPage();
      await p.setContent(page(size, fraction), { waitUntil: "load" });
      const out = path.join(OUT_DIR, file);
      await p.screenshot({ path: out, omitBackground: false });
      await ctx.close();
      const { size: bytes } = fs.statSync(out);
      console.log(`wrote ${file}  ${size}x${size}  ${bytes} bytes`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
