/* Screenshot the prototype's own build, screen by screen, so the comparison is
   made with eyes rather than by reading JSX. Runs from the repo root with the repo's own Playwright:
   NODE_PATH=$(pwd)/node_modules node scripts/shots/shoot-proto.js  → scripts/shots/shots/proto-<key>.png (gitignored) */
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

/* the repo root, from scripts/shots/ */
const ROOT = path.resolve(__dirname, "..", "..");

const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const HTML = "file:///" + path.join(ROOT, "prototype", "DanceOS.html").replace(/\\/g, "/");

/* [file, how to get there] — tabs, drills, sheets, and the modes that change them */
const SHOTS = [
  ["auth", async (p) => {}],
  ["home-dancer", async (p) => p.evaluate(() => { window.__DOSLOGIN(); window.__DOSTAB("home"); })],
  ["discover", async (p) => p.evaluate(() => window.__DOSTAB("discover"))],
  ["stats", async (p) => p.evaluate(() => window.__DOSTAB("stats"))],
  ["inbox", async (p) => p.evaluate(() => window.__DOSTAB("inbox"))],
  ["profile-dancer", async (p) => p.evaluate(() => window.__DOSTAB("profile"))],
  ["settings-sheet-dancer", async (p) => p.evaluate(() => window.__DOSOPENSETTINGSNOW && window.__DOSOPENSETTINGSNOW())],
  ["subscr", async (p) => p.evaluate(() => { window.__DOSTAB("profile"); window.__DOSNAV("subscr"); })],
  ["home-artist", async (p) => p.evaluate(() => { window.__DOSTAB("profile"); window.__DOSSUBSCRIBE("monthly"); window.__DOSTAB("home"); })],
  ["profile-artist", async (p) => p.evaluate(() => window.__DOSTAB("profile"))],
  ["settings-sheet-artist", async (p) => p.evaluate(() => window.__DOSOPENSETTINGSNOW && window.__DOSOPENSETTINGSNOW())],
  ["payments", async (p) => p.evaluate(() => { window.__DOSTAB("profile"); window.__DOSNAV("payments"); })],
  ["invoices", async (p) => p.evaluate(() => { window.__DOSTAB("profile"); window.__DOSNAV("invoices"); })],
  ["refunds", async (p) => p.evaluate(() => { window.__DOSTAB("profile"); window.__DOSNAV("refunds"); })],
  ["notif", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("notif"); })],
  ["bookings", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("bookings"); })],
  ["managed", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("managed"); })],
  ["calendar", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("calendar"); })],
  ["crews", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("crews"); })],
  ["studios", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("studios"); })],
  ["classesmod", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("classesmod"); })],
  ["classform", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("classform"); })],
  ["eventsmod", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("eventsmod"); })],
  ["eventform", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("eventform"); })],
  ["earn-artist", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("earn"); })],
  ["students", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("students"); })],
  ["team", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("team"); })],
  ["choreos", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("choreos"); })],
  ["pub-studio", async (p) => p.evaluate(() => { window.__DOSTAB("discover"); window.__DOSNAV("studio"); })],
  ["pub-trainer", async (p) => p.evaluate(() => { window.__DOSTAB("discover"); window.__DOSNAV("trainer"); })],
  ["pub-crew", async (p) => p.evaluate(() => { window.__DOSTAB("discover"); window.__DOSNAV("crew"); })],
  ["class", async (p) => p.evaluate(() => { window.__DOSTAB("discover"); window.__DOSNAV("class", { kind: "class", title: "Hip-Hop Foundations", style: "Hip-Hop", styleColor: "#5AC8FA", room: "Studio A", capacity: "8/16", price: "₹300/session", status: "Published", person: { name: "Rhea Kapoor" }, id: 1 }); })],
  ["event", async (p) => p.evaluate(() => { window.__DOSTAB("discover"); window.__DOSNAV("eventslist"); })],
  ["charts", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("charts"); })],
  ["history", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("classes"); })],
  /* the studio workspace */
  ["home-studio", async (p) => p.evaluate(() => window.__DOSENTER(true))],
  ["studio-settings", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("settings"); })],
  ["studio-locations", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("locations"); })],
  ["studio-memberships", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("memberships"); })],
  ["studio-expenses", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("expenses"); })],
  ["studio-assets", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("assets"); })],
  ["studio-reports", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("reports"); })],
  ["studio-earn", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("earn"); })],
  ["studio-payments", async (p) => p.evaluate(() => { window.__DOSTAB("home"); window.__DOSNAV("payments"); })],
  ["studio-profile", async (p) => p.evaluate(() => window.__DOSTAB("profile"))],
  ["studio-settings-sheet", async (p) => p.evaluate(() => window.__DOSOPENSETTINGSNOW && window.__DOSOPENSETTINGSNOW())],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 160)));
  await page.goto(HTML);
  await page.waitForFunction(() => typeof window.__DOSLOGIN === "function" || document.body.innerText.length > 50, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  for (const [name, go] of SHOTS) {
    try {
      await go(page);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `proto-${name}.png`), fullPage: true });
      console.log("shot", name);
    } catch (e) {
      console.log("FAILED", name, String(e).slice(0, 200));
    }
  }
  await browser.close();
})();
