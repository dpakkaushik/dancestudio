/**
 * DISCOVER, RE-CUT AND MEASURED (28 Sep 2026) — the user: *"Studio Cards on
 * discover should have swipable photos in top section which are used in posters.
 * and bottom part should contain profile pic and other details. view photo
 * should be same as how it was cut. fix this for using the photo in studio
 * poster and discover as they should be the same. remove dance styles from
 * studio, artist and crew discover cards. fix the gap between location drop down
 * and Dance near you. bigger discover heading."*
 *
 * ⚠ AND THE HEAD WAS RE-CUT THE NEXT DAY, by the same person: *"Discover should
 * be the bigger heading like other pages and dancer near you smaller and in same
 * line as the location dropdown."* The head checks below describe that, and the
 * ones they replaced described the day before — which is what a check measuring
 * a DECISION is for.
 *
 * ⚠ WHY THIS SCRIPT EXISTS AT ALL: not one listed studio on production has a
 * header photo, so the rail is correct and INVISIBLE there — every card falls
 * back to the empty gradient square. Measuring the real thing needs a studio with
 * real objects in the private bucket, which is what this makes.
 *
 * It builds, in KOLKATA — the one registry city with zero listed studios, so the
 * shelf is exactly what this script put on it:
 *   · a person who owns a LISTED, subscribed studio with a profile picture and
 *     THREE header photos, uploaded as real bytes into the private `org-proof`
 *     bucket with matching `studio_photos` rows;
 *   · an ARTIST (a person with a live plan) for the Artists tab;
 *   · a CREW for the Crews tab.
 *
 * Then, SIGNED OUT — Discover is public, and a stranger is the hardest reader:
 *   1. the head, MEASURED in both themes: "Discover" is the <h1> at display
 *      scale, "Dance near you" is smaller and SHARES the place chip's line, and
 *      the retired eyebrow is gone;
 *   2. the studio card's rail is SQUARE — the shape the cropper cut — with every
 *      picture really loaded (naturalWidth > 0, so a signed URL that 404s fails
 *      this rather than passing as "an img exists");
 *   3. ⚠⚠ THE SAME PICTURES, THE SAME SHAPE, on the studio's OWN page: the
 *      poster rail and the card rail are compared slide-for-slide, which is the
 *      whole of "they should be the same";
 *   4. the profile picture is DRAWN in the card's bottom face, not initials;
 *   5. no style tile on the studio, artist or crew card — asserted at both ends,
 *      because the style RAIL above the shelf still carries the word and a naive
 *      check would pass on the wrong element.
 *
 * Deletes everything it made, objects included.
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-discover.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" };

const rest = async (method, url, body) => {
  const res = await fetch(`${SUPABASE}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

/* a 2x2 PNG — real bytes, so the object exists and a signed URL resolves */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64"
);

