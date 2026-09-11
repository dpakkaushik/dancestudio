import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * The admin panel, phase 2 (10 Sep 2026): reporting, and taking ONE business
 * off Discover.
 *
 * The claims under test, in the order the story tells them:
 *   1. a stranger cannot see the two new screens exist — both 404;
 *   2. a signed-OUT visitor is told reporting needs an account, and is given no
 *      form — the queue is only worth reading if it is answerable;
 *   3. a dancer reports a studio from its own public page, with a reason from
 *      the closed list and a note, and is thanked;
 *   4. reporting the same studio twice is refused in words, not swallowed;
 *   5. a SECOND dancer reporting the same studio turns one complaint into a
 *      case — the card says "1 other reported this";
 *   6. the admin takes that ONE studio off Discover with a reason: it leaves
 *      Discover, its owner is told WHY, and the rest of the organization is
 *      untouched;
 *   7. answering the report tells the reporter, in the admin's own words;
 *   8. both decisions are in the audit log, as sentences;
 *   9. putting it back is one press, and the studio is on Discover again.
 *
 * The first segment also walks R14's gate in the order a real organization
 * meets it (re-cut 10 Sep 2026 for per-studio subscriptions): no studio at all
 * while it is unverified; once verified, a studio that is born PRIVATE with its
 * own Subscribe button; and the studio public the moment an admin grants that
 * studio's subscription — the comp path, which charges nothing. (The paid path
 * is Cashfree's mandate window, which no browser test drives; the webhook spec
 * proves what its events do.)
 *
 * Sign-up uses the admin generate_link API, so no inbox is needed. Everything
 * created carries a stamp and is deleted in afterAll.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";


/** NAME A CITY IN THE PICKER (11 Sep 2026).
 *
 *  `DOS_CITIES` is gone, so there is no `<select name="city">` any more — and
 *  no chips either: the City field is a Google city search, or, on a studio and
 *  an event, the city the placed pin resolved to.
 *
 *  A test must not depend on Google answering — it costs quota and can simply
 *  stop on a demo key — so it takes the deterministic path the product has for
 *  exactly that situation: type the name, take it as typed. When the field
 *  already holds a city (an edit, or a pin that named one) it is a read-back
 *  with a Change button, so that is pressed first.
 *
 *  `page` is wherever the picker lives — the page, or the dialog it is in, so
 *  a sheet's own field is not confused with the page's behind it. */
async function pickCity(page: Page | Locator, city: string) {
  const box = page.getByRole("searchbox", { name: /Search your city/i });
  if ((await box.count()) === 0) {
    await page.getByRole("button", { name: "Change city" }).first().click();
  }
  await box.first().fill(city);
  await page.getByRole("listbox").getByRole("option", { name: `Use "${city}"` }).click();
}
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function signUp(page: Page, email: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) throw new Error(`generate_link failed for ${email}: ${res.status} ${await res.text()}`);
  const link = (await res.json()) as { hashed_token: string; verification_type?: string; id?: string };
  await page.goto(`/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  if (!link.id) throw new Error(`no user id for ${email}`);
  return link.id;
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const ONE_PX_PNG = { name: "face.png", mimeType: "image/png", buffer: PNG_BYTES };
/** R16 (9 Sep 2026): five to ten photos of the space, into a private bucket. */
const FIVE_PNGS = Array.from({ length: 5 }, (_, i) => ({
  name: `space-${i + 1}.png`,
  mimeType: "image/png",
  buffer: PNG_BYTES,
}));

/** Onboarding, both kinds, as it stands since 8 Sep 2026: who first, one name,
 *  the city, the required photo, then a person's styles or an organization's
 *  required links — and an organization's bow files the verification request. */
async function onboard(page: Page, name: string, role: "User" | "Organization", city: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  const isOrg = role === "Organization";
  if (isOrg) await page.getByText("Organization", { exact: true }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill(city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await expect(page.getByLabel(isOrg ? "Your logo" : "Your profile photo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (isOrg) {
    await page.getByLabel("Instagram profile URL").fill(`https://instagram.com/${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    /* R16: the photos of the space — five before it can ask to be verified */
    await expect(page.getByText("Show DanceOS your space")).toBeVisible();
    await page.getByLabel("Add photos of your space").setInputFiles(FIVE_PNGS);
    await expect(page.getByRole("status", { name: "5 of 5 to 10 photos added" })).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    await page.getByRole("button", { name: "Continue · 1 style" }).click();
    await page.getByRole("button", { name: "Skip for now →" }).click();
  }
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

