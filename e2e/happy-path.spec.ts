import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * The MVP happy path (CLAUDE.md Steps 6+8): signup → onboard studio → create
 * class → owner pulls the booking link off the class detail page → a learner
 * opens that link and books there. Runs against the dev server + the linked
 * Supabase project.
 *
 * Sign-up uses the admin generate_link API (same technique as
 * scripts/auth-proof-email.ps1): no inbox needed, and the link still exercises
 * the real /auth/confirm route. Everything the test creates carries a unique
 * stamp and is deleted in the finally block, so runs don't pile up demo rows.
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

/** Mint a magic link for a (new) email user and land it on /auth/confirm. */
async function signUp(page: Page, email: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) {
    throw new Error(`generate_link failed for ${email}: ${res.status} ${await res.text()}`);
  }
  // the user's fields come back flattened at the root (id, email, …) alongside
  // the link fields — there is no nested `user` object
  const link = (await res.json()) as {
    hashed_token: string;
    verification_type?: string;
    id?: string;
  };
  // gotrue types a brand-new user's link as "signup", a returning user's as
  // "magiclink" — the confirm route accepts whichever the link says it is
  const type = link.verification_type ?? "magiclink";
  await page.goto(`/auth/confirm?token_hash=${link.hashed_token}&type=${type}`);
  if (!link.id) {
    throw new Error(`generate_link returned no user id for ${email}`);
  }
  return link.id;
}

/** a 1×1 PNG — the smallest thing the bucket will call a photo */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const ONE_PX_PNG = { name: "face.png", mimeType: "image/png", buffer: PNG_BYTES };
/** R16 (9 Sep 2026): an organization shows DanceOS five to ten photos of its
 *  space before it may ask to be verified. They go to a PRIVATE bucket, so the
 *  only people who ever see them are the organization and a platform admin. */
const FIVE_PNGS = Array.from({ length: 5 }, (_, i) => ({
  name: `space-${i + 1}.png`,
  mimeType: "image/png",
  buffer: PNG_BYTES,
}));

/** Walk onboarding as it stands since 8 Sep 2026: WHO IS HERE first (User is
 *  the default, Organization is a tap), ONE name, the city, Continue (the row is
 *  made and the photo picker appears — the photo is REQUIRED, so Continue names
 *  it until one is up), then a person's styles and optional links — or an
 *  organization's REQUIRED links AND its five photos (R16, 9 Sep 2026) — the
 *  price of asking to be verified — and "Open DanceOS →" off the bow. An organization's bow says it is in review and
 *  files the verification request as it leaves. */