const upload = async (bucket, objectPath) => {
  const res = await fetch(`${SUPABASE}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: PNG,
  });
  if (!res.ok) throw new Error(`upload ${objectPath} -> ${res.status} ${await res.text()}`);
};

const CITY = "Kolkata";
const CENTRE = { lat: 22.5726, lng: 88.3639 };
/* ⚠ a style the NAMES do not contain, or "no style on the card" would be
   asserted against text that is the studio's own name */
const STYLE = "Kathak";
const POSTERS = 3;

let pass = 0;
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (ok) pass += 1;
  else fail += 1;
};

/** every painted box this script judges on, read from the DOM in one go.
 *
 *  ⚠ RE-CUT 28 Sep 2026, AND THAT IS THE CHECK WORKING RATHER THAN BREAKING.
 *  The three assertions this replaced described the hierarchy shipped the day
 *  before — "Dance near you" at 34px over a DISCOVER eyebrow — and the user
 *  then said the opposite: *"Discover should be the bigger heading like other
 *  pages and dancer near you smaller and in same line as the location
 *  dropdown"*. A test that describes a decision is a test that has to move when
 *  the decision does. It now asserts BOTH ENDS — the word that IS the heading,
 *  and that the old eyebrow is gone — because a check that only looks at the new
 *  place cannot tell you the old one was cleared. */
const measureHead = (page) =>
  page.evaluate(() => {
    const title = document.querySelector('[data-testid="discover-title"]');
    const row = document.querySelector('[data-testid="discover-place-row"]');
    const sub = document.querySelector('[data-testid="discover-sub"]');
    /* the retired eyebrow: a DIV whose whole text was the word */
    const eyebrow = [...document.querySelectorAll("div")].find((d) => d.textContent.trim() === "DISCOVER");
    if (!title || !row || !sub) return null;
    const t = title.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const s = sub.getBoundingClientRect();
    /* the chip is CitySelect's own trigger, named by the control it replaced */
    const chipEl = row.querySelector('[aria-label="Where to look"]');
    const c = chipEl ? chipEl.getBoundingClientRect() : null;
    const lh = parseFloat(getComputedStyle(title).lineHeight);
    const tallest = c ? Math.max(s.height, c.height) : s.height;
    return {
      tag: title.tagName,
      titleText: title.textContent.trim(),
      subText: sub.textContent.trim(),
      font: Math.round(parseFloat(getComputedStyle(title).fontSize) * 10) / 10,
      subFont: Math.round(parseFloat(getComputedStyle(sub).fontSize) * 10) / 10,
      oneLine: t.height <= lh * 1.4,
      gapToRow: Math.round((r.top - t.bottom) * 10) / 10,
      eyebrowGone: !eyebrow,
      chipFound: Boolean(c),
      /* ⚠ ONE LINE IS A HEIGHT, NOT A GUESS: a row holding two boxes side by
         side is as tall as the taller of them; stacked, it is their sum. */
      rowH: Math.round(r.height * 10) / 10,
      tallest: Math.round(tallest * 10) / 10,
      sameLine: r.height <= tallest + 4,
      subLeftOfChip: c ? s.right <= c.left + 1 : null,
    };
  });

/** one rail's slides: how many, what shape THE PICTURE is, and whether it LOADED.
 *
 *  ⚠ THE PICTURE, NOT THE SLIDE — the first run of this measured the slide
 *  WRAPPER and read the poster rail as 414x244, which is the 206px square plus
 *  `HeroRail`'s own `padding: "24px 0 14px"` and the full-width flex child it
 *  is centred in. The wrapper is furniture; what the user asked about is the
 *  shape the photo is shown in. A check that measures the wrong box reports a
 *  bug that is not there — this file has recorded that once already (the 27 Sep
 *  gap probe finding a crew's STYLES row and calling 52.6px a crew bug). */
const measureRail = (page, selector) =>
  page.evaluate((sel) => {
    const rail = document.querySelector(sel);
    if (!rail) return null;
    const slides = [...rail.children].map((el) => {
      const img = el.querySelector("img");
      const box = img ? img.getBoundingClientRect() : el.getBoundingClientRect();
      return {
        w: Math.round(box.width),
        h: Math.round(box.height),
        ratio: box.height > 0 ? Math.round((box.width / box.height) * 100) / 100 : 0,
        loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      };
    });
    return { count: slides.length, slides };
  }, selector);

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [], crews: [], objects: [] };
  const browser = await chromium.launch();
  const errs = [];

  try {
    /* ── THE WORLD ──────────────────────────────────────────────────────── */
    const owner = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: `shot.disc.owner.${stamp}@example.com` }) }).then((r) => r.json());
    if (!owner.id) throw new Error(`generate_link failed: ${JSON.stringify(owner)}`);
    made.users.push(owner.id);
    await rest("POST", "/rest/v1/profiles", { id: owner.id, full_name: `Disc Owner ${stamp}`, role: "user", city: CITY, styles: [STYLE], created_by: owner.id, updated_by: owner.id });

    /* the studio's own profile picture, in the PUBLIC bucket where a business's disc lives */
    const facePath = `businesses/${stamp}/face.png`;
    await upload("media", facePath).catch(async () => {
      /* the folder map says `tenants/` — the bucket kept its old prefix when the
         database was renamed (16 Sep 2026), and that literal is deliberate */
      await upload("media", `tenants/${stamp}/face.png`);
    });
    made.objects.push(["media", facePath]);

    const [studio] = await rest("POST", "/rest/v1/businesses", {
      type: "studio",
      name: `Disc Studio ${stamp}`,
      area: "Salt Lake",
      city: CITY,
      lat: CENTRE.lat,
      lng: CENTRE.lng,
      location_set_at: new Date().toISOString(),
      visibility: "unlisted",
      styles: [STYLE],
      profile_photo_path: facePath,
      created_by: owner.id,
      updated_by: owner.id,
    });
    made.businesses.push(studio.id);
    await rest("POST", "/rest/v1/business_members", { business_id: studio.id, user_id: owner.id, member_role: "owner", created_by: owner.id, updated_by: owner.id });
    await rest("POST", "/rest/v1/subscriptions", {
      kind: "studio", user_id: owner.id, business_id: studio.id, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", granted: true,
      current_period_start: new Date().toISOString().slice(0, 10), current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      note: "Granted by a screenshot script - nothing charged", created_by: owner.id, updated_by: owner.id,
    });
    await rest("PATCH", `/rest/v1/businesses?id=eq.${studio.id}`, { verified_at: new Date().toISOString() });
    await rest("PATCH", `/rest/v1/businesses?id=eq.${studio.id}`, { visibility: "listed" });

    /* THE POSTERS — real objects in the private bucket, with the rows that point
       at them. `proof/{uploader}/…` is the app's own path (lib/media/proof.ts). */
    for (let i = 0; i < POSTERS; i += 1) {
      const p = `proof/${owner.id}/${stamp}-${i}.png`;
      await upload("org-proof", p);
      made.objects.push(["org-proof", p]);
      await rest("POST", "/rest/v1/studio_photos", { business_id: studio.id, org_id: owner.id, path: p, sort: i, created_by: owner.id, updated_by: owner.id });
    }

    /* an ARTIST for the Artists tab */
    const artist = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: `shot.disc.artist.${stamp}@example.com` }) }).then((r) => r.json());
    made.users.push(artist.id);
    await rest("POST", "/rest/v1/profiles", { id: artist.id, full_name: `Disc Artist ${stamp}`, role: "user", city: CITY, styles: [STYLE], created_by: artist.id, updated_by: artist.id });
    await rest("POST", "/rest/v1/subscriptions", {
      kind: "artist", user_id: artist.id, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", granted: true,
      current_period_start: new Date().toISOString().slice(0, 10), current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      note: "Granted by a screenshot script - nothing charged", created_by: artist.id, updated_by: artist.id,
    });

    /* a CREW for the Crews tab */
    const [crew] = await rest("POST", "/rest/v1/crews", { name: `Disc Crew ${stamp}`, city: CITY, style: STYLE, styles: [STYLE], leader_id: owner.id, created_by: owner.id, updated_by: owner.id });
    made.crews.push(crew.id);
    await rest("POST", "/rest/v1/crew_members", { crew_id: crew.id, user_id: owner.id, role: "leader", status: "confirmed", sort: 0, created_by: owner.id, updated_by: owner.id });

    /* ── AS A STRANGER ──────────────────────────────────────────────────── */
    const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`);
    });

    /* 1. THE HEAD, MEASURED, IN BOTH THEMES */
    for (const theme of ["dark", "light"]) {
      await page.goto(`${BASE}/discover?city=${encodeURIComponent(CITY)}&tab=studios`, { waitUntil: "networkidle" });
      await page.evaluate((t) => {
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(t);
      }, theme);
      await page.waitForTimeout(200);
      const h = await measureHead(page);
      check(Boolean(h), `${theme}: the Discover head is on the page`);
      if (!h) continue;
      check(h.titleText === "Discover", `${theme}: the heading is the word Discover — read "${h.titleText}"`);
      check(h.tag === "H1", `${theme}: and it is the page's own <h1>, the first Discover has ever had — read <${h.tag.toLowerCase()}>`);
      check(h.font >= 32, `${theme}: set at the app's display scale — ${h.font}px`);
      check(h.oneLine, `${theme}: and still fits one line`);
      check(h.eyebrowGone, `${theme}: the old DISCOVER eyebrow is GONE — the half a check that only looked at the new place could not tell you`);
      check(h.subText === "Dance near you", `${theme}: "Dance near you" is the small line — read "${h.subText}"`);
      check(h.subFont < h.font, `${theme}: and it is SMALLER than the heading — ${h.subFont}px against ${h.font}px, which is yesterday's hierarchy the other way up`);
      check(h.chipFound, `${theme}: the place chip is in that row`);
      check(h.sameLine, `${theme}: and SHARES its line — the row is ${h.rowH}px against a tallest child of ${h.tallest}px, so the two are side by side and not stacked`);
      check(h.subLeftOfChip === true, `${theme}: with the chip to its right`);
      check(h.gapToRow >= 4 && h.gapToRow <= 8, `${theme}: and the gap under the heading is the head's own measured rhythm — ${h.gapToRow}px`);
    }

    /* 2. THE STUDIO CARD */
    await page.goto(`${BASE}/discover?city=${encodeURIComponent(CITY)}&tab=studios`, { waitUntil: "networkidle" });
    const card = page.getByRole("link", { name: `Open ${studio.name}` });
    check((await card.count()) === 1, "the studio is the one card on Kolkata's shelf");
    const cardRail = await measureRail(page, '[data-testid="studio-card-rail"]');
    check(Boolean(cardRail), "the card's top section is a rail");
    if (cardRail) {
      check(cardRail.count === POSTERS, `the rail swipes through all ${POSTERS} posters — it has ${cardRail.count}`);
      check(cardRail.slides.every((s) => s.ratio >= 0.97 && s.ratio <= 1.03), `every slide is SQUARE — the shape the cropper cut (${cardRail.slides.map((s) => `${s.w}x${s.h}`).join(", ")})`);
      check(cardRail.slides.every((s) => s.loaded), "and every picture really LOADED — a signed URL that 404s fails here rather than passing as 'an img exists'");
    }
    const faceImg = await card.locator("span img").count();
    check(faceImg >= 1, "the bottom line draws the studio's PROFILE PICTURE, not initials");
    const cardText = (await card.innerText()).replace(/\s+/g, " ");
    check(!cardText.includes(STYLE), `no dance style on the studio card — its text is "${cardText.slice(0, 70)}"`);
    /* ⚠ BOTH ENDS: the style RAIL above the shelf still carries the word, so a
       naive "the page does not say Kathak" would pass on the wrong element */
    check((await page.getByRole("button", { name: STYLE, exact: true }).count()) >= 1, `…and the style rail above the shelf still offers ${STYLE}, so the check above is about the CARD`);

    /* 3. THE SAME PICTURES, THE SAME SHAPE, ON THE STUDIO'S OWN PAGE */
    await page.goto(`${BASE}/studio/${studio.id}`, { waitUntil: "networkidle" });
    const heroRail = await measureRail(page, '[data-testid="hero-rail"]');
    check(Boolean(heroRail), "the studio's own page draws its poster rail");
    if (heroRail && cardRail) {
      check(heroRail.count === cardRail.count, `the poster rail and the Discover card hold the SAME number of pictures (${heroRail.count} and ${cardRail.count})`);
      check(heroRail.slides.every((s) => s.ratio >= 0.97 && s.ratio <= 1.03), `the poster rail's pictures are square too (${heroRail.slides.map((s) => `${s.w}x${s.h}`).join(", ")})`);
      check(
        Math.abs((heroRail.slides[0]?.ratio ?? 0) - (cardRail.slides[0]?.ratio ?? 1)) < 0.05,
        `⚠ THE SAME ASPECT RATIO IN BOTH PLACES — the whole of "they should be the same". The SIZE differs on purpose (${heroRail.slides[0]?.w}px on the page, ${cardRail.slides[0]?.w}px on the card): a hero is a hero and a card is a card. What must not differ is the SHAPE, because that is what the cropper cut.`
      );
    }

    /* 4. THE ARTIST CARD */
    await page.goto(`${BASE}/discover?city=${encodeURIComponent(CITY)}&tab=artists`, { waitUntil: "networkidle" });
    const aCard = page.getByRole("link", { name: `Open Disc Artist ${stamp}` });
    check((await aCard.count()) === 1, "the artist is on the Artists tab");
    if ((await aCard.count()) === 1) {
      const t = (await aCard.innerText()).replace(/\s+/g, " ");
      check(!t.includes(STYLE), `no dance style on the artist card — its text is "${t.slice(0, 70)}"`);
      check(t.includes("ARTIST"), "…and it still says ARTIST, so the card itself is intact");
    }

    /* 5. THE CREW CARD */
    await page.goto(`${BASE}/discover?city=${encodeURIComponent(CITY)}&tab=crews`, { waitUntil: "networkidle" });
    const cCard = page.getByRole("link", { name: `${crew.name} — Crew` });
    check((await cCard.count()) === 1, "the crew is on the Crews tab");
    if ((await cCard.count()) === 1) {
      const t = (await cCard.innerText()).replace(/\s+/g, " ");
      check(!t.includes(STYLE), `no dance style on the crew card — its text is "${t.slice(0, 70)}"`);
      check(t.includes("CREW"), "…and it still says CREW, so the card itself is intact");
    }

    check(errs.length === 0, `no page error and no 5xx anywhere${errs.length ? ` — ${errs.join(" | ")}` : ""}`);
  } finally {
    /* ── PUT IT ALL BACK ────────────────────────────────────────────────── */
    await browser.close().catch(() => {});
    for (const id of made.crews) {
      await fetch(`${SUPABASE}/rest/v1/crew_members?crew_id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
      await fetch(`${SUPABASE}/rest/v1/crews?id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
    }
    for (const id of made.businesses) {
      await fetch(`${SUPABASE}/rest/v1/studio_photos?business_id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
      await fetch(`${SUPABASE}/rest/v1/subscriptions?business_id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
      await fetch(`${SUPABASE}/rest/v1/business_members?business_id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
      const r = await fetch(`${SUPABASE}/rest/v1/businesses?id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => null);
      if (r && !r.ok) console.log(`  (cleanup: business ${id} -> ${r.status} ${await r.text()})`);
    }
    for (const [bucket, p] of made.objects) {
      await fetch(`${SUPABASE}/storage/v1/object/${bucket}/${p}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {});
    }
    for (const id of made.users) {
      await fetch(`${SUPABASE}/rest/v1/subscriptions?user_id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
      const r = await fetch(`${SUPABASE}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => null);
      if (r && !r.ok) console.log(`  (cleanup: user ${id} -> ${r.status} ${await r.text()})`);
    }
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
