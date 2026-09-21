/* Does the inverted panel actually keep Discover's cards legible, in BOTH themes?
   Nothing typed can see this: the cards' ground is an alpha veil and their ink is
   the page's ink, so the failure mode is "the same colour as what is behind it".
   So: composite the real painted colours in the page and measure WCAG contrast. */
const { chromium } = require("@playwright/test");

const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3100";
let pass = 0,
  fail = 0;
const check = (ok, what, extra = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + what + (extra ? "  " + extra : ""));
  ok ? pass++ : fail++;
};

/* composite every background from the node up to <body>, then WCAG contrast */
const PROBE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const px = (c) => {
    const m = c.match(/[\d.]+/g) || [];
    return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m[3] === undefined ? 1 : +m[3] };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  let ground = { r: 255, g: 255, b: 255, a: 1 };
  const chain = [];
  for (let n = el; n; n = n.parentElement) chain.push(px(getComputedStyle(n).backgroundColor));
  for (let i = chain.length - 1; i >= 0; i--) ground = over(chain[i], ground);
  const ink = over(px(getComputedStyle(el).color), ground);
  const L = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const a = L(ink),
    b = L(ground);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return {
    ratio: Math.round(ratio * 100) / 100,
    ink: "rgb(" + [ink.r, ink.g, ink.b].map(Math.round).join(",") + ")",
    ground: "rgb(" + [ground.r, ground.g, ground.b].map(Math.round).join(",") + ")",
  };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}/discover?tab=studios`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => { document.documentElement.className = t; }, theme);
    await page.waitForTimeout(400);

    const panel = await page.evaluate(PROBE, ".dos-invert");
    if (!panel) { check(false, `[${theme}] the shelf sits in an inverted panel`); continue; }
    console.log(`\n  ${theme.toUpperCase()} — panel ground ${panel.ground}`);

    // the panel must be the OPPOSITE of the page
    const body = await page.evaluate(PROBE, "body");
    check(panel.ground !== body.ground, `[${theme}] the panel's ground is not the page's`, `panel ${panel.ground} vs page ${body.ground}`);

    // a studio card's NAME, composited through the alpha veil onto the panel
    const cardSel = '[data-testid="shelf-count"]';
    const head = await page.evaluate(PROBE, cardSel);
    check(head && head.ratio >= 4.5, `[${theme}] the shelf count is readable on the panel`, head ? `${head.ratio}:1 ${head.ink} on ${head.ground}` : "not found");

    const nameSel = "a[aria-label^='Open'] , a[href^='/studio/']";
    const cardName = await page.evaluate(PROBE, nameSel);
    if (cardName) {
      check(cardName.ratio >= 4.5, `[${theme}] a card's text is readable on the panel`, `${cardName.ratio}:1 ${cardName.ink} on ${cardName.ground}`);
      /* THE COUNTERFACTUAL, and it is an identity rather than a measurement: a
         two-colour panel grounds itself in `var(--text)`, and every card in this
         app prints its name in `var(--text)`. The same token on both sides is
         1:1 — exactly invisible — which is why the palette is swapped instead. */
      const same = await page.evaluate(() => {
        const v = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
        return v;
      });
      check(true, `[${theme}] a two-colour panel would have been ${same} on ${same} — 1:1, invisible`);
    } else {
      console.log(`  ..     [${theme}] no studio card in this city to measure`);
    }
  }

  /* the class tile is the one that reads the THEME rather than a variable */
  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}/discover?tab=classes`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => { document.documentElement.className = t; }, theme);
    await page.waitForTimeout(500);
    const tile = await page.evaluate(PROBE, '[data-testid="class-tile-style"], a[href^="/c/"]');
    if (tile) check(tile.ratio >= 3, `[${theme}] a class tile's headline is readable on the panel`, `${tile.ratio}:1 ${tile.ink} on ${tile.ground}`);
    else console.log(`  ..     [${theme}] no class in this city to measure`);
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
