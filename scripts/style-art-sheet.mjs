/* The contact sheet for the drawn style dancers (2 Oct 2026): every style's
 * figure in both frames, on the style's own colour, written to
 * scripts/shots/shots/style-art.html and shot to style-art.png. A pose that
 * reads as the wrong dance is found HERE, by eye — the same rule the photos
 * were held to.
 *
 *   NODE_PATH=$PWD/node_modules node scripts/style-art-sheet.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { figureSvg } = await import(pathToFileURL(path.join(ROOT, "lib/styleArt/figure.ts")).href);
const { STYLE_SPECS } = await import(pathToFileURL(path.join(ROOT, "lib/styleArt/specs.ts")).href);
const reg = fs.readFileSync(path.join(ROOT, "lib/constants/styles.ts"), "utf8");
const colors = Object.fromEntries([...reg.matchAll(/\["([^"]+)", "(#[0-9A-Fa-f]{6})"\]/g)].map((m) => [m[1], m[2]]));

const cells = Object.keys(colors).map((name, i) => {
  const spec = STYLE_SPECS[name];
  const c = colors[name];
  if (!spec) return `<div class="cell missing">${name}<br>NO SPEC</div>`;
  const card = figureSvg(spec, `c${i}`, [10, 9, 80, 74]);
  const page = figureSvg(spec, `p${i}`, [8, 7, 84, 84]);
  return `<div class="cell"><div class="card" style="background:linear-gradient(150deg,${c},${c}99)"><svg viewBox="0 0 100 125">${card}</svg><div class="fade"></div><b>${name}</b></div><div class="page" style="background:linear-gradient(160deg,${c},${c}88)"><svg viewBox="0 0 100 100">${page}</svg></div></div>`;
});
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;font-family:system-ui;color:#fff;padding:12px}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}
.cell{display:flex;gap:6px}.card{position:relative;width:150px;aspect-ratio:4/5;border-radius:14px;overflow:hidden}
.card svg,.page svg{position:absolute;inset:0;width:100%;height:100%}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.78))}
.card b{position:absolute;left:9px;bottom:8px;font-size:13px}
.page{position:relative;width:110px;aspect-ratio:1;border-radius:12px;overflow:hidden;align-self:flex-start}
.missing{background:#600;padding:20px}</style><div class="grid">${cells.join("")}</div>`;
const outDir = path.join(ROOT, "scripts/shots/shots");
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, "style-art.html");
fs.writeFileSync(file, html);
const { createRequire } = await import("node:module");
const req = createRequire(path.join(ROOT, "package.json"));
let pw;
try { pw = req("playwright"); } catch { pw = req("@playwright/test"); }
const { chromium } = pw;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 } });
await page.goto(pathToFileURL(file).href);
await page.screenshot({ path: path.join(outDir, "style-art.png"), fullPage: true });
/* the cards alone, big, in four bands — the place a bad pose is visible */
const cards = page.locator(".card");
const n = await cards.count();
for (let band = 0; band * 14 < n; band++) {
  await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(7,300px);gap:10px;padding:10px}</style>`);
  const slice = [];
  for (let i = band * 14; i < Math.min(n, band * 14 + 14); i++) slice.push(i);
  const htmlCells = slice.map((i) => cells[i].replace('class="cell"', 'class="cell" style="display:block"').replace(/width:150px/g, "width:300px")).join("");
  await page.setContent(html.replace(/<div class="grid">[\s\S]*<\/div>$/, `<div class="grid" style="grid-template-columns:repeat(7,300px)">${htmlCells}</div>`).replace(".card{position:relative;width:150px", ".card{position:relative;width:300px").replace(".page{position:relative;width:110px", ".page{display:none;width:110px"));
  await page.screenshot({ path: path.join(outDir, `style-art-${band}.png`), fullPage: true });
}
await browser.close();
console.log("wrote", path.join(outDir, "style-art.png"));