/** Land the admin on a panel route. The SSR middleware refreshes the access
 *  token on EVERY request, and several browser contexts working at once can race
 *  that refresh — one of them then holds a token another has already rotated. A
 *  real admin never notices; a test driving four contexts in lockstep does. */
async function adminGoto(page: Page, email: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await page.goto(path);
    if (res && res.status() === 200) return;
    await signUp(page, email);
  }
  throw new Error(`the admin could not open ${path} — three attempts`);
}

/** A notification stack is a div[role="button"] carrying an onClick, so it does
 *  nothing until React has hydrated — and Playwright cannot see that: a
 *  server-rendered div is already visible and stable, so a click that lands
 *  first is silently lost. Press until aria-expanded says it opened, which is
 *  also the only honest assertion that it did. */
async function pressUntilOpen(page: Page, name: RegExp | string) {
  const control = page.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt++) {
    await control.click();
    try {
      await expect(control).toHaveAttribute("aria-expanded", "true", { timeout: 3_000 });
      return;
    } catch {
      /* not hydrated yet — press again */
    }
  }
  throw new Error(`the stack ${name} never reported itself open`);
}

/** What reaches somebody is stacked by kind; the title shows collapsed, the
 *  body only once the stack is open. */
async function openPeopleStack(page: Page) {
  await page.goto("/notifications");
  await pressUntilOpen(page, /^People — \d+ updates?$/);
}

async function deleteUser(id: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
}

