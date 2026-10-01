/**
 * One photo per dance style, from Wikimedia Commons, with its credit
 * (2 Oct 2026, the user: "All dance styles cards … with a photo of that
 * particular dance style", and their choice: free-licence photos, credited).
 *
 *   node scripts/fetch-style-photos.js            # every style without a photo yet
 *   node scripts/fetch-style-photos.js Kathak     # just these (re-pick)
 *   node scripts/fetch-style-photos.js --file "Kathak=File:Some photo.jpg"
 *
 * Writes public/styles/<slug>.jpg and lib/constants/stylePhotos.json
 * ({ slug: { title, credit, license, licenseUrl, source } }).
 *
 * ⚠ ONLY A LICENCE THAT ALLOWS THIS USE IS ACCEPTED — public domain, CC0, CC BY
 * and CC BY-SA. Every one of those but PD/CC0 requires attribution, which is why
 * the credit is stored beside the file and printed on the style page; a photo
 * whose licence cannot be read is skipped rather than guessed at.
 * ⚠ Commons asks every client for a User-Agent naming it and a contact.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "styles");
const MANIFEST = path.join(ROOT, "lib", "constants", "stylePhotos.json");
const UA = "DanceOS/1.0 (https://dancestudio-orcin.vercel.app; ai@eeetaxi.com) style-photos";
const API = "https://commons.wikimedia.org/w/api.php";

/* what to search for, per style — a dance's name alone finds maps and posters */
const QUERY = {
  "Hip-Hop": "hip hop dancer performance",
  Breaking: "breakdance bboy",
  Popping: "popping dance dancer",
  Locking: "locking dance funk dancer",
  House: "house dance dancer",
  Waacking: "waacking dance",
  Krump: "krump dancer",
  Dancehall: "dancehall dancer",
  Afrobeats: "afrobeats dance",
  Reggaeton: "reggaeton dance",
  "K-pop": "k-pop dance cover",
  Bollywood: "bollywood dance performance",
  Ballroom: "ballroom dancing couple competition",
  Tango: "argentine tango couple dancing",
  Salsa: "salsa dancing couple",
  Bachata: "bachata dancing couple",
  Samba: "samba dancer carnival",
  Contemporary: "contemporary dance performance",
  Modern: "modern dance performance",
  Jazz: "jazz dance performance",
  "Jazz Funk": "jazz funk dance",
  Ballet: "ballet dancer performance",
  Tap: "tap dance shoes dancer",
  Lyrical: "lyrical dance",
  Commercial: "commercial dance group performance",
  Heels: "heels dance class",
  Flamenco: "flamenco dancer",
  "Belly Dance": "belly dancer performance",
  Zumba: "zumba class",
  Freestyle: "street dance freestyle battle",
  "Open format": "dance battle cypher",
  "Semi-classical": "indian semi classical dance",
  "Sufi Whirling": "whirling dervish sema",
  "Dandiya Raas": "dandiya raas navratri",
};
const queryOf = (style) => QUERY[style] ?? `${style} dance`;

const ALLOWED = /^(public domain|pd|cc0|cc[- ]?by(-sa)?[- ]?\d(\.\d)?.*|cc[- ]?by(-sa)?)$/i;

const slugOf = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", origin: "*", ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`commons ${r.status}`);
  return r.json();
}

function judge(page) {
  const ii = page.imageinfo?.[0];
  if (!ii || !ii.thumburl) return null;
  const m = ii.extmetadata ?? {};
  const license = strip(m.LicenseShortName?.value);
  if (!ALLOWED.test(license)) return null;
  if (/nc|nd/i.test(license.replace(/\bcc\b/i, ""))) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(page.title)) return null;
  if ((ii.width ?? 0) < 700 || (ii.height ?? 0) < 450) return null;
  return {
    title: page.title,
    thumb: ii.thumburl,
    credit: strip(m.Artist?.value) || "Unknown author",
    license,
    licenseUrl: strip(m.LicenseUrl?.value) || null,
    source: ii.descriptionurl,
  };
}

async function candidates(style) {
  const j = await api({
    action: "query",
    generator: "search",
    gsrsearch: `${queryOf(style)} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "25",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "900",
  });
  const pages = (j.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.map(judge).filter(Boolean);
}

async function byTitle(title) {
  const j = await api({ action: "query", titles: title, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "900" });
  const p = j.query?.pages?.[0];
  return p ? judge(p) : null;
}

async function download(url, file) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`download ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

(async () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "constants", "styles.ts"), "utf8");
  const all = [...src.matchAll(/\["([^"]+)", "#[0-9A-Fa-f]{6}"\]/g)].map((m) => m[1]);
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const forced = new Map();
  const named = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file") {
      const [style, title] = args[++i].split("=");
      forced.set(style, title);
    } else named.push(args[i]);
  }
  const want = forced.size ? [...forced.keys()] : named.length ? named : all.filter((s) => !manifest[slugOf(s)]);
  const skip = Number(process.env.SKIP ?? 0);

  for (const style of want) {
    const slug = slugOf(style);
    try {
      let pick;
      if (forced.has(style)) pick = await byTitle(forced.get(style));
      else pick = (await candidates(style))[skip] ?? null;
      if (!pick) {
        console.log(`SKIP  ${style} — no freely licensed photo found`);
        continue;
      }
      await download(pick.thumb, path.join(OUT_DIR, `${slug}.jpg`));
      manifest[slug] = { title: pick.title, credit: pick.credit, license: pick.license, licenseUrl: pick.licenseUrl, source: pick.source };
      console.log(`OK    ${style.padEnd(16)} ${pick.license.padEnd(14)} ${pick.title}`);
    } catch (e) {
      console.log(`FAIL  ${style} — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
})();
