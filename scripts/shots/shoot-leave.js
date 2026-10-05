/**
 * DELETE MY ACCOUNT (6 Oct 2026, the user's decision 6) — driven end to end.
 *
 * `request_account_deletion` was proven 25/25 in a rolled-back dry run, and the
 * e2e opens the confirm and keeps the account. Neither presses the button — and
 * the press is the whole feature: an RPC, a ban through the auth admin API, a
 * sign-out and a redirect, in that order, from a Settings tile. So this does.
 *
 * What it proves:
 *   1. A person who still LEADS a crew is refused, in the database's own words,
 *      inside the dialog — and nothing about the account moved.
 *   2. Once that is cleared, the press closes the account: they land on
 *      /login?left=1 and read why they cannot sign in.
 *   3. The record is what the migration says: the profile soft-deleted, ONE
 *      support thread "Delete my account" carrying their reason, and the auth
 *      account banned — signing in again is refused.
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-leave.js
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "Shoot-passw0rd!";
const UA = "danceos-proof";
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", "User-Agent": UA };

const call = async (method, url, body, headers = H) => {
  const res = await fetch(url.startsWith("http") ? url : `${SUPABASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
};

let pass = 0;
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (ok) pass += 1;
  else fail += 1;
};

(async () => {
  const stamp = Date.now().toString(36);
  const email = `shot.leave.${stamp}@example.com`;
  const name = `Shot Leaver ${stamp}`;
  const reason = `Moving cities ${stamp}`;
  let userId = null;
  let crewId = null;
  const browser = await chromium.launch();
  try {
    const made = await call("POST", "/auth/v1/admin/users", { email, password: PASSWORD, email_confirm: true });
    if (!made.ok) throw new Error(`create user: ${made.status} ${JSON.stringify(made.body)}`);
    userId = made.body.id;
    const prof = await call("POST", "/rest/v1/profiles", { id: userId, full_name: name, role: "user", city: "Pune", styles: ["Hip-Hop"], created_by: userId, updated_by: userId });
    if (!prof.ok) throw new Error(`profile: ${prof.status} ${JSON.stringify(prof.body)}`);
    const crew = await call("POST", "/rest/v1/crews", { name: `Shot Leave Crew ${stamp}`, city: "Pune", style: "Hip-Hop", leader_id: userId, created_by: userId, updated_by: userId });
    if (!crew.ok) throw new Error(`crew: ${crew.status} ${JSON.stringify(crew.body)}`);
    crewId = crew.body[0].id;

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

    const openDialog = async () => {
      await page.goto(`${BASE}/?settings=1`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Delete my account", exact: true }).first().click({ timeout: 15000 });
      const dlg = page.getByRole("alertdialog", { name: /Delete your account/ });
      await dlg.waitFor({ timeout: 10000 });
      return dlg;
    };

    // 1 — refused while they lead a crew
    let dlg = await openDialog();
    await dlg.getByLabel(/Why are you leaving/).fill(reason);
    await dlg.getByRole("button", { name: "Delete my account" }).click();
    await page.getByText(/hand the crew to a member before deleting your account/).waitFor({ timeout: 15000 }).catch(() => {});
    check(await page.getByText(/You lead Shot Leave Crew .* hand the crew to a member/).count() > 0, "a crew leader is refused in the database's own words, inside the dialog");
    const still = await call("GET", `/rest/v1/profiles?id=eq.${userId}&select=deleted_at`);
    check(Array.isArray(still.body) && still.body[0] && still.body[0].deleted_at === null, "…and the profile is untouched");
    const noThread = await call("GET", `/rest/v1/support_threads?account_id=eq.${userId}&select=id`);
    check(Array.isArray(noThread.body) && noThread.body.length === 0, "…and no support thread was opened");
    check(/\/\?settings=1|\/$/.test(new URL(page.url()).pathname + new URL(page.url()).search) || !/login/.test(page.url()), "…and they are still signed in");

    // 2 — the crew handed over (here: gone), the press closes the account
    await call("PATCH", `/rest/v1/crews?id=eq.${crewId}`, { deleted_at: new Date().toISOString() });
    dlg = await openDialog();
    await dlg.getByLabel(/Why are you leaving/).fill(reason);
    await dlg.getByRole("button", { name: "Delete my account" }).click();
    await page.waitForURL(/\/login\?left=1/, { timeout: 30000 }).catch(() => {});
    check(/\/login\?left=1/.test(page.url()), `they land on /login?left=1 (${page.url().replace(BASE, "")})`);
    /* a server action's redirect moves the URL before the new page has painted, so
       wait for the notice rather than counting the instant the address changes */
    await page.getByTestId("account-closed").waitFor({ timeout: 15000 }).catch(() => {});
    check(await page.getByTestId("account-closed").count() === 1, "…and read that the account is closed");

    // 3 — the record
    const gone = await call("GET", `/rest/v1/profiles?id=eq.${userId}&select=deleted_at`);
    check(Array.isArray(gone.body) && gone.body[0] && gone.body[0].deleted_at !== null, "the profile is soft-deleted");
    const threads = await call("GET", `/rest/v1/support_threads?account_id=eq.${userId}&select=id,subject`);
    check(Array.isArray(threads.body) && threads.body.length === 1 && threads.body[0].subject === "Delete my account", "ONE support thread, 'Delete my account'");
    if (threads.body && threads.body[0]) {
      const msgs = await call("GET", `/rest/v1/support_messages?thread_id=eq.${threads.body[0].id}&select=body`);
      check(Array.isArray(msgs.body) && msgs.body.length === 1 && msgs.body[0].body.includes(reason) && msgs.body[0].body.includes(email), "…carrying their reason and their address");
    }
    const auth = await call("GET", `/auth/v1/admin/users/${userId}`);
    check(auth.ok && auth.body && auth.body.banned_until && new Date(auth.body.banned_until) > new Date(Date.now() + 365 * 86400000), `the auth account is banned (until ${auth.body && auth.body.banned_until})`);
    const again = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify({ email, password: PASSWORD }),
    });
    check(!again.ok, `signing in again is refused (${again.status})`);
    check(errors.length === 0, `no page error${errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""}`);
  } catch (e) {
    check(false, `threw: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
    if (userId) {
      const t = await call("GET", `/rest/v1/support_threads?account_id=eq.${userId}&select=id`);
      for (const row of (t.body || [])) {
        await call("DELETE", `/rest/v1/support_messages?thread_id=eq.${row.id}`);
        await call("DELETE", `/rest/v1/notifications?href=eq./admin/support/${row.id}`);
        await call("DELETE", `/rest/v1/support_threads?id=eq.${row.id}`);
      }
    }
    if (crewId) {
      await call("DELETE", `/rest/v1/crew_members?crew_id=eq.${crewId}`);
      const c = await call("DELETE", `/rest/v1/crews?id=eq.${crewId}`);
      if (!c.ok) console.log(`  cleanup: crew delete ${c.status} ${JSON.stringify(c.body)}`);
    }
    if (userId) {
      const d = await call("DELETE", `/auth/v1/admin/users/${userId}`);
      if (!d.ok) { fail += 1; console.log(`FAIL  cleanup: the throwaway account was not deleted (${d.status} ${JSON.stringify(d.body)})`); }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
