/* REACH, DRIVEN AND JUDGED (30 Sep 2026).
 *
 * `shoot-admin` opens every admin screen and fails on a console error, which is
 * the right check for twenty-six screens and proves nothing about what any one
 * of them SAYS — a desk drawing three empty states passes it. That is this
 * file's own recorded lesson from 28 Sep: a fact a check prints but does not
 * judge is a fact nobody is checking.
 *
 * So this reads the three tabs back. It is the only thing that can: every read
 * behind them is a SECURITY DEFINER function gated on `is_platform_admin()`,
 * and such a function answers the service role with EMPTINESS rather than an
 * error (10 Sep 2026) — so a script querying PostgREST with the service key
 * would get zero rows from a working desk and call it broken.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.join(__dirname, "..", "..");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let ok = 0;
const fails = [];
const check = (name, pass, detail = "") => {
  if (pass) { ok += 1; console.log(`  ok   ${name}${detail ? `  ${detail}` : ""}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? `  ${detail}` : ""}`); }
};

(async () => {
  const stamp = Date.now().toString(36);
  const email = `shot.reach.${stamp}@example.com`;
  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: "POST", headers, body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());
  if (!link.hashed_token || !link.id) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);
  const named = await fetch(`${SUPABASE}/rest/v1/platform_admins`, {
    method: "POST", headers, body: JSON.stringify({ user_id: link.id }),
  });
  if (!named.ok) throw new Error(`could not name the admin: ${named.status} ${await named.text()}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

  const open = async (href) => {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 20000 });
    return (await page.locator("#dos-main, body").first().innerText()).replace(/\s+/g, " ");
  };

  try {
    await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"), { timeout: 30000 });

    /* ── the desk exists and is reachable the way an admin reaches it ─────── */
    const overview = await open("/admin");
    check("the Overview offers Reach", /Reach/.test(overview));
    check("and says what it is for", /What people looked for/i.test(overview));

    /* ⚠ WAIT FOR THE URL, NOT FOR AN `<h1>`. The first cut clicked and then
       waited for a visible heading — which the page it was LEAVING already had,
       so the assertion ran before the navigation and read `/admin`. A check that
       can fail while the product is right is not a check. */
    await Promise.all([
      page.waitForURL((u) => u.pathname === "/admin/reach", { timeout: 20000 }),
      page.locator("a[href='/admin/reach']").first().click(),
    ]);
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 20000 });
    check("pressing the block opens the desk", new URL(page.url()).pathname === "/admin/reach", page.url());
    const h1 = await page.locator("h1").first().textContent();
    check("the desk has its own <h1>", (h1 || "").trim() === "Reach", `"${(h1 || "").trim()}"`);

    /* ── SEARCHES ─────────────────────────────────────────────────────────── */
    const searches = await open("/admin/reach");
    check("Searches opens by default", /Searches/.test(searches) && /terms with no answer/i.test(searches));
    check("the window is 30 days by default", /30 days/.test(searches));
    /* ⚠ ASSERTED AS A PAIR, not as "a number appeared": production has ZERO
       terms that found nothing, so the figure and the sentence must agree —
       a desk that printed 0 and then listed rows would be the "a number and the
       list behind it are the same number" defect this app has fixed twice. */
    const noAnswer = /(\d+) terms with no answer/.exec(searches);
    check("it states how many terms found nothing", noAnswer !== null, noAnswer ? noAnswer[1] : "—");
    if (noAnswer && noAnswer[1] === "0") {
      check("and with none, it says so rather than drawing an empty list", /Nothing in the last 30 days/i.test(searches));
    }

    /* ⚠ RE-CUT 6 Oct 2026: it asserted "Nothing in the last 7 days", which was
       true the day it was written — production has terms that found nothing now,
       so the honest claim is that the WINDOW moved, and the figure says so either
       way (a count, and the empty sentence only when the count is 0) */
    const sevenDay = await open("/admin/reach?days=7");
    const sevenCount = /(\d+) terms with no answer/.exec(sevenDay);
    check("the window is the address",
      /7 days/.test(sevenDay) && sevenCount !== null && (sevenCount[1] !== "0" || /Nothing in the last 7 days/i.test(sevenDay)),
      sevenCount ? `${sevenCount[1]} in 7 days` : "no figure");

    /* ── SHOWN ────────────────────────────────────────────────────────────── */
    const shown = await open("/admin/reach?tab=shown");
    check("Shown asks for a business or an artist before it answers", /Find a business or an artist to see how often it was shown/i.test(shown));
    check("and says an impression is one row per SHELF", /one row per SHELF/i.test(shown));

    const list = await open("/admin/reach?tab=shown&q=EEE");
    check("a term returns businesses", /EEE Dance Studio/.test(list), "EEE Dance Studio");

    /* ARTISTS (6 Oct 2026, decision 7) — a person with a live plan is offered
       under ARTISTS, and opening one reads `impressions_for_person` */
    const artists = await open("/admin/reach?tab=shown&q=Aditya");
    check("a term returns artists under their own head", /ARTISTS/.test(artists) && /Aditya/.test(artists), "Aditya");
    const artistLink = page.getByTestId("reach-artist").first();
    if ((await artistLink.count()) > 0) {
      await artistLink.click();
      await page.waitForURL(/kind=person/, { timeout: 15000 });
      await page.locator("h1").first().waitFor({ timeout: 15000 });
      const oneArtist = await page.locator("#dos-main").innerText().catch(() => "");
      check("an artist's page answers (shown, or honestly not shown)", /shelves in 30 days/.test(oneArtist) || /Not shown once in the last 30 days/.test(oneArtist));
    }

    /* the read that only a real admin can make.
       ⚠ RE-CUT 6 Oct 2026: it opened a HARD-CODED id, and the demo world was
       re-seeded on 3 Oct — EEE Dance Studio is a different row now, so the page
       fell back to the list and the check read "none" on a working desk. It
       follows the link the list itself draws. */
    await open("/admin/reach?tab=shown&q=EEE");
    const eeeHref = await page.getByRole("link", { name: /EEE Dance Studio/ }).first().getAttribute("href").catch(() => null);
    const one = eeeHref ? await open(eeeHref) : "";
    const shelves = /(\d+) shelves in 30 days/.exec(one);
    check("the business's impressions are read back", shelves !== null && Number(shelves[1]) > 0, shelves ? `${shelves[1]} shelves` : "none");
    check("the surface is in words, not its key", /Discover/.test(one) && !/discover_/.test(one));
    check("and where in the shelf, as a median", /usually #\d+/.test(one) || /place unknown/.test(one));
    check("the median is explained as a median", /is a MEDIAN, not a mean/i.test(one));

    /* ── EMAIL ────────────────────────────────────────────────────────────── */
    const mail = await open("/admin/reach?tab=email");
    check("Email opens", /events recorded/i.test(mail));
    /* ⚠⚠ THE ONE ASSERTION THAT MATTERS MOST. `email_events` is empty, and an
       empty ledger reads as "nothing bounced" when what it means is "nothing is
       being recorded" — the route answers 503 without its secret. The desk must
       say WHICH of the two it is. */
    check("an unrecorded ledger says so rather than reading as zero bounces", /The ledger is not recording yet/i.test(mail));
    check("and names the secret that is missing", /RESEND_WEBHOOK_SECRET/.test(mail));
    /* ⚠ THE HEADING, AND THE FIELD'S OWN ACCESSIBLE NAME — not the placeholder
       through `innerText`, which is an ATTRIBUTE and never appears in it. The
       first cut looked for the placeholder's words in the text and failed on a
       field that was there. */
    check("it asks for one address", /ONE ADDRESS/i.test(mail));
    check("and the field is named for a screen reader", (await page.getByLabel("An email address").count()) === 1);
    check("and explains that a redelivery is not a second bounce", /redelivery is a no-op/i.test(mail));

    const hist = await open("/admin/reach?tab=email&q=nobody%40example.com");
    check("an address with nothing recorded says so", /Nothing recorded for nobody@example\.com/i.test(hist));

    check("no console or page error on any of it", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    const revoked = await fetch(`${SUPABASE}/rest/v1/platform_admins?user_id=eq.${link.id}`, {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    const rows = await revoked.json().catch(() => null);
    if (!revoked.ok || !Array.isArray(rows) || rows.length !== 1) {
      fails.push("the throwaway admin's RIGHT was not revoked");
      console.log(`  FAIL cleanup: revoke ${revoked.status} ${JSON.stringify(rows)}`);
    }
    const gone = await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers });
    if (!gone.ok) { fails.push("the throwaway admin's ACCOUNT was not deleted"); console.log(`  FAIL cleanup: delete ${gone.status}`); }
  }

  console.log(`\n${ok} ok, ${fails.length} failed`);
  if (fails.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