test.describe.serial("the admin panel: businesses and reports", () => {
  let ownerContext: BrowserContext;
  let adminContext: BrowserContext;
  let dancerContext: BrowserContext;
  let secondContext: BrowserContext;
  let anonContext: BrowserContext;
  let owner: Page;
  let admin: Page;
  let dancer: Page;
  let second: Page;
  let anon: Page;
  let ownerId: string | null = null;
  let adminId: string | null = null;
  let dancerId: string | null = null;
  let secondId: string | null = null;

  const stamp = Date.now().toString(36).slice(-6);
  const orgName = `Mod Org ${stamp}`;
  const studioName = `Mod Studio ${stamp}`;
  const dancerName = `Mod Dancer ${stamp}`;
  const secondName = `Mod Witness ${stamp}`;
  const adminEmail = () => `mod-admin-${stamp}@example.com`;
  let studioUrl = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local)");
    ownerContext = await browser.newContext();
    adminContext = await browser.newContext();
    dancerContext = await browser.newContext();
    secondContext = await browser.newContext();
    anonContext = await browser.newContext();
    owner = await ownerContext.newPage();
    admin = await adminContext.newPage();
    dancer = await dancerContext.newPage();
    second = await secondContext.newPage();
    anon = await anonContext.newPage();
  });

  test.afterAll(async () => {
    for (const id of [ownerId, adminId, dancerId, secondId]) if (id) await deleteUser(id);
    await ownerContext?.close();
    await adminContext?.close();
    await dancerContext?.close();
    await secondContext?.close();
    await anonContext?.close();
  });

  test("a verified, subscribed organization puts one studio on Discover", async () => {
    ownerId = await signUp(owner, `mod-owner-${stamp}@example.com`);
    await onboard(owner, orgName, "Organization", "Pune");

    // R14 (9 Sep 2026): THE GATE. A studio cannot be created at all yet, and the
    // hub prints the database's own sentence rather than offering a control that
    // would be refused — the same text create_tenant_with_owner raises.
    await owner.goto("/business");
    await expect(owner.getByRole("button", { name: "Add studio" })).toHaveCount(0);
    await expect(owner.getByRole("status", { name: /^Cannot add a studio: / })).toContainText(
      "A DanceOS admin is checking your organization"
    );

    adminId = await signUp(admin, adminEmail());
    const named0 = await fetch(`${supabaseUrl}/rest/v1/platform_admins`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ user_id: adminId }),
    });
    expect(named0.ok).toBeTruthy();
    await adminGoto(admin, adminEmail(), "/admin/verifications");
    await admin.getByTestId("verification-request").filter({ hasText: orgName }).getByRole("button", { name: `Approve ${orgName}` }).click();
    await expect(admin.getByText(`${orgName} verified — its studios are live`)).toBeVisible({ timeout: 15_000 });

    // verified opens the door (10 Sep 2026: verification alone gates CREATING a
    // studio) — but what it makes is born PRIVATE, and goes public on its OWN
    // subscription, one per studio
    await owner.goto("/business");
    await owner.getByRole("button", { name: "Add studio" }).click();
    await owner.locator('input[name="name"]').fill(studioName);
    await owner.locator('input[name="area"]').fill("Baner");
    await pickCity(owner, "Pune");
    await owner.getByLabel("Room 1 name").fill("Studio A");
    await owner.getByRole("button", { name: "Create studio" }).click();
    await expect(owner.getByText(studioName, { exact: true })).toBeVisible();
    // under the row: where the studio stands, in the database's own sentence,
    // and the one thing to do about it — the real door is Cashfree's mandate
    const strip = owner.getByTestId("studio-subscription");
    await expect(strip.getByText("NOT PUBLIC", { exact: true })).toBeVisible();
    await expect(strip).toContainText("Each studio has its own subscription");
    await expect(strip.getByRole("button", { name: /^Subscribe · ₹1,200\/mo$/ })).toBeVisible();

    // the comp path is the admin's, from the Businesses desk — and it charges nothing
    await adminGoto(admin, adminEmail(), `/admin/businesses?q=${encodeURIComponent(studioName)}`);
    const business = admin.getByTestId("admin-business").filter({ hasText: studioName });
    await expect(business).toContainText("NOT PUBLIC");
    await expect(business).toContainText("NO SUBSCRIPTION");
    await business.getByRole("button", { name: `Grant ${studioName} a subscription` }).click();
    await admin.getByRole("button", { name: `Confirm granting ${studioName} a subscription` }).click();
    await expect(admin.getByText(`${studioName} is subscribed for 12 months — nothing charged, the owner has been told`)).toBeVisible({ timeout: 15_000 });

    // and the studio is on Discover the moment its subscription is
    await owner.goto("/business");
    await expect(owner.getByTestId("studio-subscription").getByText("PUBLIC", { exact: true })).toBeVisible();
    await expect(owner.getByTestId("studio-subscription")).toContainText("GRANTED");

    // the studio is findable the way a dancer finds it, with nothing in between
    dancerId = await signUp(dancer, `mod-dancer-${stamp}@example.com`);
    await onboard(dancer, dancerName, "User", "Pune");
    await dancer.goto("/discover?city=Pune&tab=studios");
    await dancer.getByRole("link", { name: `Open ${studioName}` }).click();
    await dancer.waitForURL(/\/studio\/[0-9a-f-]+$/);
    studioUrl = dancer.url();
  });

  test("reporting needs an account, and says so", async () => {
    const res = await anon.goto(studioUrl);
    expect(res?.status()).toBe(200);
    await expect(anon.getByText("Sign in to report this page.")).toBeVisible();
    await expect(anon.getByRole("button", { name: /^Report / })).toHaveCount(0);
  });

  test("a dancer reports the studio, and cannot report it twice", async () => {
    await dancer.goto(studioUrl);
    await dancer.getByRole("button", { name: `Report ${studioName}` }).click();
    // the reasons are a closed list — a free-text-only report cannot be counted
    await expect(dancer.getByRole("button", { name: "This is not a real studio" })).toBeVisible();
    await dancer.getByRole("button", { name: "It is using someone else's photos" }).click();
    await dancer.getByLabel("ANYTHING ELSE (OPTIONAL)").fill("The room photos are from another studio's Instagram.");
    await dancer.getByRole("button", { name: "Send report" }).click();
    await expect(dancer.getByText("Thank you — a DanceOS admin will read this.")).toBeVisible();

    // one live report per person per thing: the second attempt is answered, not swallowed
    await dancer.goto(studioUrl);
    await dancer.getByRole("button", { name: `Report ${studioName}` }).click();
    await dancer.getByRole("button", { name: "Spam" }).click();
    await dancer.getByRole("button", { name: "Send report" }).click();
    await expect(dancer.getByText(/already reported this — a DanceOS admin is looking at it/)).toBeVisible();
  });

  test("a second reporter turns one complaint into a case", async () => {
    secondId = await signUp(second, `mod-second-${stamp}@example.com`);
    await onboard(second, secondName, "User", "Pune");
    await second.goto(studioUrl);
    await second.getByRole("button", { name: `Report ${studioName}` }).click();
    await second.getByRole("button", { name: "This is not a real studio" }).click();
    await second.getByRole("button", { name: "Send report" }).click();
    await expect(second.getByText("Thank you — a DanceOS admin will read this.")).toBeVisible();

    // the overview counts them as work, and the queue names the case.
    // AT LEAST two, not exactly two: this figure is platform-wide on a database
    // the whole suite shares, so an exact number is only ever right by luck —
    // a run killed before its cleanup left a third behind and failed this as
    // though the product were broken (10 Sep 2026). The claim the story makes is
    // that its own two became work; the queue below names the case itself.
    /* 11 Sep 2026: the figures moved off /admin onto their own desk — the front
       door is the blocks and nothing else (the user: "the main screen will only
       have a designated block for every part of it"). */
    await adminGoto(admin, adminEmail(), "/admin/dashboard");
    const waiting = admin.getByRole("link", { name: /reports to answer/ });
    await expect(waiting).toBeVisible();
    expect(Number((await waiting.innerText()).match(/\d+/)?.[0] ?? 0)).toBeGreaterThanOrEqual(2);

    await adminGoto(admin, adminEmail(), "/admin/reports");
    const card = admin.getByTestId("report-card").filter({ hasText: studioName }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("1 OTHER REPORTED THIS");
    await expect(admin.getByTestId("report-card").filter({ hasText: dancerName })).toContainText(
      "The room photos are from another studio's Instagram."
    );
    // the subject is a door to the page being complained about
    await expect(card.getByRole("link", { name: studioName, exact: true })).toBeVisible();
  });

  test("the admin takes that one studio off Discover, with a reason its owner reads", async () => {
    await adminGoto(admin, adminEmail(), `/admin/businesses?q=${encodeURIComponent(studioName)}`);
    const business = admin.getByTestId("admin-business").filter({ hasText: studioName });
    await expect(business).toBeVisible();
    await expect(business).toContainText("PUBLIC");
    await expect(business).toContainText("1 room");
    await expect(business.getByRole("link", { name: orgName })).toBeVisible();

    // a reason is not optional — the owner reads it, and so does the log
    await business.getByRole("button", { name: `Take ${studioName} off Discover` }).click();
    await expect(admin.getByRole("button", { name: `Confirm taking ${studioName} off Discover` })).toBeDisabled();
    await admin.getByLabel("WHY — THE OWNER READS THIS").fill("Two people say these photos belong to another studio.");
    await admin.getByRole("button", { name: `Confirm taking ${studioName} off Discover` }).click();
    await expect(admin.getByText(`${studioName} is off Discover — the owner has been told why`)).toBeVisible({ timeout: 15_000 });

    // it is gone from Discover — and RLS takes the page itself down with it, so
    // the link somebody already has stops working too. "Off Discover" is not a
    // filter a determined visitor can walk around.
    await dancer.goto("/discover?city=Pune&tab=studios");
    await expect(dancer.getByRole("link", { name: `Open ${studioName}` })).toHaveCount(0);
    expect((await dancer.goto(studioUrl))?.status(), "an unlisted studio's page is not found").toBe(404);

    // and its owner knows why, in the admin's words
    await openPeopleStack(owner);
    await expect(owner.getByText(`${studioName} has been taken off Discover`)).toBeVisible();
    await expect(owner.getByText(/Two people say these photos belong to another studio/)).toBeVisible();

    // the organization itself is untouched — this is the whole point of the
    // screen. Since 11 Sep 2026 a VERIFIED organization's Home carries no
    // standing card (the user: the studio hub is the next step, not a box on
    // Home) — the tick on its own name is the whole verified state.
    await owner.goto("/");
    await expect(owner.getByLabel("Verified").first()).toBeVisible();
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);
  });

  test("answering the report tells the reporter, in the admin's own words", async () => {
    await adminGoto(admin, adminEmail(), "/admin/reports");
    const card = admin.getByTestId("report-card").filter({ hasText: dancerName });
    await card.getByRole("button", { name: `Answer the report about ${studioName}` }).click();
    await expect(card.getByRole("button", { name: "We acted on it" })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("textbox").fill("We have taken the studio off Discover while they replace the photos.");
    await card.getByRole("button", { name: `Send the answer for ${studioName}` }).click();
    await expect(admin.getByText("Marked as acted on — the reporter has been told")).toBeVisible({ timeout: 15_000 });

    // the report is closed, and the answer is on the card
    await adminGoto(admin, adminEmail(), "/admin/reports?status=actioned");
    await expect(admin.getByTestId("report-card").filter({ hasText: dancerName })).toContainText(
      "Answered: We have taken the studio off Discover while they replace the photos."
    );

    // the reporter hears back — a report that vanishes teaches people not to report
    await openPeopleStack(dancer);
    await expect(dancer.getByText("DanceOS acted on your report")).toBeVisible();
    await expect(dancer.getByText(/We have taken the studio off Discover while they replace the photos/)).toBeVisible();

    // the other reporter's report is still open, on its own
    await adminGoto(admin, adminEmail(), "/admin/reports?status=open");
    await expect(admin.getByTestId("report-card").filter({ hasText: secondName })).toBeVisible();
  });

  test("both decisions are in the audit log, as sentences", async () => {
    await adminGoto(admin, adminEmail(), "/admin/audit?action=business.unlist");
    const unlisted = admin.getByTestId("audit-entry").filter({ hasText: studioName }).first();
    await expect(unlisted).toContainText("took off Discover");
    await expect(unlisted).toContainText("Two people say these photos belong to another studio.");

    await adminGoto(admin, adminEmail(), "/admin/audit?action=report.actioned");
    await expect(admin.getByTestId("audit-entry").first()).toContainText(
      "We have taken the studio off Discover while they replace the photos."
    );
  });

  test("putting it back is one press", async () => {
    await adminGoto(admin, adminEmail(), `/admin/businesses?q=${encodeURIComponent(studioName)}`);
    const business = admin.getByTestId("admin-business").filter({ hasText: studioName });
    await expect(business).toContainText("NOT PUBLIC");
    await business.getByRole("button", { name: `Put ${studioName} back on Discover` }).click();
    await expect(admin.getByText(`${studioName} is public again`)).toBeVisible({ timeout: 15_000 });

    await dancer.goto("/discover?city=Pune&tab=studios");
    await expect(dancer.getByRole("link", { name: `Open ${studioName}` })).toBeVisible();
    expect((await dancer.goto(studioUrl))?.status(), "a listed studio's page is back").toBe(200);

    await adminGoto(admin, adminEmail(), "/admin/audit?action=business.list");
    await expect(admin.getByTestId("audit-entry").filter({ hasText: studioName }).first()).toContainText("put back on Discover");
  });

  test("a stranger cannot see that the two new screens exist", async () => {
    for (const path of ["/admin/businesses", "/admin/reports"]) {
      const res = await dancer.goto(path);
      expect(res?.status(), `${path} must 404 for a signed-in stranger`).toBe(404);
    }
  });
});