async function onboard(page: Page, name: string, role: "User" | "Organization", city: string, style = "Hip-Hop") {
  await expect(page).toHaveURL(/\/onboarding/);
  const isOrg = role === "Organization";
  if (isOrg) {
    await page.getByText("Organization", { exact: true }).click();
  }
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill(city);
  // the button reads "Continue" once the name is in (prototype 3820-3821)
  await page.getByRole("button", { name: "Continue" }).click();
  // the row exists now, so the picker is offered — and the button says the photo is missing
  await expect(page.getByRole("button", { name: isOrg ? "Add a logo or photo" : "Add your profile photo" })).toBeVisible();
  await expect(page.getByLabel("Add a photo")).toBeAttached();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await expect(page.getByLabel(isOrg ? "Your logo" : "Your profile photo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (isOrg) {
    // an organization is not asked what it dances, and since 11 Sep 2026 its
    // links are OPTIONAL — what DanceOS checks is each STUDIO's links and photos,
    // later, on the hub, once the studio exists
    await expect(page.getByText("Your organization's links")).toBeVisible();
    await page.getByRole("button", { name: "Skip for now →" }).click();
    await expect(page.getByText(`Welcome, ${name}!`)).toBeVisible();
    await expect(page.getByText("your first studio is next")).toBeVisible();
  } else {
    // styles: the grid, one picked, and the button counts it
    await expect(page.getByText("Your dance styles")).toBeVisible();
    await page.getByRole("button", { name: style, exact: true }).click();
    await page.getByRole("button", { name: "Continue · 1 style" }).click();
    // socials: optional for a person
    await expect(page.getByText("Your social links")).toBeVisible();
    await page.getByRole("button", { name: "Skip for now →" }).click();
    // take a bow — the first word of the one name
    await expect(page.getByText(`Take a bow, ${name.split(" ")[0]}!`)).toBeVisible();
    await expect(page.getByText(style, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

/** A segmented pill and a notification stack are both div[role="button"]
 *  carrying an onClick, so neither does anything until React has hydrated — and
 *  Playwright's own waiting cannot see that: a server-rendered div is already
 *  visible and stable, so a click that lands first is silently lost and nothing
 *  switches. Press it until it reports the change (aria-pressed on a pill,
 *  aria-expanded on a stack), which is also the only honest assertion that it
 *  happened. */
async function pressPill(page: Page, name: RegExp | string, attr: "aria-pressed" | "aria-expanded" = "aria-pressed") {
  const pill = page.getByRole("button", { name }).first();
  await expect(pill).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt++) {
    await pill.click();
    try {
      await expect(pill).toHaveAttribute(attr, "true", { timeout: 3_000 });
      return;
    } catch {
      /* not hydrated yet — press again */
    }
  }
  throw new Error(`the control ${name} never reported itself ${attr === "aria-pressed" ? "pressed" : "open"}`);
}

/** "July" when the clock (read in IST, like the app) is in August — the period
 *  chip the earnings desk offers for last month. */
function lastMonthName(): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long" }).format(new Date(Date.UTC(y, m - 2, 15)));
}

async function deleteUser(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
}


/** ONE STORY, TOLD IN SEGMENTS.
 *
 *  Every screen here is reached the way a person reaches it — through the ones
 *  before — so this stays a single serial story against one seeded world and one
 *  set of browser contexts. It was a single `test()` until it reached 3.5 minutes
 *  against a 300-second timeout: a spec that times out proves nothing, and
 *  "the happy path failed" does not say where. Serial segments keep the story
 *  and give each part its own budget and its own line in the report.
 *
 *  Sign-up uses the admin generate_link API (the technique
 *  scripts/auth-proof-email.ps1 uses): no inbox needed, and the link still
 *  exercises the real /auth/confirm route. Everything created carries a unique
 *  stamp and is deleted in afterAll, so runs do not pile up demo rows. */
test.describe.serial("DanceOS, end to end", () => {
  test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local or env)");

  const stamp: string = Date.now().toString(36);
  const studioName: string = `E2E Studio ${stamp}`;
  const classTitle: string = `E2E Bollywood ${stamp}`;
  /* STAMPED, like the studio and the emails. A constant display name on a
     database this suite shares means a killed run's leftover is
     indistinguishable from this run's trainer, and every name-based locator
     goes ambiguous — it broke the crews picker on 10 Sep 2026, the same failure
     Step 22 recorded. Declared here because later segments look them up too. */
  /* TITLE-CASED, because the app title-cases a PERSON's name as it is typed
     (OnboardingForm: `replace(/(^|s)S/g, c => c.toUpperCase())` — an
     organization's is left alone). The base36 stamp is lowercase, so the stored
     name was "E2E Trainer Mtvv43th" while the spec looked for "…mtvv43th": every
     case-INSENSITIVE locator matched and the one `exact: true` assertion did
     not (10 Sep 2026). Typing what the app will store keeps them in step. */
  const trainerName: string = `E2E Trainer ${stamp.charAt(0).toUpperCase()}${stamp.slice(1)}`;

  let ownerId: string | null = null;
  let learnerId: string | null = null;
  let trainerId: string | null = null;
  let adminId: string | null = null;
  let tenantId: string | null = null;
  /** R15: the organization's own events host — not one of its studios */
  let eventsHostId: string | null = null;

  /* the values a later segment needs from an earlier one */
  let shareSlug = "";
  let studioUrl = "";
  let eventTitle = "";
  let inTwelveDays = "";
  let battleTitle = "";
  let crewName = "";
  let crewId = "";
  let registerTile: Locator;

  let ownerContext: BrowserContext;
  let learnerContext: BrowserContext;
  let trainerContext: BrowserContext;
  let adminContext: BrowserContext;
  let owner: Page;
  let learner: Page;
  let trainer: Page;
  let admin: Page;
  let browserRef: Browser;

  test.beforeAll(async ({ browser }) => {
    browserRef = browser;
    ownerContext = await browser.newContext();
    learnerContext = await browser.newContext();
    trainerContext = await browser.newContext();
    owner = await ownerContext.newPage();
    learner = await learnerContext.newPage();
    trainer = await trainerContext.newPage();
    adminContext = await browser.newContext();
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    /* tenant delete cascades classes → sessions → enrollments; user delete
       cascades the profiles. Cleanup failures surface but don't mask the test. */
    if (tenantId) {
      await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`, { method: "DELETE", headers: adminHeaders });
    }
    if (ownerId) await deleteUser(ownerId);
    if (learnerId) await deleteUser(learnerId);
    if (trainerId) await deleteUser(trainerId);
    /* the admin row cascades with the account */
    if (adminId) await deleteUser(adminId);
    await ownerContext.close();
    await learnerContext.close();
    await trainerContext.close();
    await adminContext.close();
  });

  test("an organization signs up, is verified by an admin, and publishes a class with a room and a trainer", async () => {
    /* THE LONGEST SEGMENT IN THE SUITE, and it has outgrown `test.slow()` (3x
       the 120 s default). It walks onboarding with FIVE photo uploads, the
       verification queue, a studio, that studio's subscription grant through the
       admin's Businesses desk, the Accounts desk, the trainer's Artist plan, a
       staff invite and the two-step class form — a dozen routes, each compiling
       on its first visit on a cold dev server. It timed out at 360 s on the
       staff invite (10 Sep 2026). The real fix is to split the story into
       independently seeded specs (it is on the parity backlog); until then the
       budget says out loud how long the story actually is. */
    test.setTimeout(900_000);
    // ---- studio owner: signup → onboarding -------------------------------
    /* the stamped address, kept: it is what makes this run's rows findable among
       any a killed run left behind (a name is not unique — "E2E Owner" made the
       Accounts desk locator ambiguous on 10 Sep 2026) */
    const ownerEmail = `e2e-owner-${stamp}@example.com`;
    ownerId = await signUp(owner, ownerEmail);
    await onboard(owner, "E2E Owner", "Organization", "Pune");

    // ---- 11 Sep 2026: NOTHING IS WITHHELD FROM A NEW ORGANIZATION ------------
    // Home carries its GST card, NOT VERIFIED, and nothing waits on an admin. The
    // user: "if a user doesn't have a GST he can still create a studio but can't
    // create an event" — so the hub offers Add studio from the first minute and
    // the events desk prints the one sentence that stands between it and an event.
    await owner.goto("/");
    /* 11 Sep 2026: Home says NOTHING about the GST number — it is a one-time
       errand living in Settings, not a permanent card on the busiest screen */
    await expect(owner.getByText("GST number", { exact: true })).toHaveCount(0);
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);

    await owner.goto("/business");
    await expect(owner.getByRole("button", { name: "Add studio" })).toBeVisible();
    await expect(owner.getByRole("status", { name: /^Cannot add a studio: / })).toHaveCount(0);
    await owner.getByRole("link", { name: "Your events" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events$/);
    await expect(owner.getByRole("status", { name: /^Cannot create an event:/ })).toContainText("Add your GST number");
    await expect(owner.getByRole("link", { name: "Create event" })).toHaveCount(0);
    /* and typing the address by hand does not dead-end: it lands on the screen
       that fixes it, which says why (the user's ask, 11 Sep 2026) */
    const eventsUrl = owner.url();
    await owner.goto(`${eventsUrl}/new`);
    await owner.waitForURL(/\/gst\?from=events$/);
    await expect(owner.getByRole("status", { name: "Why you are here" })).toContainText("Events need this first");

    // ---- the organization verifies its own GST number, on the screen the
    // events desk sent it to — format-checked today, the API tomorrow ---------
    // stamped so a run the network killed cannot leave a twin behind (one
    // number, one organization — the database refuses a second)
    const gstin = `EOW${String(Date.now() % 100000).padStart(5, "0")}`;
    await owner.getByLabel("GST number").fill("AB1234");
    await expect(owner.getByText(/three letters then five digits/)).toBeVisible();
    await expect(owner.getByRole("button", { name: "Verify" })).toBeDisabled();
    await owner.getByLabel("GST number").fill(gstin);
    await owner.getByRole("button", { name: "Verify" }).click();
    await expect(owner.getByRole("status", { name: "GST number: verified" })).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByText(/Your organization can put on events/)).toBeVisible();
    /* and Settings carries the row that leads back here */
    await owner.goto("/profile?settings=1");
    await expect(owner.getByRole("link", { name: /GST number/ })).toContainText("verified");

    // ---- a platform admin — named through the service role, never self-serve --
    adminId = await signUp(admin, `e2e-admin-${stamp}@example.com`);
    const named = await fetch(`${supabaseUrl}/rest/v1/platform_admins`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ user_id: adminId }),
    });
    expect(named.ok).toBeTruthy();

    // ---- create the studio (nothing gates it but being an organization since
    // ---- 11 Sep 2026); it is born PRIVATE until it is verified AND subscribed --
    await owner.goto("/business");
    await owner.getByRole("button", { name: "Add studio" }).click();
    await owner.locator('input[name="name"]').fill(studioName);
    await owner.locator('input[name="area"]').fill("Baner");
    await pickCity(owner, "Pune");
    await expect(owner.locator('input[name="city"]')).toHaveValue("Pune");
    // the sheet carries the studio's rooms — "a studio is created WITH its
    // floors" (prototype 2675-2683), and Create is refused until one is named
    await owner.getByLabel("Room 1 name").fill("Studio A");
    await owner.getByRole("button", { name: "Create studio" }).click();

    // the action refreshes the hub in place — the new studio is a row now
    const studioRow = owner.getByText(studioName, { exact: true });
    await expect(studioRow).toBeVisible();

    // ---- 11 Sep 2026: THE STUDIO IS WHAT DANCEOS VERIFIES ----------------------
    // The user: "the user will upload 5-10 images and social media for the
    // studio, then admin will verify the studio, then the studio will get badge,
    // then it will subscribe to go live." Under the row: the strip says Not
    // verified, and Subscribe is NOT offered yet.
    const verifyStrip = owner.getByTestId("studio-verification");
    await expect(verifyStrip).toHaveAttribute("aria-label", "Studio verification: Not verified");
    await expect(owner.getByTestId("studio-subscription").getByRole("button", { name: /^Subscribe/ })).toHaveCount(0);
    // the link lives on the studio page's Edit sheet; the service role stands in
    // for the owner typing it there
    const studioRows = (await (await fetch(`${supabaseUrl}/rest/v1/tenants?name=eq.${encodeURIComponent(studioName)}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    const studioId = studioRows[0]?.id;
    expect(studioId).toBeTruthy();
    const linked = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ socials: [{ platform: "Instagram", url: "https://instagram.com/e2estudio" }] }),
    });
    expect(linked.ok).toBeTruthy();
    // R16, one level down: five photos of THIS studio's space, through the strip
    await owner.goto("/business");
    await verifyStrip.getByLabel("Add photos of your space").setInputFiles(FIVE_PNGS);
    await expect(verifyStrip.getByRole("status", { name: "5 of 5 to 10 photos added" })).toBeVisible({ timeout: 40_000 });
    await verifyStrip.getByRole("button", { name: `Ask DanceOS to verify ${studioName}` }).click();
    await expect(owner.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Under review", { timeout: 15_000 });

    // ---- the admin reads the STUDIO's link and photos in the queue, and says yes
    await admin.goto("/admin/verifications");
    await expect(admin.locator("#dos-main").getByText("Verification queue", { exact: true })).toBeVisible();
    const request = admin.getByTestId("verification-request").filter({ hasText: studioName });
    await expect(request).toBeVisible();
    await expect(request.getByRole("link", { name: /^Instagram/ })).toHaveAttribute("href", "https://instagram.com/e2estudio");
    await expect(request.getByText("5 PHOTOS OF THE SPACE")).toBeVisible();
    await request.getByRole("button", { name: `Approve ${studioName}` }).click();
    await expect(admin.getByText(`${studioName} verified — the owner subscribes it to go live`)).toBeVisible();

    // ---- the badge is on, and only now is Subscribe offered, at the price
    // list's price; the admin's grant is the other door, and charges nothing ---
    await owner.goto("/business");
    await expect(owner.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Verified");
    const studioStrip = owner.getByTestId("studio-subscription");
    await expect(studioStrip.getByText("NOT PUBLIC", { exact: true })).toBeVisible();
    await expect(studioStrip).toContainText("Each studio has its own subscription");
    await expect(studioStrip.getByRole("button", { name: /^Subscribe · ₹1,200\/mo$/ })).toBeVisible();
    await admin.goto(`/admin/businesses?q=${encodeURIComponent(studioName)}`);
    const studioCard = admin.getByTestId("admin-business").filter({ hasText: studioName });
    await expect(studioCard).toContainText("NO SUBSCRIPTION");
    await studioCard.getByRole("button", { name: `Grant ${studioName} a subscription` }).click();
    await admin.getByRole("button", { name: `Confirm granting ${studioName} a subscription` }).click();
    await expect(admin.getByText(`${studioName} is subscribed for 12 months — nothing charged, the owner has been told`)).toBeVisible({ timeout: 15_000 });
    // the studio is public the moment its subscription is, and the row says so
    await owner.goto("/business");
    await expect(owner.getByTestId("studio-subscription").getByText("PUBLIC", { exact: true })).toBeVisible();
    await expect(owner.getByTestId("studio-subscription")).toContainText("GRANTED");
    // the Accounts desk counts it for the organization (the chip appears with the first studio)
    await admin.goto(`/admin/accounts?q=${encodeURIComponent(ownerEmail)}`);
    await expect(admin.getByTestId("admin-account").filter({ hasText: ownerEmail })).toContainText("1/1 STUDIOS SUBSCRIBED");
    // Home: the tick, and NO card (11 Sep 2026 — the user: "after verification I
    // don't need this box; the user will create the studio and to make it
    // discoverable he will subscribe"). The verified state is the tick on the
    // name; the hub's PUBLIC · GRANTED row above is the studio's own state.
    await owner.goto("/");
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);

    // an admin is ADMIN ONLY (9 Sep 2026): no profile, no Home — the panel is
    // its whole app, and the chrome draws it no tab bar, only a way out
    await admin.goto("/");
    await expect(admin).toHaveURL(/\/admin(\/verifications)?$/);
    await expect(admin.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(admin.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    // R13: the tick is on the organization's own name on Home — and since 11 Sep
    // 2026 that IS the verified state: the standing card is gone once the tick
    // is there (the user: the studio hub with its Subscribe button is the next
    // step, not a box on Home)
    await owner.goto("/");
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);
    // and its own Profile is the ONE place its studios appear together (R9, 8 Sep
    // 2026): the group, the studio's door, the figure — and no Followers figure,
    // because nobody follows an organization; people follow its studios
    await owner.goto("/profile");
    await expect(owner.getByText("Your studios")).toBeVisible();
    await expect(owner.getByRole("link", { name: `Open ${studioName}` })).toBeVisible();
    await expect(owner.getByRole("link", { name: "1 studio — open the hub" })).toBeVisible();
    await expect(owner.getByRole("button", { name: /followers$/ })).toHaveCount(0);

    // ---- create + publish a class ----------------------------------------
    await studioRow.click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes/);
    tenantId = owner.url().match(/\/business\/([0-9a-f-]+)\/classes/)?.[1] ?? null;

    // ---- the room came with the studio; give it an amenity (Step 11) ------
    await owner.getByRole("link", { name: "Rooms ›" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/rooms$/);
    // amenities live with the room and show up on the public class page
    await owner.getByRole("button", { name: "Amenities in Studio A" }).click();
    await owner.getByRole("button", { name: "🪞 Mirrors", exact: true }).click();
    await expect(owner.getByText("🪞 Mirrors", { exact: false }).first()).toBeVisible();

    // ---- invite a trainer who is not on DanceOS yet (Step 12b) ------------
    // The whole point of an invite: the address need not have an account. It
    // waits for whoever signs in with it, and only they can accept.
    const trainerEmail = `e2e-trainer-${stamp}@example.com`;
    await owner.goto(`/business/${tenantId}/staff`);
    await owner.getByRole("button", { name: "Invite staff or team member" }).click();
    const inviteSheet = owner.getByRole("dialog", { name: "Invite staff or team member" });
    await inviteSheet.getByLabel("Their name").fill("E2E Trainer");
    await inviteSheet.getByLabel("Their email").fill(trainerEmail);
    await inviteSheet.getByRole("button", { name: "Send invite" }).click();
    // they show as asked-but-unanswered (18575, the prototype's own words), and the QR it promised is here
    await expect(owner.getByText(/Waiting on them to confirm/)).toBeVisible();
    await owner.getByRole("button", { name: "Show the invite for E2E Trainer" }).click();
    const qrSheet = owner.getByRole("dialog", { name: "Invite for E2E Trainer" });
    await expect(qrSheet.getByRole("img", { name: /Invite code/ })).toBeVisible();
    await expect(qrSheet.getByText(/\/join\/[0-9a-f]+/)).toBeVisible();
    await qrSheet.getByRole("button", { name: "Done" }).click();

    // ---- the trainer signs up and finds the invite waiting for them --------
    trainerId = await signUp(trainer, trainerEmail);
    await onboard(trainer, trainerName, "User", "Pune");
    // Pro is the plan, not a role (8 Sep 2026): the trainer gets it now, so the
    // word every later screen prints beside their name is ARTIST. Since 10 Sep
    // 2026 the plan is ₹700 a month through Cashfree's mandate window, which no
    // browser test drives — the admin's grant is the other door, from the
    // Accounts desk, and it charges nothing
    await trainer.goto("/subscription");
    await expect(trainer.getByRole("button", { name: /^Subscribe · ₹700\/mo$/ })).toBeVisible();
    await admin.goto(`/admin/accounts?q=${encodeURIComponent(trainerName)}`);
    const trainerAccount = admin.getByTestId("admin-account").filter({ hasText: trainerName });
    await trainerAccount.getByRole("button", { name: `Grant ${trainerName} the Artist plan` }).click();
    await admin.getByRole("button", { name: `Confirm the Artist plan for ${trainerName}` }).click();
    await expect(admin.getByText(`${trainerName} has the Artist plan for 12 months — nothing charged`)).toBeVisible({ timeout: 15_000 });
    await trainer.goto("/subscription");
    await expect(trainer.getByText("Active · granted")).toBeVisible({ timeout: 15_000 });
    await trainer.goto("/");
    const askCard = trainer.getByRole("link", { name: new RegExp(`${studioName} wants you on the team`) });
    await expect(askCard).toBeVisible();
    await askCard.click();
    await trainer.waitForURL(/\/join\/[0-9a-f]+$/);
    await trainer.getByRole("button", { name: "Join the team" }).click();
    // accepting lands them on the studio they just joined
    await trainer.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);

    // ---- the class form is a two-step wizard (Step 11) --------------------
    await owner.goto(`/business/${tenantId}/classes`);
    await owner.getByText("Create class").click();
    // step 1 — basics: when, what, the name, and the room it runs in
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await owner.getByLabel("Class date").fill(inThreeDays);
    // the style is picked through the app's one picker (F4 / W2): open it, search, choose
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByLabel("Search styles").fill("Bolly");
    await owner.getByRole("button", { name: "Bollywood", exact: true }).click();
    await owner.getByLabel("Class name").fill(classTitle);
    await owner.getByRole("button", { name: "Hold it in Studio A" }).click();
    // the button reads "Continue" once every answer on the step is given (15573-15578)
    await owner.getByRole("button", { name: "Continue" }).click();
    // the room now defines the capacity (prototype: "defined by Studio A")
    await expect(owner.getByText(/defined by Studio A/)).toBeVisible();
    // and the payoff of Step 12b: the artist picker finally has somebody to
    // offer, because a real person accepted a real invite
    await expect(owner.getByRole("button", { name: `${trainerName} takes this class` })).toBeVisible();
    // Step 13: put them on it AT A RATE. The rate field is the owner's alone —
    // a trainer's form never shows it, and the RPCs refuse it from anybody else.
    await owner.getByRole("button", { name: `${trainerName} takes this class` }).click();
    await owner.getByLabel("What a session pays the artist").fill("900");
    // step 2 — people & price. Free trial: the ₹300 default would route booking
    // through Razorpay (Step 9), which the paid-webhook spec covers.
    await owner.getByLabel("Price per session").fill("0");
    // Publish asks first — the confirm sheet with the calendar-style card (15586-15625)
    await owner.getByRole("button", { name: "Publish class" }).click();
    await owner.getByRole("dialog", { name: "Publish this class?" }).getByRole("button", { name: "Publish it" }).click();

    // back on the register, the class sits under the Published tab — the tile
    // headlines the STYLE (a class is its style, per the prototype), so the
    // title only appears in the tile's aria-label (a link now: it opens /c/{slug})
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);
    registerTile = owner.locator(`[aria-label="Open ${classTitle}"]`);
    await expect(registerTile).toBeVisible();

    // ---- the studio calendar (Step 14): the same session, on the schedule ---
    // Schedule lists every day with something on it, so the class three days
    // out is there; Month opens on today, which honestly has nothing on.
    await owner.getByRole("link", { name: "Calendar ›" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/calendar$/);
    await expect(owner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
    await owner.getByRole("button", { name: "Month", exact: true }).click();
    await expect(owner.getByText("nothing on")).toBeVisible();
    await owner.getByRole("button", { name: "Day", exact: true }).click();
    await expect(owner.getByText("8 am")).toBeVisible();
    await owner.goto(`/business/${tenantId}/classes`);

    // ---- the earnings desk reads that same ledger (Step 13) ---------------
    // Owner-only, and it is the pay side of the prototype's S_earn — not a
    // payroll desk: the studio settles by bank or UPI and records it here.
    await owner.getByRole("link", { name: "Earnings ›" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/earnings$/);
    await expect(owner.getByText(/DanceOS does not move this money/)).toBeVisible();
    // the class runs in three days, so nothing has been taught yet
    await expect(owner.getByText(/Nobody has taught a session yet/)).toBeVisible();

    // ---- the income half of the same screen (Step 13b part 2b) --------------
    // GROSS · {month} is counted from captured payments — none yet, so the card
    // reads ₹0 and HOW STUDENTS PAID says so instead of drawing an empty bar.
    // A past month's chip opens its statement, honestly empty for a new studio.
    await expect(owner.getByText(/^GROSS · [A-Z]+$/)).toBeVisible();
    await expect(owner.getByText("HOW STUDENTS PAID")).toBeVisible();
    await expect(owner.getByText(/No payments yet this month/)).toBeVisible();
    await owner.getByRole("button", { name: lastMonthName(), exact: true }).click();
    await expect(owner.getByText("WHERE IT CAME FROM")).toBeVisible();
    await expect(owner.getByText("DEDUCTIONS")).toBeVisible();
    await expect(owner.getByText("Net settled")).toBeVisible();
    await expect(owner.getByText(/₹0 net · 0 payments/).first()).toBeVisible();
    await owner.getByRole("button", { name: "This month", exact: true }).click();
    await expect(owner.getByText(/^GROSS · [A-Z]+$/)).toBeVisible();

    // the teaching side of the same screen, for the person who was asked
    await trainer.goto("/earnings");
    await expect(trainer.getByText(/Paid by each studio on their own cycle/)).toBeVisible();
  });

  test("the class page, its share link, and a learner booking from it", async () => {
    // ---- the class detail page + its booking link (Step 8) ----------------
    await owner.goto(`/business/${tenantId}/classes`);
    await registerTile.click();
    await owner.waitForURL(/\/c\/[a-z0-9-]+$/);
    shareSlug = owner.url().match(/\/c\/([a-z0-9-]+)$/)?.[1] ?? "";
    expect(shareSlug).not.toBe("");

    // ---- the class page's own Earnings tab (Step 13b part 2a) -------------
    // What this session made, added up in one place. This class is free and
    // three days out, so every figure is honestly zero — the point of running it
    // here is that it exercises the payments/refunds embeds through orders,
    // which the proof script (querying PostgREST directly) would never catch.
    await owner.getByRole("button", { name: "Earnings" }).click();
    await expect(owner.getByText("WHAT THIS SESSION MADE")).toBeVisible();
    await expect(owner.getByText("Came in")).toBeVisible();
    await expect(owner.getByText("nothing refunded.")).toBeVisible();
    await expect(
      owner.getByRole("link", { name: /See it beside everything else you earn/ })
    ).toBeVisible();
    // the register rows carry the seat's money meta (12126) — this class is free
    await owner.getByRole("button", { name: "Attendance" }).click();
    await expect(owner.getByText("Nobody has booked yet.")).toBeVisible();
    // back to Details so the share step below finds the poster
    await owner.getByRole("button", { name: "Details" }).click();
    // the team section is always drawn (12356), with the owner's door to add somebody
    await expect(owner.getByText("CLASS ASSISTANTS")).toBeVisible();
    await expect(owner.getByRole("link", { name: "Add someone to the team" })).toBeVisible();
    // the artist column is a door to the person (11900), and Change goes to the form
    await expect(owner.getByRole("link", { name: `Open ${trainerName}` })).toBeVisible();
    await expect(owner.getByRole("link", { name: "Change the artist taking this class" })).toBeVisible();
    // the Poster chip in the sleeve opens the drawn designs (11812, 12768)
    await owner.getByRole("button", { name: "Change the poster" }).click();
    const posterSheet = owner.getByRole("dialog", { name: "Poster" });
    await posterSheet.getByRole("button", { name: "Poster design Split" }).click();
    await expect(owner.getByText("Poster set — Split")).toBeVisible();
    await posterSheet.getByRole("button", { name: "Done" }).click();

    // sharing lives behind the poster now — the pass sheet carries the link (Step 10)
    await owner.getByRole("button", { name: "Open the pass" }).click();
    const sheet = owner.getByRole("dialog", { name: "Class pass" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(`/c/${shareSlug}`)).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();

    // ---- learner: signup → onboard → open the shared link → book ----------
    learnerId = await signUp(learner, `e2e-learner-${stamp}@example.com`);
    await onboard(learner, "E2E Learner", "User", "Pune");

    // booking is two steps now (Step 9): the bar opens the confirm sheet, and a
    // free class confirms without payment
    await learner.goto(`/c/${shareSlug}`);
    // AT THE STUDIO carries what the room has in it (Step 11) — and the studio row is a door (12291)
    await expect(learner.getByText("🪞 Mirrors")).toBeVisible();
    await expect(learner.getByRole("link", { name: `Open ${studioName}` })).toBeVisible();
    // what the class made is the studio's business, not the room's
    await expect(learner.getByText("WHAT THIS SESSION MADE")).toHaveCount(0);
    await learner.getByRole("button", { name: "Book free trial" }).click();
    const confirmSheet = learner.getByRole("dialog", { name: "Confirm — no payment" });
    await expect(confirmSheet).toBeVisible();
    await confirmSheet.getByRole("button", { name: "Confirm free trial" }).click();
    await expect(learner.getByText(/You.re booked/)).toBeVisible();
    await expect(learner.getByText("Tap the poster above for your code.")).toBeVisible();
    // and the owner's register now reads the seat's meta: a free seat
    await owner.reload();
    await owner.getByRole("button", { name: "Attendance" }).click();
    await expect(owner.getByText("free seat")).toBeVisible();
    await owner.getByRole("button", { name: "Details" }).click();

    // the booking shows up on the learner's own list too
    await learner.goto("/my-classes");
    await expect(learner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();

    // ---- and on their calendar (Step 14): a booking is what they TRAIN in ----
    await learner.getByRole("link", { name: "Calendar ›" }).click();
    await learner.waitForURL(/\/calendar$/);
    await expect(learner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
    await expect(learner.getByRole("button", { name: "Train: 1" })).toBeVisible();
    await expect(learner.getByRole("button", { name: "Teach: 0" })).toBeVisible();
  });

  test("follows, the public page and the enquiry loop", async () => {
    // ---- Step 15: the studio's public page — found on Discover, followed, and
    // its schedule opened. The follower figure is counted, not stored.
    await learner.goto("/discover?city=Pune&tab=studios");
    await learner.getByRole("link", { name: `Open ${studioName}` }).click();
    await learner.waitForURL(/\/studio\/[0-9a-f-]+$/);
    studioUrl = learner.url();
    await expect(learner.getByText(studioName).first()).toBeVisible();
    await expect(learner.getByTestId("followers-count")).toHaveText("0");
    await learner.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(learner.getByRole("button", { name: "Following" })).toBeVisible();
    await expect(learner.getByTestId("followers-count")).toHaveText("1");
    // the schedule is the public calendar: published classes still to come
    await learner.getByRole("link", { name: "Schedule" }).click();
    await learner.waitForURL(/\/schedule$/);
    await expect(learner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
    // and the follow shows on their own profile — the Following figure opens the
    // sheet (S_profiletab 11335), and the studio is a row in it
    await learner.goto("/profile");
    await learner.getByRole("button", { name: /following$/ }).click();
    await expect(learner.getByRole("dialog", { name: "Following" }).getByRole("link", { name: new RegExp(studioName) })).toBeVisible();
    await learner.keyboard.press("Escape").catch(() => {});

    // ---- Step 18: an enquiry, from the profile to the studio's Inbox and back ----
    // The learner asks for private sessions; the studio finds it waiting, opens
    // it and quotes; the learner accepts; the studio records the advance. The
    // stage on the page is DERIVED from the live quote at every step.
    await learner.goto(studioUrl);
    await learner.getByRole("button", { name: "Enquiry", exact: true }).click();
    const enqSheet = learner.getByRole("dialog", { name: `Enquiry to ${studioName}` });
    await enqSheet.getByText("Private Sessions", { exact: true }).click();
    const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await enqSheet.getByLabel("Date of event").fill(inTenDays);
    await enqSheet.getByLabel("Session format").selectOption("One-on-one");
    await enqSheet.getByLabel("Dance style").selectOption("Bollywood");
    await enqSheet.getByLabel("Level").selectOption("Beginner");
    await enqSheet.getByLabel("Where they train").selectOption("At the studio");
    /* the sheet's city is the CityPicker — a Google city search with the typed
       name as the way out; the old two clicks opened a hand-rolled dropdown */
    await pickCity(enqSheet, "Pune");
    await enqSheet.getByLabel("Message").fill("Eight evening sessions before a wedding.");
    await enqSheet.getByRole("button", { name: "Send enquiry" }).click();
    await expect(enqSheet.getByText("Enquiry sent")).toBeVisible();
    await enqSheet.getByRole("button", { name: "Done" }).click();

    await owner.goto("/inbox");
    await expect(owner.getByText("1 waiting on you")).toBeVisible();
    await pressPill(owner, /^Enquiries — 1 waiting/);
    await owner.getByRole("link", { name: "Private Sessions enquiry from E2E Learner" }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(owner.getByText("WHAT THEY ASKED FOR")).toBeVisible();
    await owner.getByRole("button", { name: "Send a quote" }).click();
    await owner.getByLabel("Project cost").fill("5000");
    await owner.getByRole("button", { name: "Send this quote" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Quoted");

    await learner.goto("/inbox");
    await pressPill(learner, /^Enquiries/);
    await learner.getByRole("button", { name: "Sent enquiries" }).click();
    await learner.getByRole("link", { name: `Private Sessions enquiry to ${studioName}` }).click();
    await learner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(learner.getByTestId("quote-1-state")).toHaveText("Waiting on an answer");
    await learner.getByRole("button", { name: "Accept this quote" }).click();
    await expect(learner.getByTestId("enquiry-stage")).toHaveText("Confirmed");
    // the sender cannot pay yet — the rail has no account — and the page says so
    await expect(learner.getByText(/Payments aren.t switched on yet/)).toBeVisible();

    await owner.reload();
    await owner.getByRole("button", { name: "Mark advance received" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Advance paid");
  });

  test("events: publish, find on Discover, book a seat, run the door", async () => {
    // ---- Step 21: an event, from the desk to Discover to the door ----
    // The owner publishes a FREE showcase (a showcase is WATCHED: tickets on, no
    // entries) through the two-step form; the learner finds it on Discover's
    // Events tab, opens its page, books a seat through the confirm sheet and
    // the payment step (free, so it confirms without a rail), holds the ticket
    // on the page and under Your tickets; the owner opens the manager's
    // Spectators register and checks them in. Seats are COUNTED, never stored.
    eventTitle = `E2E Showcase ${stamp}`;
    // R15 (9 Sep 2026): AN EVENT IS THE ORGANIZATION'S. The studio's register
    // no longer offers an Events door, because a studio cannot host one — the
    // hub has ONE desk for the organization, and the public page will name the
    // organization as host.
    await owner.goto(`/business/${tenantId}/classes`);
    await expect(owner.getByRole("link", { name: "Events", exact: true })).toHaveCount(0);
    await owner.goto("/business");
    await owner.getByRole("link", { name: "Your events" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events$/);
    eventsHostId = owner.url().match(/\/business\/([0-9a-f-]+)\/events/)?.[1] ?? null;
    expect(eventsHostId).not.toBe(tenantId);
    await owner.getByRole("link", { name: "Create event" }).click();
    await owner.waitForURL(/\/events\/new$/);
    await owner.getByRole("button", { name: "Showcase", exact: true }).click();
    await owner.getByLabel("Event name").fill(eventTitle);
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByRole("button", { name: "All styles", exact: true }).click();
    inTwelveDays = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await owner.getByLabel("First day").fill(inTwelveDays);
    await owner.getByLabel("Venue name").fill("E2E Hall");
    await pickCity(owner, "Pune");
    await owner.getByLabel("Google Maps link").fill("https://maps.google.com/?q=E2E+Hall+Pune");
    await owner.getByRole("button", { name: "Continue", exact: true }).click();
    // step 2 — tickets are on by default; one free tier is what a showcase needs
    await owner.getByRole("button", { name: "Free entry · free" }).click();
    await owner.getByRole("button", { name: "Add tier" }).click();
    await expect(owner.getByText("150 seats across 1 tier")).toBeVisible();
    await owner.getByRole("button", { name: "Publish event" }).click();
    await owner.getByRole("dialog", { name: "Publish this event?" }).getByRole("button", { name: "Confirm & publish" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events$/);
    await expect(owner.getByRole("link", { name: `${eventTitle} — Showcase` })).toBeVisible();

    // the learner finds it on Discover — the same card — and books a seat
    await learner.goto("/discover?city=Pune&tab=events");
    await learner.getByRole("link", { name: `${eventTitle} — Showcase` }).click();
    await learner.waitForURL(/\/e\/[a-z0-9-]+$/);
    await expect(learner.getByText("TICKETS", { exact: true })).toBeVisible();
    await expect(learner.getByText("0 booked · 150 still available")).toBeVisible();
    // a showcase offers no participant door — the host builds the line-up
    await expect(learner.getByRole("button", { name: "Register to compete" })).toHaveCount(0);
    await learner.getByRole("button", { name: "Book as a spectator" }).click();
    const seatSheet = learner.getByRole("dialog", { name: "Complete your booking" });
    await expect(seatSheet.getByText(/1 LEFT|150 LEFT/)).toBeVisible();
    await seatSheet.getByRole("button", { name: "Continue", exact: true }).click();
    const paySheet = learner.getByRole("dialog", { name: "Confirm your booking" });
    await expect(paySheet.getByText("Free", { exact: true })).toBeVisible();
    await paySheet.getByRole("button", { name: "Confirm booking" }).click();
    // the first booking on this route compiles its action on a dev server — allow for it
    await expect(learner.getByTestId("held-booking")).toBeVisible({ timeout: 15_000 });
    await expect(learner.getByText(/You.re booked/)).toBeVisible();
    await expect(learner.getByText("1 booked · 149 still available")).toBeVisible();
    // and it sits under Your tickets on My classes
    await learner.goto("/my-classes");
    await expect(learner.getByText("Your tickets")).toBeVisible();
    await expect(learner.getByRole("link", { name: `Open ${eventTitle}` })).toBeVisible();

    // the owner runs the door: the manager's Spectators register, Check in → In
    await owner.getByRole("link", { name: `${eventTitle} — Showcase` }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events\/[0-9a-f-]+$/);
    await expect(owner.getByText("EVENT DETAILS")).toBeVisible();
    await owner.getByRole("button", { name: "Spectators" }).click();
    await expect(owner.getByText("GATE LIST · 0/1 arrived")).toBeVisible();
    await owner.getByRole("button", { name: "Check in E2E Learner" }).click();
    await expect(owner.getByRole("button", { name: "Check out E2E Learner" })).toBeVisible();
    await expect(owner.getByText("GATE LIST · 1/1 arrived")).toBeVisible();
  });

  test("crews: ask, confirm, and a crew entry made by its leader", async () => {
    // ---- Step 22: a crew, from the hub to the door of an event ----
    // The learner creates a crew and asks the trainer onto it (a roster is a
    // public page, so being on one is an ASK, never a write); the trainer
    // confirms from the Inbox's Requests desk; the crew's public page prints
    // both and Discover's Crews tab lists it. Then the owner publishes a crew
    // battle and the learner enters it AS THE CREW'S LEADER from the crews they
    // lead — a typed name no longer books — the organiser's register says so,
    // and the crew's page carries the entry as its battle record.
    crewName = `E2E Crew ${stamp}`;
    await learner.goto("/crews");
    await expect(learner.getByText("You do not lead a crew yet.")).toBeVisible();
    await learner.getByRole("link", { name: "＋ Create crew" }).click();
    await learner.waitForURL(/\/crews\/new$/);
    await learner.getByLabel("Crew name").fill(crewName);
    await learner.getByLabel("Dance style", { exact: true }).click();
    await learner.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    await learner.getByRole("button", { name: "Add a member" }).click();
    await learner.getByLabel("Search DanceOS for a dancer").fill(trainerName);
    await learner.getByRole("button", { name: `Add ${trainerName} to the crew` }).click();
    await expect(learner.getByText("MEMBERS · 1 added")).toBeVisible();
    await learner.getByRole("button", { name: "Save crew" }).click();
    await learner.getByRole("dialog", { name: "Confirm · create crew" }).getByRole("button", { name: "Confirm & create" }).click();
    await learner.waitForURL(/\/crews\/[0-9a-f-]+\/manage$/);
    crewId = learner.url().match(/\/crews\/([0-9a-f-]+)\/manage$/)![1];
    // ASKED IS NOT JOINED: the desk says the trainer has not answered, and counts one member
    await expect(learner.getByText("⏳ Waiting on them to confirm")).toBeVisible();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("1");

    // the trainer answers from the Requests desk — only they can
    await trainer.goto("/inbox");
    // the desk counts everything waiting on them — an earlier class ask included — so the crew
    // ask is found by its own words rather than by the total
    await expect(trainer.getByRole("button", { name: `Open the a crew member request from E2E Learner` })).toBeVisible();
    await pressPill(trainer, /^Requests — \d+ waiting/);
    await expect(trainer.getByText(`wants to add you to ${crewName}`)).toBeVisible();
    await trainer.getByRole("button", { name: `Confirm ${crewName}` }).click();
    await expect(trainer.getByText(`wants to add you to ${crewName}`)).toHaveCount(0);
    await learner.reload();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("2");
    await expect(learner.getByText("Member", { exact: true })).toBeVisible();

    // the public page prints the confirmed roster; the hub knows which list the trainer belongs on
    await trainer.goto(`/crew/${crewId}`);
    await expect(trainer.getByTestId("crew-members-count")).toHaveText("2");
    await expect(trainer.getByText("You are in this crew")).toBeVisible();
    await expect(trainer.getByText("Crew leader", { exact: true })).toBeVisible();
    await trainer.goto("/crews");
    await expect(trainer.getByText("CREWS YOU ARE IN")).toBeVisible();
    await expect(trainer.getByRole("link", { name: `${crewName} — open the profile` })).toBeVisible();
    await trainer.goto("/discover?city=Pune&tab=crews");
    await expect(trainer.getByRole("link", { name: `${crewName} — Crew` })).toBeVisible();

    // the owner publishes a FREE crew battle: crews only, eight places, no spectator tickets
    battleTitle = `E2E Battle ${stamp}`;
    await owner.goto(`/business/${eventsHostId}/events/new`);
    await owner.getByRole("button", { name: "Battle Tournament", exact: true }).click();
    await owner.getByLabel("Event name").fill(battleTitle);
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByRole("button", { name: "All styles", exact: true }).click();
    await owner.getByLabel("First day").fill(inTwelveDays);
    await owner.getByLabel("Venue name").fill("E2E Arena");
    await pickCity(owner, "Pune");
    await owner.getByLabel("Google Maps link").fill("https://maps.google.com/?q=E2E+Arena+Pune");
    await owner.getByRole("button", { name: "Continue", exact: true }).click();
    await owner.getByRole("button", { name: "Crew", exact: true }).click();
    await owner.getByLabel("Crew places").fill("8");
    await owner.getByRole("button", { name: "Selling tickets" }).click();
    await owner.getByRole("button", { name: "Publish event" }).click();
    await owner.getByRole("dialog", { name: "Publish this event?" }).getByRole("button", { name: "Confirm & publish" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events$/);
    await expect(owner.getByRole("link", { name: `${battleTitle} — Battle tournament` })).toBeVisible();

    // the leader enters the crew from the crews they lead — pre-picked, since they lead one
    await learner.goto("/discover?city=Pune&tab=events");
    await learner.getByRole("link", { name: `${battleTitle} — Battle tournament` }).click();
    await learner.waitForURL(/\/e\/[a-z0-9-]+$/);
    await learner.getByRole("button", { name: "Register to compete" }).click();
    const entrySheet = learner.getByRole("dialog", { name: "Register to perform" });
    await expect(entrySheet.getByRole("button", { name: `Enter as ${crewName}` })).toHaveAttribute("aria-pressed", "true");
    await entrySheet.getByRole("button", { name: "Continue", exact: true }).click();
    await learner.getByRole("dialog", { name: "Confirm your entry" }).getByRole("button", { name: "Confirm entry" }).click();
    await expect(learner.getByText(/You.re entered/)).toBeVisible();
    await expect(learner.getByText(`Crew entry · ${crewName}`)).toBeVisible();

    // the organiser's register names the crew and says who put it forward
    await owner.getByRole("link", { name: `${battleTitle} — Battle tournament` }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events\/[0-9a-f-]+$/);
    await owner.getByRole("button", { name: "Participants" }).click();
    await expect(owner.getByText("Crew entry · entered by its leader · registered")).toBeVisible();

    // and the crew's page carries it as its battle record
    await learner.goto(`/crew/${crewId}`);
    await expect(learner.getByRole("link", { name: `Open ${battleTitle}` })).toBeVisible();
  });

  test("Discover: search, the style rail and the filter sheet", async () => {
    // ---- Step 23: search + Discover filters ----
    // The one search box finds the studio by a prefix of its name and opens its
    // page; the style rail narrows the classes shelf (Bollywood keeps the class,
    // an unrelated style empties it with a Clear filters door); on Events the
    // Battles quick chip keeps the battle and drops the showcase, the sheet's
    // Cheapest sort lands in the URL and the button counts two, and the events
    // box narrows by title.
    await learner.goto("/discover?city=Pune&tab=classes");
    /* the STAMPED name, not the shared "E2E Studio" prefix: search_dance_os caps
       each kind at three ordered by name, so leftovers from a killed run pushed
       this run own studio out of its own result list (10 Sep 2026) */
    await learner.getByLabel("Search DanceOS").fill(studioName);
    await learner.getByRole("option", { name: `${studioName} — Studio · Pune` }).click();
    await learner.waitForURL(new RegExp(`/studio/${tenantId}$`));

    await learner.goto("/discover?city=Pune&tab=classes");
    await expect(learner.getByRole("link", { name: new RegExp(classTitle) })).toBeVisible();
    await learner.getByRole("button", { name: "Bollywood", exact: true }).click();
    await learner.waitForURL(/styles=Bollywood/);
    await expect(learner.getByRole("button", { name: "Bollywood", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(learner.getByRole("link", { name: new RegExp(classTitle) })).toBeVisible();
    // a style the studio does not teach empties the shelf, with a door back
    await learner.goto("/discover?city=Pune&tab=classes&styles=Kalbelia");
    await expect(learner.getByText("Nothing in Pune matches that")).toBeVisible();
    await learner.getByRole("link", { name: "Clear filters" }).click();
    await expect(learner.getByRole("link", { name: new RegExp(classTitle) })).toBeVisible();

    await learner.goto("/discover?city=Pune&tab=events");
    await expect(learner.getByRole("link", { name: `${eventTitle} — Showcase` })).toBeVisible();
    await learner.getByRole("button", { name: "Battles", exact: true }).click();
    await learner.waitForURL(/cat=battle/);
    await expect(learner.getByRole("link", { name: `${battleTitle} — Battle tournament` })).toBeVisible();
    await expect(learner.getByRole("link", { name: `${eventTitle} — Showcase` })).toHaveCount(0);
    await learner.getByRole("button", { name: "All filters" }).click();
    const filterSheet = learner.getByRole("dialog", { name: "Filters" });
    await filterSheet.getByRole("button", { name: "Cheapest" }).click();
    await filterSheet.getByRole("button", { name: "Show results" }).click();
    await learner.waitForURL(/sort=price/);
    await expect(learner.getByRole("button", { name: "All filters" })).toHaveText(/Filters · 2/);
    await learner.getByRole("button", { name: "Clear filters" }).click();
    await learner.waitForURL((url) => !url.search.includes("cat=") && !url.search.includes("sort="));
    await expect(learner.getByRole("link", { name: `${eventTitle} — Showcase` })).toBeVisible();
    await learner.getByLabel("Search events").fill(battleTitle);
    await learner.waitForURL(/q=E2E/);
    await expect(learner.getByRole("link", { name: `${eventTitle} — Showcase` })).toHaveCount(0);
    await expect(learner.getByRole("link", { name: `${battleTitle} — Battle tournament` })).toBeVisible();
  });

  test("notifications: the bell, the stacks and what reaches you", async () => {
    // ---- Step 24: notifications ----
    // Nothing in this leg raises a notification: everything the story already did
    // — a seat booked, a person asked onto a class and answering, a crew ask
    // confirmed, an entry made — raised one through a trigger. So the bell is
    // read as evidence of the rest of the test, which is the whole claim.
    await owner.goto("/");
    await expect(owner.getByTestId("bell-badge")).toBeVisible();
    await owner.getByRole("link", { name: /^Notifications/ }).click();
    await owner.waitForURL(/\/notifications$/);
    await expect(owner.getByText("What needs you")).toBeVisible();
    // the stacks are one per kind, and the studio's story made at least these two.
    // (People is the trainer's and the crew leader's, further down.)
    await expect(owner.getByRole("button", { name: /^Bookings — \d+ updates?$/ })).toBeVisible();
    await expect(owner.getByRole("button", { name: /^Events — \d+ updates?$/ })).toBeVisible();
    // open the Bookings stack and read a real row: the learner booking the class
    await pressPill(owner, /^Bookings — \d+ updates?$/, "aria-expanded");
    await expect(owner.getByText(`E2E Learner booked ${classTitle}`)).toBeVisible();
    // Mark read on the stack: the count drops and the badge follows
    await owner.getByRole("button", { name: "Mark Bookings read" }).click();
    await expect(owner.getByText("Bookings marked read")).toBeVisible();
    // a kind switched off hides its stack, and nothing is deleted by it
    await owner.getByRole("button", { name: "Notification settings" }).click();
    const notifSheet = owner.getByRole("dialog", { name: "Notification settings" });
    await notifSheet.getByRole("button", { name: "Bookings" }).click();
    await notifSheet.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByRole("button", { name: /^Bookings — / })).toHaveCount(0);
    await expect(owner.getByRole("button", { name: /^Events — / })).toBeVisible();
    // switch it back on and the history is there — the prototype's own promise
    await owner.getByRole("button", { name: "Notification settings" }).click();
    await notifSheet.getByRole("button", { name: "Bookings" }).click();
    await notifSheet.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByRole("button", { name: /^Bookings — \d+ updates?$/ })).toBeVisible();
    // a row opens the thing it is about: the crew ask the trainer answered
    await trainer.goto("/notifications");
    await trainer.getByRole("button", { name: /^People — \d+ updates?$/ }).click();
    await expect(trainer.getByText(`${crewName} wants you on the roster`)).toBeVisible();
    // and clearing a stack empties it for good (soft-deleted, gone from the screen)
    await trainer.getByRole("button", { name: "Clear all People" }).click();
    await expect(trainer.getByText("People cleared")).toBeVisible();
    await expect(trainer.getByRole("button", { name: /^People — / })).toHaveCount(0);
  });

  test("stats: the record, the history library and the boards", async () => {
    // ---- Step 25: stats ----
    // Nothing this story creates has ENDED (every session it books is in the future),
    // so the record is honestly empty — and saying so is the assertion. What is real is
    // the crew the story built, which is why the Crews board can rank it, place beside
    // population.
    await learner.goto("/stats");
    await expect(learner.getByTestId("stats-points")).toBeVisible();
    await expect(learner.getByTestId("stat-attended")).toHaveText("0");
    await expect(learner.getByText(/Nothing has happened yet/)).toBeVisible();
    // the numbers open into the lists behind them — with nothing on the record, none opens
    await expect(learner.getByRole("button", { name: /open the list/ })).toHaveCount(0);
    await learner.getByRole("link", { name: "History" }).click();
    await learner.waitForURL(/tab=history/);
    await expect(learner.getByText("Nothing on the record yet")).toBeVisible();
    await expect(learner.getByTestId("history-count")).toHaveText("0 of 0");
    // the charts: the crew the story made is on its board, with the denominator printed
    await learner.getByRole("link", { name: "Charts" }).click();
    await learner.waitForURL(/tab=charts/);
    await expect(learner.getByText("How points work")).toBeVisible();
    await learner.getByRole("link", { name: "Crews" }).click();
    await learner.waitForURL(/seg=crew/);
    // the crew board scores what a crew DID — no wins, because nothing records a score
    await expect(learner.getByText("Event entered", { exact: true })).toBeVisible();
    await expect(learner.getByText("Confirmed member", { exact: true })).toBeVisible();
    const crewRow = learner.getByRole("link", { name: new RegExp(`^${crewName} — place \\d+ of \\d+$`) });
    await expect(crewRow).toBeVisible();
    await crewRow.click();
    await learner.waitForURL(new RegExp(`/crew/${crewId}$`));
  });

  test("person pages: the doors that had nowhere to go", async () => {
    // ---- parity slice: person pages ----
    // Every door here was drawn by an earlier step with nowhere to send it: the
    // crew desk's member rows (Step 22 said so in a comment), the crew page's
    // roster, and the search dropdown's People section (Step 23 left people out
    // for exactly this reason). They open now, and the page is made of what the
    // story already did.
    await learner.goto(`/crews/${crewId}/manage`);
    await learner.getByRole("link", { name: `Open ${trainerName}'s profile` }).click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);
    // exact: Next's route announcer carries the page TITLE ("E2E Trainer — DanceOS"),
    // which a loose match picks up as a second element the moment a navigation is fresh
    await expect(learner.getByText(trainerName, { exact: true })).toBeVisible();
    await expect(learner.getByText("ARTIST")).toBeVisible();
    // the crew they confirmed into is on their page, and it opens the crew
    await expect(learner.getByRole("link", { name: `Open ${crewName}` })).toBeVisible();
    // following a person is one bit, and the count moves
    await expect(learner.getByTestId("person-followers")).toHaveText("0");
    await learner.getByRole("button", { name: "Follow" }).click();
    await expect(learner.getByRole("button", { name: /^Following/ })).toBeVisible();
    await expect(learner.getByTestId("person-followers")).toHaveText("1");
    // and it is really one bit: pressing again takes it back
    await learner.getByRole("button", { name: /^Following/ }).click();
    await expect(learner.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(learner.getByTestId("person-followers")).toHaveText("0");

    // the search box offers people now — and the row opens the person
    await learner.goto("/discover?city=Pune&tab=classes");
    await learner.getByLabel("Search DanceOS").fill(trainerName);
    await expect(learner.getByText("People")).toBeVisible();
    await learner.getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) }).click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);

    // an organization is never a result and has no page for anybody else (R9):
    // the same term finds the trainer and not the owner, and the owner's address
    // answers 404 — while the admin, who verifies it, still reads it as evidence
    await learner.goto("/discover?city=Pune&tab=classes");
    /* two claims, each on a term that cannot be crowded out by a leftover: this
       run stamp finds the trainer, and the organization name finds nobody */
    await learner.getByLabel("Search DanceOS").fill(stamp);
    await expect(learner.getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) })).toBeVisible();
    await learner.getByLabel("Search DanceOS").fill("E2E Owner");
    await expect(learner.getByRole("option", { name: /^E2E Owner/ })).toHaveCount(0);
    const orgPage = await learner.goto(`/person/${ownerId}`);
    expect(orgPage?.status()).toBe(404);
    await admin.goto(`/person/${ownerId}`);
    await expect(admin.getByText("ORGANIZATION", { exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Follow" })).toHaveCount(0);

    // the crew's public roster opens its people too, and the trainer's own page
    // says it is theirs rather than offering them a Follow button
    await trainer.goto(`/crew/${crewId}`);
    await trainer.getByRole("link", { name: `Open ${trainerName}'s profile` }).click();
    await trainer.waitForURL(/\/person\/[0-9a-f-]+$/);
    await expect(trainer.getByRole("link", { name: /This is you/ })).toBeVisible();
    await expect(trainer.getByRole("button", { name: "Follow" })).toHaveCount(0);
    // and the photo: the file goes from THIS browser straight to Storage with the
    // trainer's own session (the proof covers the rules; only a browser can cover
    // the upload), the row records the path, and the square stops being initials
    // onboarding required a photo (U2), so the square is a face already —
    // taking it down puts the initials back, and the control turns into "Add a photo"
    await expect(trainer.locator("img").first()).toBeVisible();
    await expect(trainer.getByLabel("Change your photo")).toBeAttached();
    await trainer.getByRole("button", { name: "Remove the photo" }).click();
    await expect(trainer.locator("img")).toHaveCount(0);
    // and a new one goes up from THIS browser straight to Storage with the trainer's
    // own session (the proof covers the rules; only a browser can cover the upload)
    await trainer.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
    await expect(trainer.locator("img").first()).toBeVisible({ timeout: 20_000 });
    await expect(trainer.getByLabel("Change your photo")).toBeAttached();
    // a stranger — no account at all — reads the same page and is offered Follow
    const guestContext = await browserRef.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.goto(studioUrl);
      await expect(guest.getByText(studioName).first()).toBeVisible();
      await expect(guest.getByRole("link", { name: "Follow" })).toBeVisible();
      await expect(guest.getByTestId("followers-count")).toHaveText("1");
    } finally {
      await guestContext.close();
    }
  });

  test("everything you manage: one list over every business you run", async () => {
    // ---- parity slice: S_managed ----
    // The Home deck offers the door only to somebody who runs something; behind it
    // is one list of every class and event of every business they belong to, the
    // row being the session's own card with its desk behind it.
    await owner.goto("/");
    await owner.getByRole("link", { name: "Everything you manage", exact: true }).click();
    await owner.waitForURL(/\/managed$/);
    // the class the story published and both events it created are here, whatever their status
    // (a class tile headlines its STYLE; the title lives in the row's Manage link)
    await expect(owner.getByRole("link", { name: `Manage ${classTitle}` })).toBeVisible();
    await expect(owner.getByText(eventTitle, { exact: true }).first()).toBeVisible();
    await expect(owner.getByText(battleTitle, { exact: true }).first()).toBeVisible();
    const all = Number((await owner.getByTestId("managed-count").innerText()).split(" ")[0]);
    expect(all).toBeGreaterThanOrEqual(3);
    // the control narrows the list — and it is the URL, so the narrowed list has an address
    await owner.getByRole("link", { name: "Show events only" }).click();
    await owner.waitForURL(/\/managed\?kind=event$/);
    await expect(owner.getByTestId("managed-class")).toHaveCount(0);
    await expect(owner.getByRole("link", { name: `Manage ${classTitle}` })).toHaveCount(0);
    await expect(owner.getByText(eventTitle, { exact: true }).first()).toBeVisible();
    await owner.getByRole("link", { name: "Show classes only" }).click();
    await owner.waitForURL(/\/managed\?kind=class$/);
    await expect(owner.getByTestId("managed-event")).toHaveCount(0);
    await expect(owner.getByRole("link", { name: `Manage ${classTitle}` })).toBeVisible();
    // pressing a class row opens its desk, not its public page
    await owner.getByRole("link", { name: `Manage ${classTitle}` }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes\/[0-9a-f-]+\/roster$/);
    // and the learner, who runs nothing, is not offered the door — the room is
    // still honest if they type the address
    await learner.goto("/");
    await expect(learner.getByRole("link", { name: "Everything you manage", exact: true })).toHaveCount(0);
    await learner.goto("/managed");
    await expect(learner.getByText("Nothing here yet")).toBeVisible();
    await expect(learner.getByRole("link", { name: "Set up a business" })).toBeVisible();
  });

  test("the Profile tab: who you are, in your own words, and what a stranger reads of it", async () => {
    // ---- parity slice: S_profiletab's own render ----
    // The role and the account number over the name, the figures, then the band
    // under the name: the styles you dance, where else to find you, and your
    // sentence — every one edited from a sheet on this page and landing on one
    // record; and the same three read back on the person page by somebody else.
    await trainer.goto("/profile");
    await expect(trainer.getByText("ARTIST", { exact: true })).toBeVisible();
    await expect(trainer.getByText(/^\d{6}$/)).toBeVisible();
    await expect(trainer.getByTestId("my-followers")).toHaveText("0");
    // Edit profile: age and a bio
    await trainer.getByRole("button", { name: "Edit profile", exact: true }).click();
    await trainer.getByLabel("Age").selectOption("24");
    await trainer.getByLabel("Bio").fill("Movement is a language.");
    await trainer.getByRole("dialog", { name: "Edit profile" }).getByRole("button", { name: "Save" }).click();
    await expect(trainer.getByText("Movement is a language.")).toBeVisible();
    await expect(trainer.getByText("24, Pune")).toBeVisible();
    // a style, from the registry
    await trainer.getByRole("button", { name: "Add a dance style" }).click();
    await trainer.getByRole("button", { name: "Add Kathak", exact: true }).click();
    await expect(trainer.getByRole("dialog", { name: "Add a dance style" }).getByText("Kathak", { exact: true })).toBeVisible();
    await trainer.getByRole("dialog", { name: "Add a dance style" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByLabel("Kathak — one of your styles", { exact: true })).toBeVisible();
    // a link, on a known platform — the chip prints the handle, not the URL
    await trainer.getByRole("button", { name: "Add a link" }).click();
    await trainer.getByRole("button", { name: "Add Instagram" }).click();
    await trainer.getByLabel("URL", { exact: true }).fill("https://instagram.com/rheamoves");
    await trainer.getByRole("dialog", { name: "Add your Instagram" }).getByRole("button", { name: "Save" }).click();
    await trainer.getByRole("dialog", { name: "Add a social link" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByRole("button", { name: "Instagram — @rheamoves" })).toBeVisible();
    // and a bad address is refused with the database's own sentence, not saved
    await trainer.getByRole("button", { name: "Add a link" }).click();
    await trainer.getByRole("button", { name: "Add YouTube" }).click();
    await trainer.getByLabel("URL", { exact: true }).fill("rheamoves");
    await trainer.getByRole("dialog", { name: "Add your YouTube" }).getByRole("button", { name: "Save" }).click();
    await expect(trainer.getByText(/web address|url/i).first()).toBeVisible();
    await trainer.getByRole("dialog", { name: "Add your YouTube" }).getByRole("button", { name: "Cancel" }).click();
    await trainer.getByRole("dialog", { name: "Add a social link" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByRole("button", { name: /^YouTube/ })).toHaveCount(0);

    // ---- the gear, and what is behind it (S_profiletab 11402-11440) ----
    // The top bar carries the settings gear on every screen; on the Profile tab
    // it opens the sheet rather than just landing on the tab (19263).
    await trainer.getByRole("link", { name: "Settings", exact: true }).click();
    const settings = trainer.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByText("YOUR PLAN")).toBeVisible();
    // a row opens where its subject lives rather than pretending
    await settings.getByRole("button", { name: /Notifications/ }).click();
    await expect(settings.getByRole("link", { name: "All notification settings ›" })).toBeVisible();
    // and Log out is here, where the prototype keeps it
    await expect(settings.getByRole("button", { name: /Log out/ })).toBeVisible();
    // Enquiry types is the prototype's own sheet (9000-9030) — a studio takes four kinds (no judge, 4934)
    await settings.getByRole("button", { name: /Enquiry types/ }).click();
    const enqTypes = trainer.getByRole("dialog", { name: "Enquiry types" });
    await expect(enqTypes.getByText("4 of 4 switched on")).toBeVisible();
    await enqTypes.getByRole("button", { name: "Done" }).click();
    // Payments is a real screen now (S_payments 16531): the trainer's goes to the studio's desk
    await settings.getByRole("link", { name: /Payments & verification/ }).click();
    await expect(trainer).toHaveURL(new RegExp(`/business/${tenantId}/payments`));
    await expect(trainer.getByRole("heading", { name: "Payments & verification" })).toBeVisible();
    await expect(trainer.getByText("ACCEPTED FROM STUDENTS")).toBeVisible();
    // a trainer is not the owner — the switches are drawn but refuse to move
    await trainer.getByRole("switch", { name: "Bank transfer" }).click();
    await expect(trainer.getByText("Only the owner changes what the business accepts")).toBeVisible();
    await trainer.getByRole("button", { name: "Verification" }).click();
    await expect(trainer.getByText("Not verified yet")).toBeVisible();
    // Artist tools is the Artist PLAN's switch (8855), and the plan has been live
    // since the trainer got it on day one — so the strip reads PRO ACTIVE, and
    // pressing it ENDS the plan
    await trainer.goto("/profile?settings=1");
    const settings2 = trainer.getByRole("dialog", { name: "Settings" });
    await expect(settings2.getByText("PRO ACTIVE")).toBeVisible();
    await expect(settings2.getByRole("link", { name: /Subscription/ })).toBeVisible();
    // 10 Sep 2026: ENDING means stop renewing, the way every real subscription
    // works — the tools stay on until the period paid for is over, so the badge
    // still reads ARTIST, and the plan's own screen says it is ending. The ROLE
    // never moved either way (8 Sep 2026: Pro is a row, not a role)
    await settings2.getByRole("button", { name: "Artist tools" }).click();
    await expect(trainer.getByRole("status")).toContainText("Artist tools off", { timeout: 15_000 });
    await trainer.goto("/subscription");
    await expect(trainer.getByText("Active · ending")).toBeVisible({ timeout: 15_000 });
    await expect(trainer.getByText(/Stays on until .*, then stops\. Nothing more will be charged\./)).toBeVisible();
    await expect(trainer.getByText("This period does not renew. Once it ends you can subscribe again from here.")).toBeVisible();
    // what was paid for stands: the same profile is still an artist
    await trainer.goto("/profile");
    await expect(trainer.getByText("ARTIST", { exact: true })).toBeVisible({ timeout: 15_000 });

    // ---- the business's own words on its public page (About 10826, Since 10691, Call 10879) ----
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "Edit business" }).click();
    const bizEdit = owner.getByRole("dialog", { name: "Edit business" });
    await bizEdit.getByLabel("About").fill("Where Pune comes to move.");
    await bizEdit.getByLabel("Since").selectOption("2016");
    await bizEdit.getByLabel("Phone (Call button)").fill("+91 98765 43210");
    await bizEdit.getByRole("button", { name: "Save" }).click();
    await expect(owner.getByText("Where Pune comes to move.")).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByText("Since 2016")).toBeVisible();
    // a stranger reads the same words, and Call is a real tel: hand-off
    await learner.goto(studioUrl);
    await expect(learner.getByText("Where Pune comes to move.")).toBeVisible();
    await expect(learner.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919876543210");

    // somebody else reads the same three things on the person page — and can open the link
    await learner.goto(`/person/${trainerId}`);
    await expect(learner.getByText("Movement is a language.")).toBeVisible();
    await expect(learner.getByText("24, Pune")).toBeVisible();
    await expect(learner.getByLabel("Kathak", { exact: true })).toBeVisible();
    await expect(learner.getByRole("link", { name: "Instagram — @rheamoves" })).toHaveAttribute("href", "https://instagram.com/rheamoves");
  });
  test("Home’s PassDeck: today’s sessions as swiped cards, with the pass and the invoice on the card", async () => {
    // ---- parity slice H10: PassDeck 6863-7204 ----
    // Nothing the story books is today, so Home's deck has been honest and empty
    // all along. Put the class the learner booked on the clock — running right
    // now — the way the demo seed back-dates a session: through the service role,
    // because no door lets a person move a session into the past.
    const cls = (await (await fetch(`${supabaseUrl}/rest/v1/classes?share_slug=eq.${shareSlug}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    expect(cls.length).toBe(1);
    const nowMs = Date.now();
    /* THE DECK IS "TODAY" IN IST, so a start ten minutes ago lands YESTERDAY when
       the suite runs in the first minutes after midnight IST — the card then
       belongs to neither day and Home honestly reads "0 today" (it did, at 00:06
       IST on 11 Sep 2026). The start is clamped inside the IST day, which keeps
       it both today AND already begun, so the Live badge still applies. */
    const IST_OFFSET = 5.5 * 3600_000;
    const istMidnightMs = Math.floor((nowMs + IST_OFFSET) / 86_400_000) * 86_400_000 - IST_OFFSET;
    const startsMs = Math.max(nowMs - 10 * 60_000, istMidnightMs + 60_000);
    const moved = await fetch(`${supabaseUrl}/rest/v1/class_sessions?class_id=eq.${cls[0].id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ starts_at: new Date(startsMs).toISOString(), ends_at: new Date(nowMs + 50 * 60_000).toISOString() }),
    });
    expect(moved.ok).toBeTruthy();

    // the learner's Home: one card in the rail, saying what the session is to them — and that it is on now
    await learner.goto("/");
    await expect(learner.getByText("1 today")).toBeVisible();
    const card = learner.getByTestId("deck-card").first();
    await expect(card.getByRole("link", { name: `Open ${classTitle}` })).toBeVisible();
    await expect(card.getByText("Booked", { exact: true })).toBeVisible();
    await expect(card.getByText("Live", { exact: true })).toBeVisible();
    await expect(card.getByText(/You.re booked/)).toBeVisible();
    // the drawn code on the card opens the ticket — the same pass the class page keeps behind its poster
    await card.getByRole("button", { name: `Show the entry code for ${classTitle}` }).click();
    const passSheet = learner.getByRole("dialog", { name: "Class pass" });
    await expect(passSheet.getByRole("img", { name: /^Entry code DOS-CL-\d{4}$/ })).toBeVisible();
    await expect(passSheet.getByText("Scan this at the door.")).toBeVisible();
    await passSheet.getByRole("button", { name: "Done" }).click();
    await expect(passSheet).toHaveCount(0);
    // and the invoice, without leaving Home — a free trial prints Free
    await card.getByRole("button", { name: "Invoice" }).click();
    const invoice = learner.getByRole("dialog", { name: "Invoice" });
    await expect(invoice.getByText("Class booking")).toBeVisible();
    await expect(invoice.getByText("Free", { exact: true })).toBeVisible();
    await invoice.getByRole("button", { name: "Close" }).click();
    await expect(invoice).toHaveCount(0);
    // the deck is the one list; the door to all bookings is still named beside it
    await expect(learner.getByRole("link", { name: "All bookings", exact: true })).toBeVisible();

    // the trainer, who was ASKED to take the class, is teaching it only once they say yes —
    // an unanswered ask is not a session you are running, and Home says 0 today until then
    await trainer.goto("/");
    await expect(trainer.getByText("0 today")).toBeVisible();
    await trainer.goto(`/c/${shareSlug}`);
    await trainer.getByRole("button", { name: "Accept this ask" }).click();
    await expect(trainer.getByText("You’re on this class")).toBeVisible({ timeout: 15_000 });
    // now the same session is on their day, wearing Teaching — no pass, no invoice: it is not a booking
    await trainer.goto("/");
    const taught = trainer.getByTestId("deck-card").first();
    await expect(taught.getByText("Teaching", { exact: true })).toBeVisible();
    await expect(taught.getByRole("button", { name: "Invoice" })).toHaveCount(0);

    // a studio's Home asks the studio's question — what is running in its rooms — with its own doors
    await owner.goto("/");
    await expect(owner.getByTestId("deck-card").first().getByText("At your studio", { exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: "Classes at this studio" })).toHaveAttribute("href", `/business/${tenantId}/classes`);
    await expect(owner.getByRole("link", { name: "Open the studio calendar" })).toHaveAttribute("href", `/business/${tenantId}/calendar`);
    await expect(owner.getByRole("link", { name: "Everything you manage", exact: true })).toBeVisible();
  });

  test("the wiring slice: a tick, two numbers, a followers list and two buttons that had no door", async () => {
    // ---- parity slice 7: D7 · N8 · I4 · B6 · the History chip · See crew ranking · the rank row ----
    // Every row here is the same shape of gap — a FIELD that exists and a SCREEN
    // that never read it — so they are proved together, in the order a person
    // would meet them.

    // ── D7: the tick on Discover's cards. Verification is DanceOS's to give
    // (the guard migration makes that a rule, not a comment), so the story sets
    // it the only way anything can: through the service role.
    const ticked = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ verified_at: new Date().toISOString() }),
    });
    expect(ticked.ok).toBeTruthy();
    await learner.goto("/discover?city=Pune&tab=studios");
    const studioCard = learner.getByRole("link", { name: `Open ${studioName}` });
    await expect(studioCard).toBeVisible();
    await expect(studioCard.getByLabel("Verified")).toBeVisible();

    // ── N8: a person publishes a number, and their page grows a Call. The field
    // has existed since the settings slice with no way in — the Edit profile
    // sheet is that way in, and the same sheet takes it back down.
    await learner.goto("/profile");
    await learner.getByLabel("Edit profile").click();
    const editSheet = learner.getByRole("dialog", { name: "Edit profile" });
    await editSheet.getByLabel("Phone").fill("+91 98765 43210");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    // somebody else's read of it: the trainer opens the learner's page and can ring
    await trainer.goto(`/person/${learnerId}`);
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919876543210");
    // and it is the person's to withdraw: an empty box saves null, and the Call goes
    await learner.getByLabel("Edit profile").click();
    await editSheet.getByLabel("Phone").fill("");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    await trainer.reload();
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveCount(0);

    // ── I4: the OTHER end of an enquiry can ring too. The business publishes its
    // number on its own page; the person who asked reads it on the enquiry they sent.
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "Edit business" }).click();
    const bizSheet = owner.getByRole("dialog", { name: "Edit business" });
    await bizSheet.getByLabel("Phone (Call button)").fill("+91 90000 11111");
    await bizSheet.getByRole("button", { name: "Save" }).click();
    await expect(bizSheet).toHaveCount(0);
    await learner.goto("/inbox");
    await pressPill(learner, /^Enquiries/);
    await learner.getByRole("button", { name: "Sent enquiries" }).click();
    await learner.getByRole("link", { name: `Private Sessions enquiry to ${studioName}` }).click();
    await learner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(learner.getByRole("link", { name: `Call ${studioName}` })).toHaveAttribute("href", "tel:+919000011111");
    // the business's side is unchanged: this enquiry carried no mobile, so it still
    // says so rather than offering a dead button
    await owner.goto("/inbox");
    await owner.getByRole("button", { name: /^Enquiries/ }).click();
    await owner.getByRole("link", { name: "Private Sessions enquiry from E2E Learner" }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(owner.getByText("No number on this enquiry — quote them here instead")).toBeVisible();

    // ── B6: the follower COUNT becomes a list, for the owner and nobody else.
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "1 follower — see who" }).click();
    const followersSheet = owner.getByRole("dialog", { name: "Followers" });
    const learnerRow = followersSheet.getByRole("link", { name: /E2E Learner/ });
    await expect(learnerRow).toBeVisible();
    await expect(learnerRow).toHaveAttribute("href", `/person/${learnerId}`);
    await learnerRow.click();
    await owner.waitForURL(`**/person/${learnerId}`);
    // a follower reading the same page gets the figure, not the door
    await learner.goto(studioUrl);
    await expect(learner.getByTestId("followers-count")).toHaveText("1");
    await expect(learner.getByRole("button", { name: /see who/ })).toHaveCount(0);

    // ── the two buttons whose destinations already existed
    await learner.goto("/calendar");
    await expect(learner.getByRole("link", { name: "History" })).toHaveAttribute("href", "/stats?tab=history");
    await learner.getByRole("link", { name: "History" }).click();
    await learner.waitForURL(/tab=history/);
    await expect(learner.getByTestId("history-count")).toBeVisible();

    await learner.goto(`/crews/${crewId}/manage`);
    await learner.getByRole("button", { name: "Battle record" }).click();
    const rankingBtn = learner.getByRole("link", { name: "See crew ranking" });
    await expect(rankingBtn).toHaveAttribute("href", "/stats?tab=charts&seg=crew");
    await rankingBtn.click();
    await learner.waitForURL(/seg=crew/);
    await expect(learner.getByRole("link", { name: new RegExp(`^${crewName} — place \\d+ of \\d+$`) })).toBeVisible();

    // ── the rank row on Home's sleeve. It says exactly what the Profile tab says
    // about where you stand — and where there is no place, BOTH say nothing:
    // Step 25's rule is that "#0" is not a rank, and a second screen printing one
    // would be the first place that rule broke.
    const rankLink = /^Rank \d+ of \d+ — open global rankings$/;
    await learner.goto("/profile");
    await expect(learner.getByRole("link", { name: rankLink })).toHaveCount(0);
    await learner.goto("/");
    await expect(learner.getByRole("link", { name: rankLink })).toHaveCount(0);
    // the trainer took a class in the PassDeck segment, so whatever the boards make
    // of that, the sleeve and the Profile tab give the same answer
    await trainer.goto("/profile");
    const onProfile = trainer.getByRole("link", { name: rankLink });
    const said = (await onProfile.count()) > 0 ? await onProfile.getAttribute("aria-label") : null;
    await trainer.goto("/");
    if (said) {
      await expect(trainer.getByRole("link", { name: said, exact: true })).toBeVisible();
    } else {
      await expect(trainer.getByRole("link", { name: rankLink })).toHaveCount(0);
    }
  });

  test("the class form asks the room first: ROOM ALREADY BUSY, and what can honestly happen next", async () => {
    // ---- parity slice 8: F3 (15628-15632) ----
    // The story's class runs in Studio A. A second class in the same room at the
    // same hour is asked about BEFORE the confirm sheet opens, and the sheet says
    // so in the prototype's own words. One departure, stated on the sheet: the
    // prototype offers to run both, and this database will not double-book a
    // room (Step 11's trigger — the Rooms footnote's promise), so the honest
    // second press keeps the class as a draft instead.
    /* THIS SEGMENT SETS ITS OWN SLOT, rather than reading wherever an earlier
       segment left the session. The PassDeck segment moves that session onto the
       clock, and "now" is not always a time this form can express — its list runs
       06:00 to 23:00 in half hours, so a run just after midnight IST left the
       clash at 00:01 and the dropdown had no such option (10 Sep 2026). Three
       days out at 19:00 IST is both a real slot and independent of the clock. */
    const cls = (await (await fetch(`${supabaseUrl}/rest/v1/classes?share_slug=eq.${shareSlug}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    expect(cls.length).toBe(1);
    const when = {
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
        new Date(Date.now() + 3 * 86_400_000)
      ),
      time: "19:00",
    };
    const parked = await fetch(`${supabaseUrl}/rest/v1/class_sessions?class_id=eq.${cls[0].id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ starts_at: `${when.date}T19:00:00+05:30`, ends_at: `${when.date}T20:30:00+05:30` }),
    });
    expect(parked.ok).toBeTruthy();

    await owner.goto(`/business/${tenantId}/classes/new`);
    await owner.getByLabel("Class date").fill(when.date);
    await owner.getByLabel("Starts").selectOption(when.time);
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByRole("button", { name: "Salsa", exact: true }).click();
    await owner.getByLabel("Class name").fill(`E2E Clash ${stamp}`);
    await owner.getByRole("button", { name: "Hold it in Studio A" }).click();
    await owner.getByRole("button", { name: "Continue" }).click();
    await owner.getByLabel("Price per session").fill("0");
    await owner.getByRole("button", { name: "Publish class" }).click();
    const sheet = owner.getByRole("dialog", { name: "Publish this class?" });
    await expect(sheet.getByText("ROOM ALREADY BUSY")).toBeVisible();
    await expect(sheet.getByText(new RegExp(`Studio A already has ${classTitle} at`))).toBeVisible();
    await expect(sheet.getByText(/a room is never double-booked/)).toBeVisible();
    // the primary button no longer offers what the database would refuse
    await expect(sheet.getByRole("button", { name: "Publish it" })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Save as draft instead" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);
    // the draft exists, and it is a DRAFT — not in any room, so it clashed with nothing
    const rows = (await (
      await fetch(`${supabaseUrl}/rest/v1/classes?tenant_id=eq.${tenantId}&title=eq.${encodeURIComponent(`E2E Clash ${stamp}`)}&select=status`, { headers: adminHeaders })
    ).json()) as Array<{ status: string }>;
    expect(rows.map((r) => r.status)).toEqual(["draft"]);
  });

});
