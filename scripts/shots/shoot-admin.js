/**
 * Screenshot the ADMIN PANEL with a real admin session (11 Sep 2026).
 *
 * The panel is the one part of the app no ordinary account can reach, so it was
 * also the part nobody could look at without hand-making an admin first. This
 * makes a throwaway one through the service role, signs it in the way the e2e
 * specs do (admin generate_link -> /auth/confirm, no inbox needed), shoots every
 * desk, and deletes the account again. Nothing it makes outlives the run.
 *
 *   npm run dev            # in another terminal
 *   NODE_PATH=$(pwd)/node_modules node scripts/shots/shoot-admin.js
 *
 * Shots land in scripts/shots/shots/admin-*.png.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "shots");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";

/* .env.local, the same way the proof scripts read it */
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

const PAGES = [
  ["overview", "/admin"],
  ["verifications", "/admin/verifications"],
  ["support", "/admin/support"],
  ["reports", "/admin/reports"],
  ["money-payments", "/admin/payments"],
  ["money-refunds", "/admin/payments?tab=refunds"],
  ["money-payouts", "/admin/payments?tab=payouts"],
  ["subscriptions", "/admin/subscriptions"],
  ["plans", "/admin/plans"],
  ["communication", "/admin/communication"],
  ["accounts", "/admin/accounts"],
  ["businesses", "/admin/businesses"],
  ["audit", "/admin/audit"],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = Date.now().toString(36);
  const email = `shot.admin.${stamp}@example.com`;

  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());
  if (!link.hashed_token || !link.id) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);

  const named = await fetch(`${SUPABASE}/rest/v1/platform_admins`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: link.id }),
  });
  if (!named.ok) throw new Error(`could not name the admin: ${named.status} ${await named.text()}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  await page.waitForLoadState("networkidle");

  for (const [name, href] of PAGES) {
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, `admin-${name}.png`), fullPage: true });
    const heading = await page.locator("h1, b").first().textContent().catch(() => null);
    console.log(`  admin-${name}.png  ${href}  ${(heading || "").slice(0, 40)}`);
  }

  await browser.close();
  await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers });

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log(`\nAll ${PAGES.length} admin screens shot clean, and the throwaway admin is gone.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
