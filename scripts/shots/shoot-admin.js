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
  ["dashboard", "/admin/dashboard"],
  ["verifications", "/admin/verifications"],
  ["verifications-approved", "/admin/verifications?tab=approved"],
  ["verifications-rejected", "/admin/verifications?tab=rejected"],
  ["verifications-all", "/admin/verifications?tab=all&q=e2e"],
  ["support", "/admin/support"],
  ["support-all", "/admin/support?tab=all"],
  ["reports", "/admin/reports"],
  ["reports-all", "/admin/reports?status=all"],
  ["money-payments", "/admin/payments"],
  ["money-refunds", "/admin/payments?tab=refunds"],
  ["money-payouts", "/admin/payments?tab=payouts"],
  ["subscriptions", "/admin/subscriptions"],
  ["plans", "/admin/plans"],
  ["communication", "/admin/communication"],
  /* REACH (30 Sep 2026) — all three tabs, plus the two states that only appear
     once something is typed: the business list a term returns on Shown, and the
     one-address history on Email. A desk whose every tab is a different table is
     a desk where opening one proves nothing about the other two. */
  ["reach", "/admin/reach"],
  ["reach-7d", "/admin/reach?days=7"],
  ["reach-shown", "/admin/reach?tab=shown"],
  ["reach-shown-q", "/admin/reach?tab=shown&q=dance"],
  /* ⚠ A REAL BUSINESS WITH REAL IMPRESSIONS, so the one read a static URL list
     would otherwise never reach is actually made. EEE Dance Studio is the demo
     world's and carried 14 shelves at the time this was written; if the demo
     world is re-seeded the id moves and this page draws the business list
     instead of the figures — which still proves the tab, just not the read.
     (6 Oct 2026: it had moved — re-pointed at the row the 3 Oct re-seed made.
     `shoot-reach` follows the list's own link instead, so it cannot go stale.) */
  ["reach-shown-one", "/admin/reach?tab=shown&q=EEE&id=e73aa0e4-7082-4d38-b691-98cbb9414c7c"],
  /* AN ARTIST (6 Oct 2026, decision 7) — the person read beside the business one */
  ["reach-shown-artist", "/admin/reach?tab=shown&q=Aditya&id=bb557609-034d-4f69-a3df-07121a71a484&kind=person"],
  ["reach-email", "/admin/reach?tab=email"],
  ["reach-email-q", "/admin/reach?tab=email&q=nobody%40example.com"],
  ["accounts", "/admin/accounts"],
  /* the people who left through "Delete my account", and Restore (10 Oct 2026) */
  ["accounts-left", "/admin/accounts?tab=left"],
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

  try {
    await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"), { timeout: 30000 });

    for (const [name, href] of PAGES) {
      /* ⚠ `domcontentloaded` AND THEN THE HEADING, NEVER `networkidle` (30 Sep
         2026). Two runs died on it, on two DIFFERENT pre-existing pages, before
         reaching the screens being verified — so the wait was failing rather
         than the product. `networkidle` asks the whole network to go quiet for
         half a second, which an RSC prefetch or a font can keep from happening;
         the `<h1>` is the thing that actually says the desk rendered, and it is
         what every desk has carried since 22 Sep. */
      try {
        await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 20000 });
        await page.screenshot({ path: path.join(OUT, `admin-${name}.png`), fullPage: true });
        const heading = await page.locator("h1").first().textContent().catch(() => null);
        console.log(`  admin-${name}.png  ${href}  ${(heading || "").slice(0, 40)}`);
      } catch (e) {
        /* ⚠ ONE SLOW PAGE IS NOT THE WHOLE RUN. It used to abort the loop, which
           is why the run never reached the later desks AND never reached its own
           cleanup — three throwaway admins were live on production because of
           it, which is the 29 Sep lesson in miniature. */
        problems.push(`${href}: ${String(e.message || e).split("\n")[0]}`);
        console.log(`  admin-${name}.png  ${href}  FAILED`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    /* ⚠⚠ THE RIGHT GOES BEFORE THE ACCOUNT, AND BOTH STATUSES ARE READ. A
       cleanup that does not read its own status is not a cleanup (20 Sep 2026),
       and an admin right left standing is the most expensive thing this script
       can leak. The revoke is a soft delete because `is_platform_admin()` tests
       `deleted_at`, so it bites at once and one UPDATE puts it back. */
    const revoked = await fetch(`${SUPABASE}/rest/v1/platform_admins?user_id=eq.${link.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    const revokedRows = await revoked.json().catch(() => null);
    if (!revoked.ok || !Array.isArray(revokedRows) || revokedRows.length !== 1) {
      problems.push(`the throwaway admin's RIGHT was not revoked: ${revoked.status} ${JSON.stringify(revokedRows)}`);
    }
    const gone = await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers });
    if (!gone.ok) {
      problems.push(`the throwaway admin's ACCOUNT was not deleted: ${gone.status}`);
    }
  }

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
