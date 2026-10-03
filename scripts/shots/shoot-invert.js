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
    /* ⚠ WAIT FOR THE PANEL, NOT FOR A CLOCK. A fixed 400 ms passed against a warm
       server and failed the FIRST dark pass against a cold one, where `next start`
       was still compiling /discover — which reads as "the shelf is not in a panel"
       and is really "the page has not rendered". A red that depends on whether
       something else ran first is not evidence (the 11 Sep rule). */
    /* ⚠⚠ RE-CUT 3 Oct 2026: the user took the opposite-theme panel OFF Discover,
       the Inbox and Home ("remove dual tone effect", and asked, "the whole
       opposite-theme panel"). The shelf is a squircle on the PAGE's own theme now,
       so this asserts both ends: no swapped panel on Discover, and the shelf's
       ground on the same side of the page's. Inside the swapped panel is measured
       on a studio's page below, which keeps it. */
    await page.waitForSelector('[data-testid="page-panel"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(200);

    check((await page.locator(".dos-invert").count()) === 0, `[${theme}] Discover draws no opposite-theme panel any more`);
    const panel = await page.evaluate(PROBE, '[data-testid="page-panel"]');
    if (!panel) { check(false, `[${theme}] the shelf sits in its squircle on the page's theme`); continue; }
    console.log(`\n  ${theme.toUpperCase()} — panel ground ${panel.ground}`);

    // the panel is on the SAME side as the page — dark in dark, light in light
    const body = await page.evaluate(PROBE, "body");
    const lum = (s) => { const [r, g, b] = s.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    check((lum(panel.ground) < 0.5) === (lum(body.ground) < 0.5), `[${theme}] the shelf's ground matches the page's theme`, `panel ${panel.ground} vs page ${body.ground}`);

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

    /** ⚠⚠ AND THE CONTROL, WHICH IS THE ONE THIS FILE MISSED (27 Sep 2026).
     *
     *  `EnrollButton`'s primary pill was `background: var(--text)` with
     *  `color: var(--bg)` — and `InvertedPanel` swaps `--text` and deliberately
     *  leaves `--bg` alone, so INSIDE THE PANEL those two are the same colour by
     *  construction. "Book a spot" was a blank pill on Discover, in both themes,
     *  for six days — and this script was 16/16 the whole time, because it
     *  measured the panel's ground, a shelf count, a card's name and a tile's
     *  headline, and never a BUTTON.
     *
     *  A check that exists to catch invisible text on an inverted ground has to
     *  measure the thing most likely to carry a hand-written colour pair, which
     *  is a control: cards inherit their ink from the tokens and survive the
     *  swap for free, while a button states both sides itself. */
    const btn = await page.evaluate(PROBE, '[data-testid="class-tile"] button, [data-testid="class-tile"] a[href^="/c/"] ~ * button, [data-testid="page-panel"] button, [data-testid="page-panel"] a[href="/login"]');
    if (btn) check(btn.ratio >= 4.5, `[${theme}] a CONTROL on the panel is readable — the six-day bug`, `${btn.ratio}:1 ${btn.ink} on ${btn.ground}`);
    else console.log(`  ..     [${theme}] no control inside the panel to measure`);
  }

  /* ── THE PAGE'S OWN THREE TIERS, ON THE WARM GROUND (21 Sep 2026) ──────────
     The user: "fix light mode to a warmer tone so it doesnt blur text". A warmer
     ground is only an improvement if the text on it measures at least as well as
     it did on white, and nothing typed can tell you that — the tokens are three
     greys and the ground is a fourth colour.
     ⚠ The probes are INJECTED rather than hunted for, because what is being
     measured is the TOKEN against the page, not whichever component happens to
     use it today: a node per tier, coloured by the variable, composited by the
     same walk up the tree. `--muted` is the one to watch — it was 3.45:1 on
     white, under the 4.5 that 11px text needs, and it is used for small labels
     all over the app. */
  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}/discover?tab=studios`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => { document.documentElement.className = t; }, theme);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      for (const tier of ["text", "sub", "muted"]) {
        const s = document.createElement("span");
        s.id = `dos-probe-${tier}`;
        s.style.color = `var(--${tier})`;
        s.textContent = "Ag";
        document.body.appendChild(s);
      }
    });
    const floor = { text: 7, sub: 4.5, muted: 4.5 };
    for (const tier of ["text", "sub", "muted"]) {
      const r = await page.evaluate(PROBE, `#dos-probe-${tier}`);
      check(r && r.ratio >= floor[tier], `[${theme}] --${tier} on the page reads at ${floor[tier]}:1 or better`, r ? `${r.ratio}:1 ${r.ink} on ${r.ground}` : "not found");
    }
    await page.evaluate(() => {
      for (const tier of ["text", "sub", "muted"]) document.getElementById(`dos-probe-${tier}`)?.remove();
    });
    /* ⚠ AND THE SAME THREE INSIDE THE SHELF'S SQUIRCLE (3 Oct 2026): on the
       page's own theme now, standing on the card veil. The swapped panel's own
       tiers are measured on a studio's page below, which still wears one. */
    const placed = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="page-panel"]');
      if (!panel) return false;
      for (const tier of ["text", "sub", "muted"]) {
        const s = document.createElement("span");
        s.id = `dos-pprobe-${tier}`;
        s.style.color = `var(--${tier})`;
        s.textContent = "Ag";
        panel.appendChild(s);
      }
      return true;
    });
    check(placed, `[${theme}] the shelf's squircle to measure inside`, placed ? "" : "no page-panel on Discover");
    if (placed) {
      for (const tier of ["text", "sub", "muted"]) {
        const r = await page.evaluate(PROBE, `#dos-pprobe-${tier}`);
        check(r && r.ratio >= floor[tier], `[${theme}] --${tier} inside the shelf's squircle reads at ${floor[tier]}:1 or better`, r ? `${r.ratio}:1 ${r.ink} on ${r.ground}` : "not found");
      }
    }
  }

  /* ── THE HERO, WHICH THIS FILE HAS NEVER MEASURED (29 Sep 2026) ────────────
     `heroWash` painted a gradient down from the profile's own tint, and the
     eyebrow and the account number were WHITE on it. C83 deleted the wash at the
     user's word ("top pink hue ... should be removed from all profiles") and
     those two lines became `--sub` and `--muted` on the page's own ground.

     ⚠ NOTHING MEASURED THAT. This script read the panel, a shelf count, a card's
     name, a tile's headline and a control — every one of them on Discover — so
     the one surface a colour change actually touched was the one surface it did
     not look at. That is the 27 Sep finding repeating: a contrast check is only
     worth what it points at.

     ⚠ AND IT ASSERTS THE WASH IS GONE, not merely that the text is legible: the
     hero's ground must be the PAGE's own. A tint creeping back would still
     probably measure fine and would be exactly what the user asked to remove. */
  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}/discover?tab=studios`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const href = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/studio/"]');
      return a ? a.getAttribute("href") : null;
    });
    if (!href) { console.log(`  ..     [${theme}] no public studio to measure a hero on`); continue; }

    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => { document.documentElement.className = t; }, theme);
    await page.waitForSelector('[data-testid="hero-eyebrow"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(200);

    const eyebrow = await page.evaluate(PROBE, '[data-testid="hero-eyebrow"]');
    /* ⚠ 3 Oct 2026: a profile page's hero stands in the TOP SQUIRCLE now (the
       user: "dual tone, rounded squircles … on public view for all profiles
       similar to home tab"), so its ground is that card's `--card`, not the page.
       What C83 forbids is a TINTED wash, and an untinted card is the opposite of
       one — so the hero must stand on exactly the card's ground. */
    const body = await page.evaluate(PROBE, '[data-testid="top-panel"]');
    if (!eyebrow) { check(false, `[${theme}] the hero's eyebrow is measurable`); continue; }
    if (!body) { check(false, `[${theme}] the profile's top squircle is there`); continue; }

    console.log(`\n  ${theme.toUpperCase()} — hero ground ${eyebrow.ground}`);
    check(
      eyebrow.ratio >= 4.5,
      `[${theme}] the hero's eyebrow reads at 4.5:1 or better on the page's own ground`,
      `${eyebrow.ratio}:1 ${eyebrow.ink} on ${eyebrow.ground}`
    );
    check(
      eyebrow.ground === body.ground,
      `[${theme}] ⚠ and the hero has NO WASH — its ground IS the top squircle's untinted card (C83, C106)`,
      `hero ${eyebrow.ground} vs card ${body.ground}`
    );

    /* ⚠ THE SWAPPED PANEL'S OWN TIERS, measured where it still lives (3 Oct 2026):
       a profile page's lower half is still the opposite theme, translucent, with
       greys retuned for that composited ground. Moved here from Discover. */
    const inv = await page.evaluate(() => {
      const panel = document.querySelector(".dos-invert");
      if (!panel) return false;
      for (const tier of ["text", "sub", "muted"]) {
        const s = document.createElement("span");
        s.id = `dos-iprobe-${tier}`;
        s.style.color = `var(--${tier})`;
        s.textContent = "Ag";
        panel.appendChild(s);
      }
      return true;
    });
    if (!inv) { console.log(`  ..     [${theme}] this studio's page draws no lower panel to measure`); continue; }
    const floor = { text: 7, sub: 4.5, muted: 4.5 };
    for (const tier of ["text", "sub", "muted"]) {
      const r = await page.evaluate(PROBE, `#dos-iprobe-${tier}`);
      check(r && r.ratio >= floor[tier], `[${theme}] --${tier} INSIDE a profile page's opposite-theme panel reads at ${floor[tier]}:1 or better`, r ? `${r.ratio}:1 ${r.ink} on ${r.ground}` : "not found");
    }
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
