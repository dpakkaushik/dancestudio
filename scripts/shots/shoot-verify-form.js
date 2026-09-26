/**
 * The studio verification FORM on the hub, as a phone sees it (14 Sep 2026).
 *
 * The user: "just 'Get this studio verified', then a separate block with icons
 * for social media, below that Studio Images, then a submit button; 'why
 * verification' opens a tab with the detail." This shoots exactly that: an
 * organization with one unverified studio, the hub with the form, the Why
 * sheet open, and the form after one link and five photos are in — Submit lit.
 *
 * Makes an organization and a studio, signs in as the owner, shoots, ASSERTS,
 * and deletes everything it made.
 *
 *   npm run dev            # in another terminal
 *   node scripts/shots/shoot-verify-form.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "shots");
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

/* a 1×1 PNG — the smallest thing the bucket will call a photo */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = Date.now().toString(36);
  const email = `shot.verify.${stamp}@example.com`;
  const problems = [];
  const check = (ok, what) => {
    console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
    if (!ok) problems.push(what);
  };

  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) }).then((r) => r.json());
  if (!link.hashed_token) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);
  /* 26 Sep 2026: a PERSON owns the studio - the organization login is retired */
  await rest("POST", "/rest/v1/profiles", { id: link.id, full_name: `Shot Verify ${stamp}`, role: "user", city: "Pune", styles: ["Hip-Hop"], created_by: link.id, updated_by: link.id });
  /* an unverified studio — the form's whole reason to exist */
  const [tenant] = await rest("POST", "/rest/v1/businesses", { type: "studio", name: `Shot Verify Studio ${stamp}`, area: "Kothrud", city: "Pune", lat: 18.5204, lng: 73.8567, visibility: "unlisted", created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/business_members", { business_id: tenant.id, user_id: link.id, member_role: "owner", created_by: link.id, updated_by: link.id });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/Google Maps|gstatic|googleapis/i.test(t)) problems.push(`console.error: ${t.slice(0, 300)}`);
  });

  try {
    await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
    await page.waitForLoadState("networkidle");
    await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });

    /* 1. the form, empty */
    const strip = page.getByTestId("studio-verification");
    await strip.waitFor();
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "verify-1-form.png"), fullPage: true });
    const text = (await strip.innerText()).replace(/\s+/g, " ");
    check(/Get this studio verified/.test(text), "the title is the one line asked for");
    check(!/Show DanceOS this studio/.test(text), "the explanatory paragraph is gone from the form");
    check(/SOCIAL LINKS/.test(text) && /STUDIO PHOTOS/.test(text), "two labelled blocks: SOCIAL LINKS, STUDIO PHOTOS");
    for (const p of ["Instagram", "YouTube", "Facebook", "Website"]) {
      check((await strip.getByLabel(p, { exact: true }).count()) === 1, `a field for ${p}`);
    }
    check(text.indexOf("SOCIAL LINKS") < text.indexOf("STUDIO PHOTOS"), "links come before photos");
    const submit = strip.getByRole("button", { name: `Submit ${tenant.name} for verification` });
    check((await submit.count()) === 1, "one Submit button");
    check(await submit.isDisabled(), "Submit is disabled until the form is filled");
    check(/Add one link and 5 photos/.test(text), "the button's hint says what is missing");

    /* 2. Why? — the reasoning, one tap away */
    await strip.getByRole("button", { name: "Why verification" }).click();
    const why = page.getByRole("dialog", { name: "Why verification" });
    await why.waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "verify-2-why.png"), fullPage: true });
    const whyText = (await why.innerText()).replace(/\s+/g, " ");
    check(/Why your links/.test(whyText) && /Why photos of the space/.test(whyText) && /What it gets you/.test(whyText) && /What happens next/.test(whyText), "the Why sheet explains links, photos, the badge and the steps");
    check(/Nobody but you and a DanceOS admin ever sees these/.test(whyText), "…and says who never sees the photos");
    await why.getByRole("button", { name: "Got it" }).click();
    check((await page.getByRole("dialog", { name: "Why verification" }).count()) === 0, "Got it closes it");

    /* 3. one link and five photos: Submit lights up */
    await strip.getByLabel("Instagram", { exact: true }).fill("instagram.com/shotverify");
    await strip.getByLabel("Add photos of your space").setInputFiles(Array.from({ length: 5 }, (_, i) => ({ name: `space-${i + 1}.png`, mimeType: "image/png", buffer: PNG })));
    /* the cropper (18 Sep 2026): five pictures, five presses of "Use this photo" — it steps through the batch */
    const cropper = page.getByRole("dialog", { name: "Crop & preview" });
    for (let k = 1; k <= 5; k += 1) {
      await cropper.getByText(`${k} of 5`).waitFor();
      await cropper.getByRole("button", { name: "Use this photo" }).click();
    }
    await cropper.waitFor({ state: "detached" });
    await strip.getByRole("status", { name: "5 of 5 to 10 photos added" }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    check(await submit.isEnabled(), "Submit is enabled with one link and five photos");
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "verify-3-ready.png"), fullPage: true });

    /* 4. Submit saves the link AND files the request — one press */
    await submit.click();
    await page.getByRole("status", { name: "Studio verification: Under review" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "verify-4-under-review.png"), fullPage: true });
    const saved = await rest("GET", `/rest/v1/businesses?id=eq.${tenant.id}&select=socials`);
    const req = await rest("GET", `/rest/v1/studio_verification_requests?business_id=eq.${tenant.id}&deleted_at=is.null&select=status`);
    check(saved[0]?.socials?.[0]?.url === "https://instagram.com/shotverify", `the typed host was saved as a real address (${saved[0]?.socials?.[0]?.url})`);
    check(req[0]?.status === "pending", "one press filed the request too");
  } finally {
    await browser.close();
    await rest("DELETE", `/rest/v1/studio_photos?business_id=eq.${tenant.id}`).catch(() => undefined);
    await rest("DELETE", `/rest/v1/studio_verification_requests?business_id=eq.${tenant.id}`).catch(() => undefined);
    await rest("DELETE", `/rest/v1/business_members?business_id=eq.${tenant.id}`).catch(() => undefined);
    await rest("DELETE", `/rest/v1/businesses?id=eq.${tenant.id}`).catch(() => undefined);
    await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers: H });
  }

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log("\nThe verification form is a form, and everything made is gone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
