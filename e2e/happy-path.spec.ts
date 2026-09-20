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
/** THE ONE CITY DROPDOWN (19 Sep 2026): a native select over the registry with
 *  "Search another city…" behind it. The helper always goes through the search,
 *  so it does not depend on which cities the registry holds today. */
async function pickCity(page: Page | Locator, city: string) {
  /* a closed list since later on 19 Sep 2026: the city is one of the registry's options */
  await page.getByLabel("Choose a city").first().selectOption(city);
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

/** THE CROPPER (18 Sep 2026): every picture stops in "Crop & preview" before it
 *  goes up, so a test that puts a file in presses "Use this photo" once per file.
 *  The button is a real `disabled` until the picture has decoded, so the press
 *  waits for the decode instead of racing it; a batch says "k of n" per step. */
async function confirmCrop(page: Page, times = 1) {
  const dialog = page.getByRole("dialog", { name: "Crop & preview" });
  for (let k = 0; k < times; k += 1) {
    /* fifteen seconds, not five: between two pictures the button reads "Saving…"
       while the canvas encodes the JPEG, and on a machine running its fourth
       suite of the hour that took longer than five once (18 Sep 2026) — the same
       allowance the Profile tab's "Since 2016" wait got */
    if (times > 1) await expect(dialog.getByText(`${k + 1} of ${times}`)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Use this photo" }).click();
  }
  /* the last picture's encode is the same wait as the ones between */
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
}

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
  await pickCity(page, city);
  // the button reads "Continue" once the name is in (prototype 3820-3821)
  await page.getByRole("button", { name: "Continue" }).click();
  // the row exists now, so the picker is offered — and the button says the photo is missing
  await expect(page.getByRole("button", { name: isOrg ? "Add a logo or photo" : "Add your profile photo" })).toBeVisible();
  await expect(page.getByLabel("Add a photo")).toBeAttached();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await confirmCrop(page);
  await expect(page.getByLabel(isOrg ? "Your logo" : "Your profile photo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (isOrg) {
    // AN ORGANIZATION IS ASKED FOR NOTHING ELSE (11 Sep 2026 — the user: "org
    // no more needs admin verification at all; org has only GST verification").
    // No styles, no links, no photos: the name and the logo are the whole flow,
    // and what DanceOS checks is each STUDIO, later, from the hub.
    await expect(page.getByText(`Welcome, ${name}!`)).toBeVisible();
    await expect(page.getByText("your first studio is next")).toBeVisible();
    await expect(page.getByText("Your organization's links")).toHaveCount(0);
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

/** EDIT PROFILE IS SETTINGS' FIRST OPTION (19 Sep 2026, the user: "Editing
 *  profile should be shifted to settings and should be the top option, all edit
 *  profile options to be removed from home and profile pages"). The pencil is
 *  gone from Home's hero and the Profile tab's corner, so every place that used
 *  to press one opens the gear's own screen instead and presses the tile. */
async function openEditProfile(page: Page) {
  await page.goto("/profile?settings=1");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible({ timeout: 20_000 });
  await settings.getByRole("button", { name: "Edit profile" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit profile" });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
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
 *  stamp and is deleted in afterAll, so runs do not pile up demo rows.
 *
 *  ⚠⚠ TWO THINGS ABOUT A SERIAL STORY THAT HAVE EACH COST A WHOLE RUN. Read both
 *  before adding or moving a segment.
 *
 *  1. WHERE A SEGMENT SITS IS PART OF ITS SET-UP. Each segment inherits the world
 *     every earlier one left behind, so adding one AT THE END is not neutral — it
 *     is the most-mutated world this story ever has. Two segments have already
 *     been bitten by exactly that, both on 19 Sep 2026:
 *       * MEMBERSHIPS was written last and the learner could not take one. The
 *         database was right: accepting the clash segment's room ask seats an
 *         outside teacher as VISITING FACULTY (R19), so by then the learner was on
 *         the studio's team, and `why_no_membership` says "you are on this team".
 *       * THE TEAM segment then hit the same wall from the other side — the people
 *         picker excludes somebody already on the team, so the person it meant to
 *         ask was not offered.
 *     Both were fixed by MOVING the segment ABOVE the clash segment, not by
 *     working around the rule. So: if a new segment needs a learner who is not on
 *     the studio's team, it belongs before "the class form asks the room first".
 *
 *  2. A SERIAL SUITE ONLY REPORTS ITS FIRST FAILURE. Everything after a red is
 *     "did not run", so one stale assertion hides every segment behind it — that
 *     is how two live admin-panel bugs stayed invisible for two days (16 Sep
 *     2026). When a segment goes red, fix it and re-run the WHOLE file; the pass
 *     count is only meaningful when nothing was skipped. */
test.describe.serial("DanceOS, end to end", () => {
  test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local or env)");

  const stamp: string = Date.now().toString(36);
  const studioName: string = `E2E Studio ${stamp}`;
  /* NOT stamped, because it is not typed: since 17 Sep 2026 the form has no name
     field and a class is called "{style} · {level}" (the prototype's own
     dosClassLabel). So this title is shared with every other Bollywood class on
     the database, and the locators on SHARED surfaces (Discover) pin the tile to
     this run's class by its share slug as well as by the name. The studio's own
     surfaces — its register, calendar and schedule, the learner's own lists —
     hold exactly one Bollywood class, so the name alone is still unambiguous there. */
  const classTitle: string = "Bollywood · All levels";
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
  /* AND THE LEARNER, for the same reason and at the same cost (18 Sep 2026). It
     stayed the constant "E2E Learner" until the class form began searching all of
     DanceOS for whoever takes a class: four leftover learners answered that
     search, `.first()` picked one of them, and the segment then waited for an ask
     to reach an account that was not in this story. */
  const learnerName: string = `E2E Learner ${stamp.charAt(0).toUpperCase()}${stamp.slice(1)}`;

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
    /* tenant delete cascades classes → sessions → class_bookings; user delete
       cascades the profiles. Cleanup failures surface but don't mask the test. */
    if (tenantId) {
      await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenantId}`, { method: "DELETE", headers: adminHeaders });
    }
    /* EVERY BUSINESS THESE ACCOUNTS OWN GOES WITH THEM (18 Sep 2026): the
       organization's hosting row, and the artist page Home provisions for the
       trainer the moment their plan is live — a business whose owner is deleted
       is otherwise left ownerless on production (the #0w pile). */
    for (const uid of [ownerId, learnerId, trainerId]) {
      if (!uid) continue;
      const owned = (await (await fetch(`${supabaseUrl}/rest/v1/business_members?user_id=eq.${uid}&member_role=eq.owner&select=business_id`, { headers: adminHeaders })).json()) as Array<{ business_id: string }>;
      if (Array.isArray(owned) && owned.length) {
        await fetch(`${supabaseUrl}/rest/v1/businesses?id=in.(${owned.map((o) => o.business_id).join(",")})`, { method: "DELETE", headers: adminHeaders });
      }
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
    /* 15 Sep 2026: the hub no longer carries an events block — an event is the
       organization's and its ONE door is the Events tile on Home */
    await expect(owner.getByRole("link", { name: "Your events" })).toHaveCount(0);
    await owner.goto("/");
    await owner.getByRole("link", { name: "Events", exact: true }).click();
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
    // a studio says what it dances, at birth (19 Sep 2026) — the database
    // refuses one without a style, so Create is disabled until there is one
    await owner.getByLabel("Add a dance style").selectOption("Hip-Hop");
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
    /* ⚠ AND SUBSCRIBE IS NOT OFFERED ANYWHERE YET — asked on /subscription, which
       is where a studio's subscription lives since 20 Sep 2026 (the user: "remove
       … subscription from just the home tab … as already being handled from
       settings"). Reading it off the hub, as this line used to, could only ever
       pass: the strip has never been there. */
    await owner.goto("/subscription");
    await expect(owner.getByTestId("studio-subscription").filter({ hasText: studioName })).toBeVisible();
    await expect(owner.getByTestId("studio-subscription").filter({ hasText: studioName }).getByRole("button", { name: /^Subscribe/ })).toHaveCount(0);
    await owner.goto("/business");
    // 14 Sep 2026: the strip IS the form — the links are typed in it beside each
    // platform's own mark, the photos go under them, and ONE Submit saves the
    // links and files the request. Nothing is written by the service role here.
    await expect(verifyStrip.getByRole("button", { name: `Submit ${studioName} for verification` })).toBeDisabled();
    // the reasoning is one tap away, not a paragraph on the form
    await verifyStrip.getByRole("button", { name: "Why verification" }).click();
    await expect(owner.getByRole("dialog", { name: "Why verification" }).getByText("Why photos of the space")).toBeVisible();
    await owner.getByRole("dialog", { name: "Why verification" }).getByRole("button", { name: "Got it" }).click();
    await expect(owner.getByRole("dialog", { name: "Why verification" })).toHaveCount(0);
    // a bare host is finished into a real address by the form
    await verifyStrip.getByLabel("Instagram").fill("instagram.com/e2estudio");
    await verifyStrip.getByLabel("Add photos of your space").setInputFiles(FIVE_PNGS);
    // five pictures, five crops — the cropper steps through the batch
    await confirmCrop(owner, 5);
    await expect(verifyStrip.getByRole("status", { name: "5 of 5 to 10 photos added" })).toBeVisible({ timeout: 40_000 });
    await verifyStrip.getByRole("button", { name: `Submit ${studioName} for verification` }).click();
    await expect(owner.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Under review", { timeout: 15_000 });
    const studioRows = (await (await fetch(`${supabaseUrl}/rest/v1/businesses?name=eq.${encodeURIComponent(studioName)}&select=id,socials`, { headers: adminHeaders })).json()) as Array<{ id: string; socials: Array<{ platform: string; url: string }> }>;
    const studioId = studioRows[0]?.id;
    expect(studioId).toBeTruthy();
    /* the form wrote a real http(s) address from what was typed */
    expect(studioRows[0]?.socials?.[0]?.url).toBe("https://instagram.com/e2estudio");

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
    // ⚠ ONE CARD PER STUDIO since 15 Sep 2026 (the user: "we don't need separate
    // cards after verification and subscription"). The verification strip is
    // gone the moment the badge is on, the card wears the tick beside the name,
    // and the only WORK left inside it is Subscribe.
    await owner.goto("/business");
    const hubCard = owner.getByTestId("studio-card").filter({ hasText: studioName });
    await expect(hubCard.getByLabel("Verified")).toBeVisible();
    await expect(owner.getByTestId("studio-verification")).toHaveCount(0);
    await expect(hubCard.getByRole("button", { name: /^Subscribe · ₹1,200\/mo$/ })).toBeVisible();
    // and the sentence between this studio and Discover is on /subscription —
    // Settings' own Subscription tile, where the cancel door lives since 20 Sep
    // 2026 (it was the studio's own home from 15 Sep, and the hub before that;
    // there is exactly ONE Stop renewing in this app and it must have a screen)
    await owner.goto("/subscription");
    const studioStrip = owner.getByTestId("studio-subscription").filter({ hasText: studioName });
    await expect(studioStrip.getByText("NOT LIVE", { exact: true })).toBeVisible();
    await expect(studioStrip).toContainText("Each studio has its own subscription");
    await expect(studioStrip.getByRole("button", { name: /^Subscribe · ₹1,200\/mo$/ })).toBeVisible();
    // and the studio's own home no longer carries it
    await owner.goto(`/business/${studioId}`);
    await expect(owner.getByTestId("studio-subscription")).toHaveCount(0);
    await admin.goto(`/admin/businesses?q=${encodeURIComponent(studioName)}`);
    const studioCard = admin.getByTestId("admin-business").filter({ hasText: studioName });
    await expect(studioCard).toContainText("NO SUBSCRIPTION");
    await studioCard.getByRole("button", { name: `Grant ${studioName} a subscription` }).click();
    await admin.getByRole("button", { name: `Confirm granting ${studioName} a subscription` }).click();
    await expect(admin.getByText(`${studioName} is subscribed for 12 months — nothing charged, the owner has been told`)).toBeVisible({ timeout: 15_000 });
    // the studio is public the moment its subscription is: the card says LIVE,
    // and the standing behind it is the grant
    await owner.goto("/business");
    await expect(owner.getByTestId("studio-live")).toBeVisible();
    await owner.goto("/subscription");
    await expect(owner.getByTestId("studio-subscription").filter({ hasText: studioName })).toContainText("GRANTED");
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
    // 2026): the group, the studio's door, the figure. Since 19 Sep 2026 a PUBLIC
    // organization can be followed (R25, the user: "all profiles can be followed"),
    // so the Profile tab carries its Followers figure too — none yet, and a button
    await owner.goto("/profile");
    await expect(owner.getByText("Your studios")).toBeVisible();
    await expect(owner.getByRole("link", { name: `Open ${studioName}` })).toBeVisible();
    await expect(owner.getByRole("link", { name: "1 studio — open the hub" })).toBeVisible();
    await expect(owner.getByRole("button", { name: "0 followers" })).toHaveCount(1);

    // ---- create + publish a class ----------------------------------------
    // ⚠ FROM THE HUB, because that is the door this asserts. The hub's CARD
    // opens the STUDIO'S OWN HOME (14 Sep 2026; the whole card since 15 Sep):
    // the header, today's rooms and its tools, the register among them. The
    // Profile tab's "Your studios" row is a DIFFERENT door and goes straight to
    // the register — clicking there and then waiting for /business/{id} is how
    // this segment sat on a 15-minute timeout.
    await owner.goto("/business");
    await hubCard.getByRole("link", { name: `${studioName} — open the studio` }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+$/);
    tenantId = owner.url().match(/\/business\/([0-9a-f-]+)$/)?.[1] ?? null;
    await expect(owner.getByRole("heading", { name: studioName, exact: true })).toBeVisible();
    await expect(owner.getByText("Studio Tools")).toBeVisible();
    await expect(owner.getByText("Nothing in your rooms today")).toBeVisible();
    // the studio's pictures are set in the Edit sheet (16 Sep 2026, the user:
    // "the update image option should be inside the edit profile") — the hero
    // shows them and offers no control of its own
    await expect(owner.getByLabel("Add a photo")).toHaveCount(0);
    await expect(owner.getByLabel("Add a header picture")).toHaveCount(0);
    await owner.getByRole("button", { name: "Edit studio", exact: true }).click();
    const studioSheet = owner.getByRole("dialog", { name: "Edit business" });
    await expect(studioSheet.getByLabel("Add a photo")).toBeAttached();
    await expect(studioSheet.getByLabel("Add photos of your space")).toBeAttached();
    // and the address does not move because somebody scrolled past the map
    await expect(studioSheet.getByRole("button", { name: "Change address" })).toBeVisible();
    await expect(studioSheet.getByRole("searchbox", { name: /Search an address/ })).toHaveCount(0);
    // ⚠ AND CANCEL MEANS CANCEL (16 Sep 2026). A staged picture is held in the
    // browser and nothing is uploaded until Save, so dismissing the sheet must
    // leave the record exactly as it was. The reported bug was the opposite: a
    // pressed ✕ destroyed the file outright and Cancel had nothing to undo.
    const proofRows = async () =>
      ((await (
        await fetch(`${supabaseUrl}/rest/v1/studio_photos?business_id=eq.${tenantId}&deleted_at=is.null&select=id`, { headers: adminHeaders })
      ).json()) as unknown[]).length;
    // this studio showed DanceOS five photos to be verified, and they ARE its header
    const before = await proofRows();
    expect(before).toBe(5);
    // stage one more, and stage a removal of one that exists
    await studioSheet.getByLabel("Add photos of your space").setInputFiles(ONE_PX_PNG);
    await confirmCrop(owner);
    await expect(studioSheet.getByLabel(`Remove photo ${before + 1}`)).toBeAttached({ timeout: 20_000 });
    await studioSheet.getByLabel("Remove photo 1").click();
    await expect(studioSheet.getByLabel("Undo removing photo 1")).toBeAttached();
    expect(await proofRows(), "a pressed ✕ has not touched the database").toBe(before);
    await studioSheet.getByRole("button", { name: "Cancel" }).click();
    expect(await proofRows(), "and Cancel left every picture exactly where it was").toBe(before);
    await owner.getByRole("link", { name: "Classes", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);

    // ---- the room came with the studio; give it an amenity (Step 11) ------
    // 18 Sep 2026: the register's chip rail is gone (the user: "the row below the
    // classes heading … should be removed") — every door it held is a tile on the
    // studio's own home, which is where this goes now.
    await owner.goto(`/business/${tenantId}`);
    await owner.getByRole("link", { name: "Rooms", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/rooms$/);
    // amenities live with the room and show up on the public class page
    await owner.getByRole("button", { name: "Amenities in Studio A" }).click();
    await owner.getByRole("button", { name: "🪞 Mirrors", exact: true }).click();
    await expect(owner.getByText("🪞 Mirrors", { exact: false }).first()).toBeVisible();

    /* ---- THE TRAINER SIGNS UP FIRST, AND IS THEN ASKED BY NAME (Step 12b,
       re-cut 20 Sep 2026) -------------------------------------------------
       ⚠ THE ORDER OF THESE TWO IS THE PRODUCT'S, NOT THE TEST'S. Until today
       the owner invited an ADDRESS that had no account yet and the trainer
       signed up into it — the whole point of an emailed invite. The user has
       since removed that door ("Remove option to add by email"), so the only
       way onto a team is the people picker, and the picker can only find
       somebody who already exists. The story therefore creates the person
       first. What it costs is recorded in the backlog: nobody can be asked
       onto a team before they join DanceOS. */
    const trainerEmail = `e2e-trainer-${stamp}@example.com`;
    trainerId = await signUp(trainer, trainerEmail);
    await onboard(trainer, trainerName, "User", "Pune");

    await owner.goto(`/business/${tenantId}/staff`);
    await owner.getByRole("button", { name: "Add a team member" }).click();
    const inviteSheet = owner.getByRole("dialog", { name: "Add a team member" });
    /* ── ONE WAY IN (20 Sep 2026): the picker. The labels a studio has to give
       are its own (`rolesFor`); the PERMISSIONS table beside them is gone at
       the user's word — a member's own row prints what their seat carries. ── */
    await expect(inviteSheet.getByRole("button", { name: "Visiting faculty" })).toBeVisible();
    await expect(inviteSheet.getByText("PERMISSIONS")).toHaveCount(0);
    await expect(inviteSheet.getByRole("button", { name: "By email" })).toHaveCount(0);
    await expect(inviteSheet.getByLabel("Search for somebody to add")).toBeVisible();
    await expect(inviteSheet.getByRole("button", { name: "Scan a profile code" })).toBeVisible();
    await inviteSheet.getByLabel("Search for somebody to add").fill(trainerName);
    await inviteSheet.getByRole("button", { name: `Ask ${trainerName}` }).click({ timeout: 20_000 });
    // they show as asked-but-unanswered (18575, the prototype's own words), and the QR it promised is here
    await expect(owner.getByText(/Waiting on them to confirm/)).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: `Show the invite for ${trainerName}` }).click();
    const qrSheet = owner.getByRole("dialog", { name: `Invite for ${trainerName}` });
    await expect(qrSheet.getByRole("img", { name: /Invite code/ })).toBeVisible();
    await expect(qrSheet.getByText(/\/join\/[0-9a-f]+/)).toBeVisible();
    await qrSheet.getByRole("button", { name: "Done" }).click();
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
    // step 1 — basics: when, what, and the room it runs in (no name: the class is
    // called "{style} · {level}", so the register reads "Bollywood · All levels")
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await owner.getByLabel("Class date").fill(inThreeDays);
    // the style is picked through the app's one picker (F4 / W2): open it, search, choose
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByLabel("Search styles").fill("Bolly");
    await owner.getByRole("button", { name: "Bollywood", exact: true }).click();
    await owner.getByRole("button", { name: "Hold it in Studio A" }).click();
    // the button reads "Continue" once every answer on the step is given (15573-15578)
    await owner.getByRole("button", { name: "Continue" }).click();
    // the room now defines the capacity (prototype: "defined by Studio A")
    await expect(owner.getByText(/defined by Studio A/)).toBeVisible();
    // ---- WHO IS TAKING IT: ANYONE ON DANCEOS, ASKED (18 Sep 2026) ----------
    // The team list is gone from this form — the user: "Who is taking class should
    // be any user or artist and should send a request to the user or artist for
    // accepting". So it is the app's one people search, and the person is ASKED.
    await owner.getByLabel("Search DanceOS for who takes this class").fill(trainerName);
    await owner.getByRole("button", { name: `${trainerName} takes this class` }).click();
    // Step 13: at a RATE. The rate field is the owner's alone — the RPCs refuse it
    // from anybody else, and since 18 Sep 2026 only an owner reaches this form at all.
    await owner.getByLabel("What a session pays the artist").fill("900");
    // and assistants are NOT on this form any more: they are added from the class page
    await expect(owner.getByText(/Assistants are added from the class page/)).toBeVisible();
    // step 2 — people & price. Free trial: the ₹300 default would route booking
    // through Razorpay (Step 9), which the paid-webhook spec covers.
    await owner.getByLabel("Price per session").fill("0");
    // ---- IT CAN ONLY BE SAVED AS A DRAFT (18 Sep 2026) ---------------------
    // "All classes when submitting should only go in drafts and can only be
    // published once the who is taking the class accepts." So the form offers no
    // Publish at all for a studio, and says what the save will do.
    await expect(owner.getByRole("button", { name: "Publish class" })).toHaveCount(0);
    await expect(owner.getByText(new RegExp(`Saved as a draft\\. ${trainerName} is asked`))).toBeVisible();
    await owner.getByRole("button", { name: "Save & ask them" }).click();
    await owner.getByRole("dialog", { name: "Save as draft?" }).getByRole("button", { name: "Save & ask" }).click();

    // back on the register, and the class is a DRAFT waiting on the person asked
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);
    await owner.getByRole("button", { name: /^Draft, \d+ classes$/ }).click();
    registerTile = owner.locator(`[aria-label="Open ${classTitle}"]`);
    await expect(registerTile).toBeVisible();
    // the row wears the request it waits on, and Publish says why it cannot yet
    // (the chip is drawn uppercase by CSS; the DOM text is the sentence itself)
    await expect(owner.getByText(`⏳ ${trainerName} asked`, { exact: true })).toBeVisible();
    await owner.getByRole("button", { name: /^Publish — Publish waits for the teacher/ }).click();
    await expect(owner.getByText("Publish waits for the teacher — nobody has accepted this class yet")).toBeVisible();

    // ---- THE TEACHER SAYS YES, AND ONLY THEN CAN IT GO LIVE ----------------
    await trainer.goto("/inbox");
    // the Inbox opens on All, which counts what waits; the cards with their two
    // answers live on the Requests desk (S_chats)
    await pressPill(trainer, /^Requests — \d+ waiting/);
    await trainer.getByRole("button", { name: `Confirm ${classTitle}` }).click();
    await expect(trainer.getByText(/Confirmed · you are the artist taking it/)).toBeVisible({ timeout: 15_000 });
    // now the owner publishes from the register — the door the form no longer is
    await owner.goto(`/business/${tenantId}/classes`);
    await owner.getByRole("button", { name: /^Draft, \d+ classes$/ }).click();
    await owner.getByRole("button", { name: "Publish", exact: true }).click();
    await owner.getByRole("dialog", { name: "Publish this class?" }).getByRole("button", { name: "Publish it" }).click();
    // the register stays on the tab you were reading — the class has moved to Published
    await expect(owner.getByRole("button", { name: /^Published, [1-9]\d* classes$/ })).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: /^Published, [1-9]\d* classes$/ }).click();
    registerTile = owner.locator(`[aria-label="Open ${classTitle}"]`);
    await expect(registerTile).toBeVisible();

    // ---- the studio calendar (Step 14): the same session, on the schedule ---
    // Schedule lists every day with something on it, so the class three days
    // out is there; Month opens on today, which honestly has nothing on.
    // (18 Sep 2026: from the studio's own home, the register's chip rail being gone)
    await owner.goto(`/business/${tenantId}`);
    await owner.getByRole("link", { name: "Calendar", exact: true }).click();
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
    await owner.goto(`/business/${tenantId}`);
    await owner.getByRole("link", { name: "Earnings", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/earnings$/);
    await expect(owner.getByText(/DanceOS does not move this money/)).toBeVisible();
    // 18 Sep 2026: the trainer is ON the ledger from here, because accepting the
    // class is what let it be published at all — and nothing is owed yet, because
    // the session is three days out. (Until today the ask was still unanswered at
    // this point and the desk read "Nobody has taught a session yet".)
    await expect(owner.getByText(trainerName).first()).toBeVisible();
    await expect(owner.getByText("₹0", { exact: true }).first()).toBeVisible();

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
    // 18 Sep 2026: adding an assistant is done HERE, not in the form — the owner or
    // the person taking the class searches DanceOS and the person is asked
    await expect(owner.getByRole("button", { name: "Add someone to the team" })).toBeVisible();
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
    await onboard(learner, learnerName, "User", "Pune");

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

    // ⚠ THE CALENDAR CHIP IS OFF THIS PAGE (19 Sep 2026, the user: "Classes in
    // Tools — remove Calender button on top right"). Calendar is a tile of its
    // own on Home, so the chip was a second door to it; the route is untouched.
    await expect(learner.getByRole("link", { name: "Calendar ›" })).toHaveCount(0);

    // ---- and on their calendar (Step 14): a booking is what they TRAIN in ----
    await learner.goto("/calendar");
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
    /* NO FIGURE ON THE PAGE (19 Sep 2026, the user: "remove all kinds of stats
       from profile page"): the live count rides the Follow toggle as data, so
       the suite can still watch it move without a number being printed */
    const studioFollow = learner.getByTestId("follow-toggle");
    await expect(studioFollow).toHaveAttribute("data-followers", "0");
    await learner.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(learner.getByRole("button", { name: "Following" })).toBeVisible();
    await expect(studioFollow).toHaveAttribute("data-followers", "1");
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
    await owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` }).click();
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
    // R15 (9 Sep 2026): AN EVENT IS THE ORGANIZATION'S. Neither the studio's
    // register NOR its own home offers an Events door, because a studio cannot
    // host one — `save_event` refuses a studio host outright. ONE desk, opened
    // from the organization's Home, and the public page names the organization.
    await owner.goto(`/business/${tenantId}/classes`);
    await expect(owner.getByRole("link", { name: "Events", exact: true })).toHaveCount(0);
    /* 15 Sep 2026: and not on the studio's own home either */
    await owner.goto(`/business/${tenantId}`);
    await expect(owner.getByRole("link", { name: "Events", exact: true })).toHaveCount(0);
    await owner.goto("/");
    await owner.getByRole("link", { name: "Events", exact: true }).click();
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
    // and it sits on YOUR EVENTS, under "Booked as a spectator" (18 Sep 2026: the
    // Home grid's Events tile — participant · spectator · assisting — replaced the
    // Your tickets shelf that used to sit under the classes)
    await learner.goto("/my-events?show=spectator");
    // the page is headed the way the tile is (18 Sep 2026): the Events hero, in its colour
    await expect(learner.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(learner.getByRole("link", { name: `Open ${eventTitle}` })).toBeVisible();
    // and not under participants, which is a different thing to be at an event
    await learner.goto("/my-events");
    await expect(learner.getByRole("link", { name: `Open ${eventTitle}` })).toHaveCount(0);

    // the owner runs the door: the manager's Spectators register, Check in → In
    await owner.getByRole("link", { name: `${eventTitle} — Showcase` }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events\/[0-9a-f-]+$/);
    await expect(owner.getByText("EVENT DETAILS")).toBeVisible();
    await owner.getByRole("button", { name: "Spectators" }).click();
    await expect(owner.getByText("GATE LIST · 0/1 arrived")).toBeVisible();
    await owner.getByRole("button", { name: `Check in ${learnerName}` }).click();
    /* fifteen: a check-in is a server action and a re-render, and the default
       five lost a run on a busy machine (19 Sep 2026 — the same shape as the
       style chip above and the 18 Sep "Since 2016" flake) */
    await expect(owner.getByRole("button", { name: `Check out ${learnerName}` })).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByText("GATE LIST · 1/1 arrived")).toBeVisible({ timeout: 15_000 });
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
    /* ⚠ "Create crew", not "＋ Create crew" (20 Sep 2026). The ＋ moved to the top
       of the desk as the shared `DeskAddButton`, where the glyph is an
       `aria-hidden` icon and the LABEL is the words — which is what a screen
       reader should say, and a different accessible name from the one the dashed
       row carried. The same slice's Rooms and Team buttons kept theirs, and the
       only way to know which of the three moved was to DIFF the three files
       against HEAD rather than hunt with another 12-minute run. */
    await learner.getByRole("link", { name: "Create crew", exact: true }).click();
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
    // the crew's HOME (18 Sep 2026): the hero, the Team and Events tiles, the crew's own bar
    await expect(learner.getByTestId("crew-hero")).toBeVisible();
    await expect(learner.getByRole("navigation", { name: "Crew" }).getByRole("link", { name: "Inbox" })).toBeVisible();
    await learner.getByRole("link", { name: "Team", exact: true }).click();
    await learner.waitForURL(/\/crews\/[0-9a-f-]+\/manage\/team$/);
    // ASKED IS NOT JOINED: the desk says the trainer has not answered, and counts one member
    await expect(learner.getByText("⏳ Waiting on them to confirm")).toBeVisible();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("1");

    // the trainer answers from the Requests desk — only they can
    await trainer.goto("/inbox");
    // the desk counts everything waiting on them — an earlier class ask included — so the crew
    // ask is found by its own words rather than by the total
    await expect(trainer.getByRole("button", { name: `Open the a crew member request from ${learnerName}` })).toBeVisible();
    await pressPill(trainer, /^Requests — \d+ waiting/);
    await expect(trainer.getByText(`wants to add you to ${crewName}`)).toBeVisible();
    await trainer.getByRole("button", { name: `Confirm ${crewName}` }).click();
    /* AN ANSWERED ASK STAYS ON THE DESK (19 Sep 2026, the user: "enquiries and
       requests don't get removed after accepting") — the row wears its answer
       and its buttons are gone; it used to vanish.
       ⚠ SCOPED TO THIS ROW, AND THAT IS THE POINT (20 Sep 2026). This read
       `getByText("✅ Confirmed — you said yes")` against the whole desk, where the
       CLASS ask segment 1 confirmed already wears that exact sentence — so it
       passed the instant the page rendered, proved nothing about the crew, and
       waited for nothing. The count check under it was then the only real
       assertion and had 5 seconds to beat a server action that takes ~4 s on this
       machine, which is a coin toss rather than a test. Worse, once the crew was
       confirmed the desk held TWO of that sentence, so the bare locator was one
       green run away from a strict-mode violation. The row is the unit here. */
    const crewAsk = trainer.getByTestId("request-row").filter({ hasText: `wants to add you to ${crewName}` });
    await expect(crewAsk.getByText("✅ Confirmed — you said yes")).toBeVisible({ timeout: 15_000 });
    await expect(crewAsk.getByRole("button", { name: `Confirm ${crewName}` })).toHaveCount(0);
    await expect(crewAsk.getByRole("button", { name: `Reject ${crewName}` })).toHaveCount(0);
    await learner.reload();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("2");
    await expect(learner.getByText("Member", { exact: true })).toBeVisible();

    // the public page prints the confirmed roster; the hub knows which list the trainer belongs on
    await trainer.goto(`/crew/${crewId}`);
    /* the Members figure left the page (19 Sep 2026) — the roster IS the count: two rows, each opening a person */
    await expect(trainer.getByRole("link", { name: /'s profile$/ })).toHaveCount(2);
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
    /* Discover is a SHARED shelf: any Bollywood class in Pune wears this same
       derived name, so the tile is pinned to this run's class by its share slug */
    const ourTile = learner.locator(`a[href="/c/${shareSlug}"][aria-label="Open ${classTitle}"]`);
    await expect(ourTile).toBeVisible();
    await learner.getByRole("button", { name: "Bollywood", exact: true }).click();
    await learner.waitForURL(/styles=Bollywood/);
    await expect(learner.getByRole("button", { name: "Bollywood", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(ourTile).toBeVisible();
    // a style the studio does not teach empties the shelf, with a door back
    await learner.goto("/discover?city=Pune&tab=classes&styles=Kalbelia");
    await expect(learner.getByText("Nothing in Pune matches that")).toBeVisible();
    await learner.getByRole("link", { name: "Clear filters" }).click();
    await expect(ourTile).toBeVisible();

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
    await expect(owner.getByText(`${learnerName} booked ${classTitle}`)).toBeVisible();
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
    await learner.goto(`/crews/${crewId}/manage/team`);
    await learner.getByRole("link", { name: `Open ${trainerName}'s profile` }).click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);
    /* THE HEADING, not the text (16 Sep 2026). `exact: true` was put here to
       dodge Next's route announcer on the theory that it carries the page TITLE
       ("E2E Trainer — DanceOS"); on a fresh navigation it carries the bare NAME,
       so `exact` made the clash certain rather than avoiding it — a strict-mode
       violation that only shows up when the suite runs its specs in parallel and
       this page is opened cold. The name on this page is an <h1>; ask for that. */
    await expect(learner.getByRole("heading", { name: trainerName, exact: true })).toBeVisible();
    /* THE EYEBROW ON THE HERO, scoped (18 Sep 2026). A class cannot be published
       until the person taking it accepts, so the trainer accepted back in segment
       1 — and their page now carries what that makes true: a TEACHES AT row for
       the studio, whose own meta line reads "Artist · 1 class · Pune". Two matches
       for a bare "ARTIST", so the one that is the hero's is asked for by name. */
    /* "Artist", not "ARTIST" — the eyebrow uppercases in CSS (20 Sep 2026, C29),
       and it carries the account number against it (C28) */
    await expect(learner.getByTestId("person-hero").getByText(/^Artist(-\d{6})?$/)).toBeVisible();
    /* ⚠ AND THE STUDIO IS ON THIS PAGE TWICE SINCE 20 Sep 2026, ON PURPOSE.
       "Studios taught at" counts PUBLISHED CLASSES; "Studios associated with"
       counts the SEAT they hold (`person_associations`, the user's list E).
       Both are true of this trainer — they accepted the class in segment 1 AND
       that acceptance seated them as visiting faculty — so a bare locator for
       the studio's door is now a strict-mode violation rather than a check.
       Assert what the slice actually promises: both groups, one door each. */
    await expect(learner.getByRole("link", { name: new RegExp(`^Open ${studioName}`) })).toHaveCount(2);
    await expect(learner.getByText("Studios taught at")).toBeVisible();
    await expect(learner.getByText("Studios associated with")).toBeVisible();
    // the crew they confirmed into is on their page, and it opens the crew
    await expect(learner.getByRole("link", { name: `Open ${crewName}` })).toBeVisible();
    // following a person is one bit, and the count moves — as data on the toggle,
    // never as a figure on the page (19 Sep 2026)
    const personFollow = learner.getByTestId("follow-toggle");
    await expect(personFollow).toHaveAttribute("data-followers", "0");
    await learner.getByRole("button", { name: "Follow" }).click();
    await expect(learner.getByRole("button", { name: /^Following/ })).toBeVisible();
    await expect(personFollow).toHaveAttribute("data-followers", "1");
    // and it is really one bit: pressing again takes it back
    await learner.getByRole("button", { name: /^Following/ }).click();
    await expect(learner.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(personFollow).toHaveAttribute("data-followers", "0");

    // the search box offers people now — and the row opens the person
    await learner.goto("/discover?city=Pune&tab=classes");
    await learner.getByLabel("Search DanceOS").fill(trainerName);
    /* AN ARTIST IS LISTED UNDER ARTISTS, AS THE PERSON (later on 18 Sep 2026, the
       user: "should only come as their profile as artist, no separate page
       required"): the trainer holds a live plan, so the dropdown's section for
       them is Artists — People is the users WITHOUT a plan — and the one row
       opens /person. The heading is asked for inside the results listbox,
       because the Discover tab tile says "Artists" too. */
    await expect(learner.getByRole("listbox", { name: "Search results" }).getByText("Artists")).toBeVisible();
    await learner
      .getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) })
      .and(learner.locator('[href^="/person/"]'))
      .click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);

    // an organization is never a result and has no page for anybody else (R9):
    // the same term finds the trainer and not the owner, and the owner's address
    // answers 404 — while the admin, who verifies it, still reads it as evidence
    await learner.goto("/discover?city=Pune&tab=classes");
    /* two claims, each on a term that cannot be crowded out by a leftover: this
       run stamp finds the trainer, and the organization name finds nobody */
    await learner.getByLabel("Search DanceOS").fill(stamp);
    /* AN ARTIST IS FOUND ONCE (later on 18 Sep 2026, the user: "should only come
       as their profile as artist, no separate page required"): search lists the
       trainer under Artists as the PERSON — one row, opening their profile — and
       the page Home provisioned for them is nobody's destination any more */
    const trainerRows = learner.getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) });
    await expect(trainerRows).toHaveCount(1);
    await expect(trainerRows.and(learner.locator('[href^="/person/"]'))).toBeVisible();
    await learner.getByLabel("Search DanceOS").fill("E2E Owner");
    await expect(learner.getByRole("option", { name: /^E2E Owner/ })).toHaveCount(0);
    const orgPage = await learner.goto(`/person/${ownerId}`);
    expect(orgPage?.status()).toBe(404);
    await admin.goto(`/person/${ownerId}`);
    /* ⚠ "Organization", NOT "ORGANIZATION" (20 Sep 2026): this page read
       `KIND_BADGE` where Home and the Profile tab read `KIND_WORD`, and
       `HERO_EYEBROW` uppercases in CSS — so the two LOOKED identical while a
       screen reader said two different things. `KIND_BADGE` is deleted. The word
       carries the account number against it now, with no gap (C28), so the match
       is on the joined token rather than on the word alone. */
    await expect(admin.getByTestId("person-hero").getByText(/^Organization(-\d{6})?$/)).toBeVisible();
    /* ⚠ `exact: true` (20 Sep 2026): Playwright's name matching with a bare
       STRING is a case-insensitive SUBSTRING, so "An organization does not
       follow" — the disabled bell's own reason — matched a locator asking for
       "Follow" and this line went red on a page that was right. The bell is not
       drawn here at all now (an organization's public face is /org/{id}), and
       the locator says what it means either way. */
    await expect(admin.getByRole("button", { name: "Follow", exact: true })).toHaveCount(0);

    // the crew's public roster opens its people too, and the trainer's own page
    // says it is theirs rather than offering them a Follow button
    await trainer.goto(`/crew/${crewId}`);
    await trainer.getByRole("link", { name: `Open ${trainerName}'s profile` }).click();
    await trainer.waitForURL(/\/person\/[0-9a-f-]+$/);
    /* "This is you · Your record ›" is GONE (19 Sep 2026, the user: "remove This is
       your record … from profile page"): your own page offers no Follow, and the
       Stats chip beside the QR opens your own record */
    await expect(trainer.getByTestId("person-hero")).toBeVisible();
    await expect(trainer.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", "/stats");
    await expect(trainer.getByRole("button", { name: "Follow", exact: true })).toHaveCount(0);
    // ⚠ and the public view of yourself offers NO photo control (16 Sep 2026):
    // this page is what the eye in the tab bar opens, so it is what a visitor
    // sees and nothing else
    await expect(trainer.getByLabel("Change your photo")).toHaveCount(0);
    /* ⚠ THE PICTURES ARE BEHIND THE DISC ON HOME NOW (19 Sep 2026, the user:
       "Profile Pic and Top bar Photo column only editable from home tab and
       should be removed from edit profile … should be able to click and view
       both pictures sections when clicking on that photo"). The Edit sheet has
       no pictures in it at all; the disc on Home opens the one screen that has
       both, and it is where a picture is changed. The file still goes from THIS
       browser straight to Storage with the trainer's own session (the proof
       covers the rules; only a browser can cover the upload). */
    await trainer.goto("/");
    await trainer.getByTestId("hero-disc").waitFor();
    /* ⚠ TWO CONTROLS, TWO JOBS, NO SHEET IN BETWEEN (20 Sep 2026, the user:
       "Profile pic edit should just be a pencil besides and clciking on photo to
       view it not together in one. Similarly seprate for poster photos"). Until
       today the disc opened "Your pictures", which SHOWED both and edited
       neither — so looking at your own photo meant reading an editor and then
       opening a second one. The picture is a picture now: pressing it opens it,
       and the pencil beside it is the one way to change it. */
    await expect(trainer.getByRole("button", { name: "Your pictures" })).toHaveCount(0);
    await expect(trainer.getByTestId("hero-disc").locator("img").first()).toBeVisible();
    await trainer.getByRole("button", { name: `${trainerName} — profile picture` }).click();
    await expect(trainer.getByLabel(`${trainerName} — picture 1 of 1`)).toBeVisible();
    await trainer.getByRole("button", { name: "Close the picture" }).click();
    /* the pencil, and the picture's own editor — it commits on upload, so no Save */
    await trainer.getByRole("button", { name: "Change profile picture" }).click();
    const picSheet = trainer.getByRole("dialog", { name: "Profile picture" });
    await expect(picSheet.getByLabel("Change your photo")).toBeAttached();
    await picSheet.getByRole("button", { name: "Remove the photo" }).click();
    await expect(trainer.getByTestId("hero-disc").locator("img")).toHaveCount(0, { timeout: 20_000 });
    await picSheet.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
    await confirmCrop(trainer);
    await expect(trainer.getByTestId("hero-disc").locator("img").first()).toBeVisible({ timeout: 20_000 });
    await expect(picSheet.getByLabel("Change your photo")).toBeAttached();
    await picSheet.getByRole("button", { name: "Done" }).click();
    /* and the POSTERS have their own pencil, on the rail rather than the disc */
    await trainer.getByRole("button", { name: "Edit posters" }).click();
    await expect(trainer.getByRole("dialog", { name: "Posters" })).toBeVisible();
    await trainer.getByRole("dialog", { name: "Posters" }).getByRole("button", { name: "Cancel" }).click();
    /* and Edit profile carries neither picture any more */
    const wordsOnly = await openEditProfile(trainer);
    await expect(wordsOnly.getByLabel("Change your photo")).toHaveCount(0);
    await expect(wordsOnly.getByLabel("Add picture")).toHaveCount(0);
    await wordsOnly.getByRole("button", { name: "Cancel" }).click();
    // a stranger — no account at all — reads the same page and is offered Follow
    const guestContext = await browserRef.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.goto(studioUrl);
      await expect(guest.getByText(studioName).first()).toBeVisible();
      await expect(guest.getByRole("link", { name: "Follow" })).toBeVisible();
      await expect(guest.getByTestId("follow-toggle")).toHaveAttribute("data-followers", "1");
    } finally {
      await guestContext.close();
    }
  });

  test("everything you manage: one list over every business you run", async () => {
    // ---- parity slice: S_managed ----
    // The Home deck offers the door only to somebody who runs something; behind it
    // is one list of every class and event of every business they belong to, the
    // row being the session's own card with its desk behind it.
    /* ⚠ THE DOOR IS NOT ON THE SHELF HEAD ANY MORE (18 Sep 2026, the user:
       "remove all blue buttons besides Todays schedule"). That cyan Manage link
       was the only blue thing on either Home; it survives on the empty day's
       pill, so this segment gets in by address. */
    await owner.goto("/");
    await expect(owner.getByRole("link", { name: "Everything you manage", exact: true })).toHaveCount(0);
    /* and no Manage TILE either (19 Sep 2026, the user: "just need to remove
       manage as the tile in tools, nothing else changes") */
    await expect(owner.getByRole("link", { name: "Manage", exact: true })).toHaveCount(0);
    await owner.goto("/managed");
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
    /* ⚠ "Artist", not "ARTIST" (19 Sep 2026): the Profile tab and Home read ONE
       kind map now, and it is the title-cased one — `HERO_EYEBROW` does the
       shouting in CSS, so the DOM keeps the word a screen reader should say. */
    /* ⚠ AND THE NUMBER IS PART OF THAT WORD (20 Sep 2026, the user: "Id should be
       placed like for eg. Artist-000123 together there should be no gap"). It was
       its own text node, matched by /^\d{6}$/; the two are nested in ONE span now,
       so the assertion is on the joined token — which is also what a screen
       reader says, and the reason for nesting rather than sitting them side by
       side in a zero-gap row (that looked joined and read as two words). */
    await expect(trainer.getByText(/^Artist-\d{6}$/).first()).toBeVisible();
    await expect(trainer.getByTestId("my-followers")).toHaveText("0");
    /* ⚠ AND NO PENCIL ON THIS PAGE (19 Sep 2026, the user: "all edit profile
       options to be removed from home and profile pages") — the corner is the
       eye alone, and Edit profile is Settings' first tile */
    await expect(trainer.getByRole("button", { name: "Edit profile", exact: true })).toHaveCount(0);
    await expect(trainer.getByRole("link", { name: "Public view" })).toBeVisible();
    // Edit profile: a date of birth, from Settings.
    // ⚠ NO BIO SINCE 20 Sep 2026 (the user: "Remove bio from all profiles") — the
    // field is off both Edit sheets and `BioBlock` is deleted. The sheet is
    // asserted NOT to offer one, because a removal nobody checks comes back.
    await openEditProfile(trainer);
    await expect(trainer.getByRole("dialog", { name: "Edit profile" }).getByLabel("Bio")).toHaveCount(0);
    /* A DATE OF BIRTH, NOT AN AGE (19 Sep 2026, the user: "age should always be
       DOB instead when selecting anywhere in the app"): a date 24 years and a
       day ago, so the page prints "24" whatever today is */
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 24);
    dob.setDate(dob.getDate() - 1);
    await trainer.getByLabel("Date of birth").fill(dob.toISOString().slice(0, 10));
    await trainer.getByRole("dialog", { name: "Edit profile" }).getByRole("button", { name: "Save" }).click();
    /* the sheet closes when the action returns, and the page refreshes after
       that — two round trips, 10 s on a loaded machine (14 Sep 2026). Wait for
       the close first: a value read while the sheet is still open is the form's,
       not the page's. */
    await expect(trainer.getByRole("dialog", { name: "Edit profile" })).toHaveCount(0, { timeout: 20_000 });
    await trainer.goto("/profile");
    await expect(trainer.getByText("24 Yrs · Pune")).toBeVisible({ timeout: 15_000 });

    /* ---- THE BAND IS EDITED ON HOME (19 Sep 2026, the user: "Dance style for
       the page should also be editable only from the home tab … social media
       tiles also on home and should be editable only from here … Social media
       Links right below Dance styles"). The Profile tab SHOWS all three and
       offers a control on none of them; Home is where they change. ---- */
    await expect(trainer.getByRole("button", { name: "Add a dance style" })).toHaveCount(0);
    await expect(trainer.getByRole("button", { name: "Add a link" })).toHaveCount(0);
    await trainer.goto("/");
    await trainer.getByTestId("hero-disc").waitFor();
    // a style, from the registry
    await trainer.getByRole("button", { name: "Add a dance style" }).click();
    await trainer.getByRole("button", { name: "Add Kathak", exact: true }).click();
    await expect(trainer.getByRole("dialog", { name: "Add a dance style" }).getByText("Kathak", { exact: true })).toBeVisible();
    await trainer.getByRole("dialog", { name: "Add a dance style" }).getByRole("button", { name: "Done" }).click();
    /* fifteen, not five: this waits on a SERVER re-render after the sheet's save
       (`router.refresh()`), exactly as the About and place lines above it do —
       and it lost a whole suite run to the default on 19 Sep 2026, which is the
       18 Sep "Since 2016" flake in a new coat */
    await expect(trainer.getByLabel("Kathak — one of your styles", { exact: true })).toBeVisible({ timeout: 15_000 });
    // a link, on a known platform — the chip prints the handle, not the URL
    await trainer.getByRole("button", { name: "Add a link" }).click();
    await trainer.getByRole("button", { name: "Add Instagram" }).click();
    await trainer.getByLabel("URL", { exact: true }).fill("https://instagram.com/rheamoves");
    await trainer.getByRole("dialog", { name: "Add your Instagram" }).getByRole("button", { name: "Save" }).click();
    await trainer.getByRole("dialog", { name: "Add a social link" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByRole("button", { name: "Instagram — @rheamoves" })).toBeVisible({ timeout: 15_000 });
    // and a bad address is refused with the database's own sentence, not saved
    await trainer.getByRole("button", { name: "Add a link" }).click();
    await trainer.getByRole("button", { name: "Add YouTube" }).click();
    await trainer.getByLabel("URL", { exact: true }).fill("rheamoves");
    await trainer.getByRole("dialog", { name: "Add your YouTube" }).getByRole("button", { name: "Save" }).click();
    await expect(trainer.getByText(/web address|url/i).first()).toBeVisible();
    await trainer.getByRole("dialog", { name: "Add your YouTube" }).getByRole("button", { name: "Cancel" }).click();
    await trainer.getByRole("dialog", { name: "Add a social link" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByRole("button", { name: /^YouTube/ })).toHaveCount(0);

    /* ---- AND THE TWO FIGURES ON HOME, EACH OPENING ITS LIST (19 Sep 2026, the
       user: "show follower following also on home it should be clickable with
       list to see follower following list with profile type name and photo") ---- */
    await expect(trainer.getByTestId("home-followers")).toBeVisible();
    await trainer.getByTestId("home-following").click();
    const following = trainer.getByRole("dialog", { name: "Following" });
    await expect(following).toBeVisible();
    await expect(following.getByRole("button", { name: "Studios" })).toBeVisible();
    await following.getByRole("button", { name: "All" }).click();
    /* ⚠ AND NO RANK (19 Sep 2026, the user: "Remove rank from home") — where you
       stand is the Stats chip's own screen, which prints its population too */
    await expect(trainer.getByRole("link", { name: /rank/i })).toHaveCount(0);
    await trainer.goto("/profile");

    // ---- the gear, and what is behind it (S_profiletab 11402-11440) ----
    // The top bar carries the settings gear on every screen; on the Profile tab
    // it opens the sheet rather than just landing on the tab (19263).
    await trainer.getByRole("link", { name: "Settings", exact: true }).click();
    const settings = trainer.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByText("YOUR PLAN")).toBeVisible();
    /* 19 Sep 2026: TILES, and no Notifications among them — "What reaches you"
       lives on the bell's own screen, once (the user: "can remove notifications
       and keep it inside the notifications section only"); Help & support and
       Message DanceOS merged into one door to the conversation */
    await expect(settings.getByRole("button", { name: /Notifications/ })).toHaveCount(0);
    await expect(settings.getByRole("link", { name: /Notifications/ })).toHaveCount(0);
    await expect(settings.getByRole("link", { name: /Help & support/ })).toHaveAttribute("href", "/support");
    await expect(settings.getByRole("link", { name: /Message DanceOS/ })).toHaveCount(0);
    // and Log out is here, where the prototype keeps it
    await expect(settings.getByRole("button", { name: /Log out/ })).toBeVisible();
    /* Enquiry types is the prototype's own sheet (9000-9030). Since 18 Sep 2026 the
       trainer OWNS an artist page — Home provisioned it the moment their plan was
       live — and the Profile tab configures THAT business first. An artist takes
       all five kinds, judge included (4934); a studio would take four. */
    await settings.getByRole("button", { name: /Enquiry types/ }).click();
    const enqTypes = trainer.getByRole("dialog", { name: "Enquiry types" });
    await expect(enqTypes.getByText("5 of 5 switched on")).toBeVisible();
    await enqTypes.getByRole("button", { name: "Done" }).click();
    // Payments is a real screen now (S_payments 16531): the trainer's goes to their OWN page's desk
    await settings.getByRole("link", { name: /Payments & verification/ }).click();
    await expect(trainer).toHaveURL(/\/business\/[0-9a-f-]+\/payments$/);
    expect(trainer.url()).not.toContain(tenantId);
    await expect(trainer.getByRole("heading", { name: "Payments & verification" })).toBeVisible();
    await expect(trainer.getByText("ACCEPTED FROM STUDENTS")).toBeVisible();
    // on the STUDIO's desk the trainer is not the owner — the switches are drawn but refuse to move
    await trainer.goto(`/business/${tenantId}/payments`);
    await expect(trainer.getByText("ACCEPTED FROM STUDENTS")).toBeVisible();
    await trainer.getByRole("switch", { name: "Bank transfer" }).click();
    await expect(trainer.getByText("Only the owner changes what the business accepts")).toBeVisible();
    await trainer.getByRole("button", { name: "Verification" }).click();
    /* 14 Sep 2026: the badge is the STUDIO's now, and an admin gave this studio
       its badge in the first segment — so the tab reads verified, and it would
       be a bug if it did not */
    await expect(trainer.getByText("Verified studio")).toBeVisible();
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
    await expect(trainer.getByText(/^Artist(-\d{6})?$/).first()).toBeVisible({ timeout: 15_000 });

    // ---- the business's own words on its public page (Since 10691, Call 10879) ----
    // ⚠ NO ABOUT SINCE 20 Sep 2026 (the user: "Remove bio from all profiles") — the
    // textarea is off this sheet too, and the sheet is asserted not to offer one.
    // The COLUMN is still read and simply never written, so an existing paragraph
    // survives a Save; what is proven here is that the form cannot set one.
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "Edit business" }).click();
    const bizEdit = owner.getByRole("dialog", { name: "Edit business" });
    await expect(bizEdit.getByLabel("About")).toHaveCount(0);
    await bizEdit.getByLabel("Since").selectOption("2016");
    await bizEdit.getByLabel("Phone", { exact: true }).fill("+91 98765 43210");
    await bizEdit.getByRole("button", { name: "Save" }).click();
    /* fifteen seconds, not the default five: this lands in the one SERVER
       re-render the save triggers, and a whole-suite run was lost to the default
       here on 18 Sep 2026 (green alone, nothing on the page changed) */
    await expect(owner.getByText("Since 2016")).toBeVisible({ timeout: 15_000 });
    // a stranger reads it too, and Call is a real tel: hand-off
    await learner.goto(studioUrl);
    await expect(learner.getByText("Since 2016")).toBeVisible({ timeout: 15_000 });
    await expect(learner.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919876543210");

    // somebody else reads the same things on the person page — and can open the link.
    // ⚠ NO BIO ANYWHERE (20 Sep 2026): the page draws none, on any of the five kinds.
    await learner.goto(`/person/${trainerId}`);
    await expect(learner.getByText("Movement is a language.")).toHaveCount(0);
    await expect(learner.getByText("24 Yrs · Pune")).toBeVisible();
    /* the tile names whose style it is (15 Sep 2026, when this page moved onto
       `IdentityHero`, which takes a `styleAria`) — a bare "Kathak" is the label
       nothing has carried since */
    await expect(learner.getByLabel(/^Kathak — a style .+ dances$/)).toBeVisible();
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
    // (the head's own cyan "All bookings" link went on 18 Sep 2026 with every other
    // blue button; the Classes tile in the grid beneath the shelf is that door now)
    await expect(learner.getByRole("link", { name: "All bookings", exact: true })).toHaveCount(0);
    await expect(learner.getByRole("link", { name: "Classes", exact: true })).toHaveAttribute("href", "/my-classes");

    // the trainer accepted this class back in segment 1 — a class cannot be
    // published until they do (18 Sep 2026) — so the session is on their day from
    // the moment it is on the clock, wearing Teaching: no pass, no invoice, because
    // it is not a booking
    // (their name is in the class's artist column, which is what accepting put there;
    // "You’re on this class" is the toast the accept fires, and that happened in
    // segment 1, in their Inbox)
    await trainer.goto(`/c/${shareSlug}`);
    await expect(trainer.getByRole("link", { name: `Open ${trainerName}` })).toBeVisible();
    await expect(trainer.getByRole("button", { name: "Accept this ask" })).toHaveCount(0);
    await trainer.goto("/");
    const taught = trainer.getByTestId("deck-card").first();
    await expect(taught.getByText("Teaching", { exact: true })).toBeVisible();
    await expect(taught.getByRole("button", { name: "Invoice" })).toHaveCount(0);

    // AN ORGANIZATION'S HOME ASKS NO STUDIO'S QUESTION (17 Sep 2026, the user:
    // "organization home tab should not have classes options"): its doors are Manage
    // and Events, its grid is Studios · Events · Stats, and nothing on it opens a
    // register or a studio calendar — it used to open its FIRST studio's.
    await owner.goto("/");
    await expect(owner.getByRole("link", { name: "Events", exact: true })).toHaveAttribute("href", /\/business\/[0-9a-f-]+\/events$/);
    await expect(owner.getByRole("link", { name: "Classes at this studio" })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Open the studio calendar" })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Classes", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Students", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Studios", exact: true })).toBeVisible();
    // Stats is the chip beside the QR in the hero since 18 Sep 2026, not a tile — still one link called Stats
    await expect(owner.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
    // the studio's question — what is running in its rooms — is asked on the STUDIO's own home
    await owner.goto(`/business/${tenantId}`);
    await expect(owner.getByTestId("deck-card").first().getByText("At your studio", { exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: "Classes", exact: true })).toHaveAttribute("href", `/business/${tenantId}/classes`);
    await expect(owner.getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute("href", `/business/${tenantId}/calendar`);
  });

  test("the wiring slice: a tick, two numbers, a followers list and two buttons that had no door", async () => {
    // ---- parity slice 7: D7 · N8 · I4 · B6 · the History chip · See crew ranking · the rank row ----
    // Every row here is the same shape of gap — a FIELD that exists and a SCREEN
    // that never read it — so they are proved together, in the order a person
    // would meet them.

    // ── D7: the tick on Discover's cards. Verification is DanceOS's to give
    // (the guard migration makes that a rule, not a comment), so the story sets
    // it the only way anything can: through the service role.
    const ticked = await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ verified_at: new Date().toISOString() }),
    });
    expect(ticked.ok).toBeTruthy();
    await learner.goto("/discover?city=Pune&tab=studios");
    const studioCard = learner.getByRole("link", { name: `Open ${studioName}` });
    await expect(studioCard).toBeVisible();
    await expect(studioCard.getByLabel("Verified")).toBeVisible();

    // ── N8: a person publishes a number through the Edit profile sheet — the one
    // way in since parity slice 7 — and takes it back down through the same sheet.
    // ⚠ Since 19 Sep 2026 the number is NOT drawn on a person's page: the user's
    // list gives Call to studios and organizations only (R25 — "user: nothing";
    // an artist's Call is a toggle in push 2, NEXT TO DO #0r). So the record holds
    // it, the sheet reads it back, and a stranger's page shows no Call either way.
    const editSheet = learner.getByRole("dialog", { name: "Edit profile" });
    await openEditProfile(learner);
    await editSheet.getByLabel("Phone").fill("+91 98765 43210");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    // the record kept it: the sheet re-opens holding the number. `openEditProfile`
    // navigates, so it re-reads the row — re-opening in the same breath as the
    // save would race router.refresh() and read the OLD one
    await openEditProfile(learner);
    await expect(editSheet.getByLabel("Phone")).toHaveValue("+91 98765 43210", { timeout: 15_000 });
    // somebody else's read of it: the trainer opens the learner's page — no Call on a user's page
    await trainer.goto(`/person/${learnerId}`);
    await expect(trainer.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveCount(0);
    // and it is the person's to withdraw: an empty box saves null
    await editSheet.getByLabel("Phone").fill("");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    await openEditProfile(learner);
    await expect(editSheet.getByLabel("Phone")).toHaveValue("", { timeout: 15_000 });
    await editSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(editSheet).toHaveCount(0);

    // ── I4: the OTHER end of an enquiry can ring too. The business publishes its
    // number on its own page; the person who asked reads it on the enquiry they sent.
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "Edit business" }).click();
    const bizSheet = owner.getByRole("dialog", { name: "Edit business" });
    await bizSheet.getByLabel("Phone", { exact: true }).fill("+91 90000 11111");
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
    await owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(owner.getByText("No number on this enquiry — quote them here instead")).toBeVisible();

    // ── B6: who follows you is a list, for the owner and nobody else — a small
    // button in the owner's row since 19 Sep 2026, no count on it (the number is
    // inside the sheet, with the list)
    await owner.goto(studioUrl);
    await owner.getByRole("button", { name: "Followers — see who" }).click();
    const followersSheet = owner.getByRole("dialog", { name: "Followers" });
    const learnerRow = followersSheet.getByRole("link", { name: /E2E Learner/ });
    await expect(learnerRow).toBeVisible();
    await expect(learnerRow).toHaveAttribute("href", `/person/${learnerId}`);
    await learnerRow.click();
    await owner.waitForURL(`**/person/${learnerId}`);
    // a follower reading the same page gets their own Following toggle, not the door
    await learner.goto(studioUrl);
    await expect(learner.getByTestId("follow-toggle")).toHaveAttribute("data-followers", "1");
    await expect(learner.getByRole("button", { name: /see who/ })).toHaveCount(0);

    /* ⚠ THE HISTORY CHIP IS OFF THE CALENDAR (19 Sep 2026, the user: "Calendar —
       remove History button"). The destination is untouched (Rule 14): the Stats
       chip in the calendar's own hero opens the record, and History is a segment
       of it — which is the one place a library of past sessions belongs. */
    await learner.goto("/calendar");
    await expect(learner.getByRole("link", { name: "History" })).toHaveCount(0);
    await learner.goto("/stats?tab=history");
    await expect(learner.getByTestId("history-count")).toBeVisible();

    // the battle record is the crew's Events desk since 18 Sep 2026
    await learner.goto(`/crews/${crewId}/manage/events`);
    const rankingBtn = learner.getByRole("link", { name: "See crew ranking" });
    await expect(rankingBtn).toHaveAttribute("href", "/stats?tab=charts&seg=crew");
    await rankingBtn.click();
    await learner.waitForURL(/seg=crew/);
    await expect(learner.getByRole("link", { name: new RegExp(`^${crewName} — place \\d+ of \\d+$`) })).toBeVisible();

    /* ⚠ THE RANK IS OFF BOTH SCREENS (19 Sep 2026 — "remove rank from profile
       tab", then "Remove rank from home"). Where you stand is the Stats chip's
       own page, which prints the place WITH its population; a bare "#4" beside
       two follower counts said less than it implied. Both are asserted here
       because a rank row reappearing on either is the regression. */
    const rankLink = /^Rank \d+ of \d+ — open global rankings$/;
    for (const page of [learner, trainer]) {
      await page.goto("/profile");
      await expect(page.getByRole("link", { name: rankLink })).toHaveCount(0);
      await page.goto("/");
      await expect(page.getByRole("link", { name: rankLink })).toHaveCount(0);
      /* and the chip that DOES answer it is still exactly one, on both */
      await expect(page.getByRole("link", { name: "Stats", exact: true })).toHaveCount(1);
    }
  });

  test("memberships: four fields, sold from the studio's page, held and tracked", async () => {
    // ---- memberships (19 Sep 2026) ----
    // The user: "Memberships can be created by just 4 things — Name, No. of hrs
    // / No. of classes and price and total memberships count … Users should be
    // able to buy from Studio and Artist Profile Pages and track from
    // memberships section in tools … make sure able to track memberships usage
    // for class and student wise with progress bar for completion."
    const passName = `E2E Pass ${stamp}`;

    // ── FOUR FIELDS AND NOTHING ELSE. It is free on purpose: a free membership
    // is granted on the press, which is the only way a browser test can hold a
    // real pass — a priced one opens Cashfree's own window.
    await owner.goto("/memberships");
    await expect(owner.getByRole("heading", { name: "Memberships" })).toBeVisible();
    await owner.getByRole("button", { name: "＋ New membership" }).click();
    await owner.getByLabel("Membership name").fill(passName);
    await owner.getByLabel("How many classes").fill("2");
    await owner.getByLabel("Price", { exact: true }).fill("0");
    await owner.getByLabel("Total memberships").fill("5");
    await owner.getByRole("button", { name: "Put it on sale" }).click();
    const card = owner.getByRole("link", { name: `Open ${passName}` });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // ── IT IS ON SALE ON THE STUDIO'S OWN PUBLIC PAGE, which is where the user
    // said it is bought — not on a desk somebody has to be told about
    await learner.goto(`/studio/${tenantId}`);
    const onSale = learner.getByTestId("memberships-on-sale");
    await expect(onSale).toBeVisible({ timeout: 15_000 });
    await expect(onSale.getByText(passName)).toBeVisible();
    await expect(onSale.getByText("2 classes · 5 left")).toBeVisible();

    /* ── AND A PERSON TAKES IT FROM THERE, through the PAYMENT STEP (19 Sep
       2026, the user: "Membership on profiles to have a better pay button and
       should take to payment option"). A free one says "no payment" in the same
       sheet rather than pretending there is a step to take. ── */
    await learner.getByRole("button", { name: `Take ${passName}` }).click();
    const payStep = learner.getByRole("dialog", { name: "Confirm — no payment" });
    await expect(payStep).toBeVisible();
    await expect(payStep.getByText("2 classes")).toBeVisible();
    await expect(payStep.getByText("Free")).toBeVisible();
    await payStep.getByRole("button", { name: "Take it" }).click();
    await expect(learner.getByText("find it under Memberships")).toBeVisible({ timeout: 20_000 });

    // ── which is exactly where it is: the tools' own Memberships section, with
    // the progress bar reading off real units — nothing used yet
    await learner.goto("/memberships");
    const held = learner.getByTestId("my-pass").filter({ hasText: passName });
    await expect(held).toBeVisible({ timeout: 15_000 });
    /* BOOKED · MANAGE (19 Sep 2026, the user: "membership columns should be
       Booked and Manage") — the learner sells nothing, so they see no segments
       at all; the seller below sees both */
    // the bar is drawn from two real numbers, never a stored percentage
    await expect(held.getByTestId("pass-progress")).toHaveAttribute("data-pct", "0");
    await expect(held.getByTestId("pass-progress")).toHaveAttribute("aria-label", "0 of 2 used");
    // and they may not take a second one while one is live — the database's rule
    await learner.goto(`/studio/${tenantId}`);
    await learner.getByRole("button", { name: `Take ${passName}` }).click();
    await learner.getByRole("dialog", { name: "Confirm — no payment" }).getByRole("button", { name: "Take it" }).click();
    await expect(learner.getByText("use it up first")).toBeVisible({ timeout: 20_000 });

    // ── THE SELLER TRACKS IT, per class and per student (the user's own words).
    // Nothing has been spent yet, so the honest answer is one holder at nothing
    // used — a figure and the list behind it being the same number (Step 25).
    await owner.goto("/memberships");
    /* the seller's two segments, in the user's own words */
    await expect(owner.getByRole("button", { name: /^Booked/ })).toBeVisible();
    await expect(owner.getByRole("button", { name: /^Manage/ })).toBeVisible();
    await card.click();
    await owner.waitForURL(/\/memberships\/[0-9a-f-]+$/);
    await expect(owner.getByRole("heading", { name: passName })).toBeVisible();
    await expect(owner.getByTestId("usage-sold")).toHaveText("1/5");
    await expect(owner.getByTestId("usage-active")).toHaveText("1");
    // it was free, so nothing was taken — and nobody has spent a unit yet
    await expect(owner.getByTestId("usage-progress")).toHaveAttribute("data-pct", "0");
    const holder = owner.getByTestId("membership-holder");
    await expect(holder).toHaveCount(1);
    await expect(holder.getByTestId("holder-progress")).toHaveAttribute("aria-label", "0 of 2 used");
    await expect(owner.getByText("Nobody has spent one on a class yet.")).toBeVisible();

    // ── AND THE CLASS SAYS WHOSE PASS PAYS FOR A SEAT (the Policy block). The
    // learner already holds a seat on this class, so no pass strip is offered
    // there — a seat is taken once, and the bar only offers what can happen.
    await learner.goto(`/c/${shareSlug}`);
    await expect(learner.getByText("A studio's pass covers a seat")).toBeVisible({ timeout: 15_000 });
    await expect(learner.getByTestId("pass-strip")).toHaveCount(0);

    // ⚠ SPENDING A PASS ON A SEAT is proven by the migration's own rolled-back
    // dry run rather than here: every class in this story is already booked by
    // the one learner it has, and inventing a second learner to spend a unit
    // would be a bigger change to the story than the thing it proves.
  });

  test("the team is asked by name, labelled, ordered and paid — and a student is a person", async () => {
    /* ---- 19 Sep 2026, the user: "Team should only be able to add team member
       by typing name, number, email or scan … Should be able to Label them
       according to what profile I am in. and labels available for that with
       permissions section. and able to pay them, track payment history and
       should be part of expenses in the earnings. should be able to place them
       in order as well. Students — adding same way as for Team and track
       student performance, photo stats, name and profile on clicking."

       ⚠ THIS SEGMENT SITS BEFORE THE CLASH SEGMENT ON PURPOSE, and the
       memberships one above it does for the same reason: accepting that
       segment's class ask seats the learner as VISITING FACULTY (R19), and the
       picker rightly refuses to offer somebody already on the team — so the
       search came back "Nobody on DanceOS by that name or number" and the ask
       could never be made. In a serial story, where a segment sits is part of
       its set-up. ---- */
    await owner.goto(`/business/${tenantId}/staff`);

    // ── ASKED BY NAME. The learner is on DanceOS and not on this team, so the
    // picker finds them — a name, and the row wears their picture.
    await owner.getByRole("button", { name: "Add a team member" }).click();
    const sheet = owner.getByRole("dialog", { name: "Add a team member" });
    await sheet.getByRole("button", { name: "Visiting faculty" }).click();
    await sheet.getByLabel("Search for somebody to add").fill(learnerName);
    await sheet.getByRole("button", { name: `Ask ${learnerName}` }).click({ timeout: 20_000 });
    await expect(owner.getByText(/Waiting on them to confirm/).first()).toBeVisible({ timeout: 15_000 });
    /* no address was typed and none is shown: this invite names a PERSON.
       ⚠ RE-CUT 20 Sep 2026: the flat roster printed the label and the address as
       ONE text node ("Visiting faculty · asked on DanceOS"), and the grouped
       roster prints them as separate spans — with no address span at all when
       there is none, because the "Waiting on them to confirm" line already says
       what the row is. So the claim is made directly: the fallback words are
       nowhere on the page, and the row carries the label it was asked into. */
    await expect(owner.getByText("asked on DanceOS")).toHaveCount(0);
    await expect(owner.getByText("Visiting faculty", { exact: true }).first()).toBeVisible();

    // and only they can answer it — the code is in the link the desk shows
    await owner.getByRole("button", { name: `Show the invite for ${learnerName}` }).click();
    const code = (await owner.getByRole("dialog", { name: `Invite for ${learnerName}` }).getByText(/\/join\/[0-9a-f]+/).innerText()).split("/join/")[1].trim();
    await owner.getByRole("dialog", { name: `Invite for ${learnerName}` }).getByRole("button", { name: "Done" }).click();
    await trainer.goto(`/join/${code}`);
    await expect(trainer.getByText(/sent to somebody else|not for you|different/i).first()).toBeVisible({ timeout: 15_000 }).catch(async () => {
      /* the screen's own words differ by state — what must be true is that the
         trainer is NOT offered the seat */
      await expect(trainer.getByRole("button", { name: /^Join/ })).toHaveCount(0);
    });
    await learner.goto(`/join/${code}`);
    await learner.getByRole("button", { name: /^Join/ }).click();
    await learner.waitForURL((u) => !u.pathname.startsWith("/join"), { timeout: 20_000 });

    // ── THE LABELS ARE THE STUDIO'S OWN — and the PERMISSIONS table beside
    // them is gone (20 Sep 2026, the user: "remove permission section just for
    // labelling"); the row itself prints what the seat carries.
    await owner.goto(`/business/${tenantId}/staff`);
    const memberRow = owner.getByRole("button", { name: `Manage ${learnerName}` });
    await expect(memberRow).toBeVisible({ timeout: 15_000 });
    await memberRow.click();
    const memberSheet = owner.getByRole("dialog", { name: learnerName });
    await expect(memberSheet.getByText("PERMISSIONS")).toHaveCount(0);
    await expect(memberSheet.getByRole("button", { name: `Make ${learnerName} Visiting faculty` })).toBeVisible();
    await memberSheet.getByRole("button", { name: `Make ${learnerName} Faculty` }).click();
    await expect(owner.getByRole("status")).toContainText("Faculty", { timeout: 15_000 });
    /* ⚠ the member sheet closes on its scrim or on system back, NOT on Escape —
       so a reload is the sure way to get back to the rows underneath it */
    await owner.reload();

    /* ── AND PAID, WITH A METHOD — the payment lands in the ledger the Earnings
       desk reads as MONEY OUT, so it is an expense the moment it is written.
       ⚠ PRESSED FROM THE ROW (20 Sep 2026). It was inside the member sheet,
       which opens only for a NON-owner, so an owner whose team is just
       themselves could never reach it — the user asked whether paying had been
       built at all, and from where they sat it had not. */
    await expect(owner.getByText("Nothing paid yet").first()).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: `Pay ${learnerName}` }).click();
    const paySheet = owner.getByRole("dialog", { name: `Pay ${learnerName}` });
    await paySheet.getByLabel("Amount in rupees").fill("2500");
    await paySheet.getByRole("button", { name: "UPI", exact: true }).click();
    await paySheet.getByLabel("Note").fill("September");
    await paySheet.getByRole("button", { name: "Record this payment" }).click();
    await expect(owner.getByRole("status")).toContainText("2,500", { timeout: 20_000 });
    /* the history reads on their OWN ROW now — the total beside the Pay button,
       so what has been paid is visible without opening anything (20 Sep 2026) */
    await owner.reload();
    await expect(owner.getByText(/₹2,500 paid · 1 payment/).first()).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: `Manage ${learnerName}` }).click();
    await expect(memberSheet.getByText("September")).toBeVisible({ timeout: 15_000 });
    await owner.reload();
    await owner.goto(`/business/${tenantId}/earnings`);
    await expect(owner.getByText("₹2,500").first()).toBeVisible({ timeout: 15_000 });

    // ── AND ORDERED. The owner arranges the team; a trainer cannot.
    await owner.goto(`/business/${tenantId}/staff`);
    await owner.getByRole("button", { name: `Move ${learnerName} up` }).click();
    await expect(owner.getByRole("button", { name: `Move ${learnerName} up` })).toBeDisabled({ timeout: 20_000 });
    await trainer.goto(`/business/${tenantId}/staff`);
    await expect(trainer.getByRole("button", { name: /^Move / })).toHaveCount(0);

    // ── A STUDENT IS A PERSON: picked, so the row carries their picture, opens
    // their profile, and counts what they have actually done here.
    await owner.goto(`/business/${tenantId}/students`);
    await owner.getByRole("button", { name: "Add a lead" }).click();
    const addStudent = owner.getByRole("dialog", { name: "Add a lead" });
    await addStudent.getByLabel("Search for a student").fill(trainerName);
    await addStudent.getByRole("button", { name: `Add ${trainerName}` }).click({ timeout: 20_000 });
    await expect(owner.getByRole("link", { name: `Open ${trainerName}'s profile` })).toHaveAttribute("href", `/person/${trainerId}`, { timeout: 15_000 });
    /* the walk-in is still a real student, and has neither a door nor a record */
    await owner.getByRole("button", { name: "Add a lead" }).click();
    await addStudent.getByRole("button", { name: "Walk-in" }).click();
    await addStudent.getByLabel("Lead name").fill("E2E Walk-in");
    await addStudent.getByRole("button", { name: "Save lead" }).click();
    await expect(owner.getByRole("button", { name: "Open E2E Walk-in" })).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByRole("link", { name: "Open E2E Walk-in's profile" })).toHaveCount(0);
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

    /* 18 SEP 2026: THE CLASH IS MET AT THE PUBLISH, NOT AT THE FORM. A class is
       saved as a draft now and a draft holds no room, so there is nothing to clash
       with until somebody presses Publish on the register — which is where the
       question is asked and the sheet answers it. */
    await owner.goto(`/business/${tenantId}/classes/new`);
    await owner.getByLabel("Class date").fill(when.date);
    await owner.getByLabel("Starts").selectOption(when.time);
    await owner.getByLabel("Dance style", { exact: true }).click();
    await owner.getByRole("button", { name: "Salsa", exact: true }).click();
    await owner.getByRole("button", { name: "Hold it in Studio A" }).click();
    await owner.getByRole("button", { name: "Continue" }).click();
    /* ⚠ THIS ASK GOES TO SOMEBODY OFF THE TEAM, AND THAT IS THE POINT (18 Sep
       2026). The user found the bug this covers: "when studio creating class
       request not going to artist in inbox". A class is born a DRAFT, and until
       `20260918140000` only the business's own members could read a draft — so
       the bell rang for the person asked and their Inbox was empty, because the
       repository drops an ask whose class it cannot read. Every earlier segment
       asks the trainer, who accepted a team invite back in segment 1 and could
       therefore read the draft as a MEMBER: the story tested the one case that
       cannot fail. The learner is on nobody's team. */
    await owner.getByLabel("Search DanceOS for who takes this class").fill(learnerName);
    await owner.getByRole("button", { name: `${learnerName} takes this class` }).click();
    await owner.getByLabel("Price per session").fill("0");
    await owner.getByRole("button", { name: "Save & ask them" }).click();
    await owner.getByRole("dialog", { name: "Save as draft?" }).getByRole("button", { name: "Save & ask" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);

    // the person asked reads the ask in their own Inbox, naming the studio that
    // sent it — which is the whole of the bug, since the studio is a draft's away
    await learner.goto("/inbox");
    await pressPill(learner, /^Requests — \d+ waiting/);
    await expect(learner.getByText(`wants to list you as the artist on Salsa · All levels`)).toBeVisible({ timeout: 15_000 });
    // and they say yes, so the only thing left in the way is the room
    await learner.getByRole("button", { name: "Confirm Salsa · All levels" }).click();
    await expect(learner.getByText(/Confirmed · you are the artist taking it/)).toBeVisible({ timeout: 15_000 });

    await owner.goto(`/business/${tenantId}/classes`);
    await owner.getByRole("button", { name: /^Draft, \d+ classes$/ }).click();
    await owner.getByRole("button", { name: "Publish", exact: true }).click();
    const sheet = owner.getByRole("dialog", { name: "Publish this class?" });
    await expect(sheet.getByText(/ROOM ALREADY BUSY/)).toBeVisible();
    await expect(sheet.getByText(new RegExp(`Studio A already has ${classTitle} at`))).toBeVisible();
    await expect(sheet.getByText(/A room is never double-booked/)).toBeVisible();
    // the primary button no longer offers what the database would refuse
    await expect(sheet.getByRole("button", { name: "Publish it" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Change the slot" })).toBeVisible();
    // (exact: the chrome's own "Go back" chip matches a loose "Back")
    await owner.getByRole("button", { name: "Back", exact: true }).click();
    // and it is still a DRAFT — not in any room, so it clashed with nothing.
    // Its name is derived ("Salsa · All levels"), and this studio has one Salsa class.
    const rows = (await (
      await fetch(`${supabaseUrl}/rest/v1/classes?business_id=eq.${tenantId}&title=eq.${encodeURIComponent("Salsa · All levels")}&select=status`, { headers: adminHeaders })
    ).json()) as Array<{ status: string }>;
    expect(rows.map((r) => r.status)).toEqual(["draft"]);
  });

  test("push 2: an organization names its owner, Call is a switch, an organization's pin, and a profile's own stats page", async () => {
    // ---- push 2 (19 Sep 2026): the user's answers on the profile-page re-cut that needed schema ----
    // "1. You add a user or artist in Team section for organization to label them as
    // owner. 2. Call is off for artist page by default but should have option to make
    // it available on profile and same for crew. 3. … locations should be the google
    // map link for the particular organization … 4. stats page on any profile should
    // show all stats for that particular profile and rankings as well."

    // ── 1. THE ORGANIZATION NAMES ITS OWNER, from the Team desk — asked, then confirmed.
    // An organization is still ONE LOGIN; Owner and Team are labels on its public page.
    await owner.goto("/business/team");
    await expect(owner.getByRole("heading", { name: "Team" })).toBeVisible();
    await owner.getByRole("button", { name: "Add to the team" }).click();
    await owner.getByRole("radio", { name: "Ask as owner" }).click();
    await owner.getByLabel("Search DanceOS for a dancer").fill(learnerName);
    await owner.getByRole("button", { name: `Ask ${learnerName} to be named an owner` }).click();
    // ASKED IS NOT JOINED: the desk says so, and counts one waiting
    await expect(owner.getByText("⏳ Waiting on them to confirm · as owner")).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByTestId("org-team-tile-waiting")).toHaveText("1");
    // an unanswered ask never puts a name on a public page: a visitor reads no Owner yet
    await trainer.goto(`/org/${ownerId}`);
    await expect(trainer.getByRole("link", { name: `Open ${learnerName}` })).toHaveCount(0);
    // the learner reads the ask in their own Inbox — a label on a public page is a claim about them — and says yes
    await learner.goto("/inbox");
    await pressPill(learner, /^Requests — \d+ waiting/);
    await expect(learner.getByText("wants to name you as an owner of E2E Owner")).toBeVisible({ timeout: 15_000 });
    await learner.getByRole("button", { name: "Confirm E2E Owner" }).click();
    /* the answered ask stays on the desk, wearing its answer (19 Sep 2026).
       ⚠ Scoped to THIS row for the reason written out at the crews segment: every
       answered ask wears the same sentence, so `.first()` dodged strict mode by
       matching whichever row came first — proving nothing here and waiting for
       nothing, which left the count below racing the server action. */
    const ownerAsk = learner.getByTestId("request-row").filter({ hasText: "wants to name you as an owner of E2E Owner" });
    await expect(ownerAsk.getByText("✅ Confirmed — you said yes")).toBeVisible({ timeout: 15_000 });
    await expect(ownerAsk.getByRole("button", { name: "Confirm E2E Owner" })).toHaveCount(0);
    // the desk counts one owner; the public page prints them under OWNER, with a door to their profile
    await owner.reload();
    await expect(owner.getByTestId("org-team-tile-owners")).toHaveText("1");
    await trainer.reload();
    const ownerRow = trainer.getByRole("link", { name: `Open ${learnerName}` });
    await expect(ownerRow).toBeVisible();
    await expect(ownerRow).toHaveAttribute("href", `/person/${learnerId}`);
    await expect(ownerRow).toContainText("Owner");
    // and the Stats chip on somebody else's organization page opens THAT organization's standing
    await expect(trainer.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", `/org/${ownerId}/stats`);

    // ── 2a. CALL IS A SWITCH ON AN ARTIST'S PAGE — off by default. The trainer holds the
    // plan (ending, still active), so their sheet carries the switch and their page may dial.
    const sheet = trainer.getByRole("dialog", { name: "Edit profile" });
    await openEditProfile(trainer);
    const callSwitch = sheet.getByRole("switch", { name: "Show Call on my profile" });
    await expect(callSwitch).toHaveAttribute("aria-checked", "false");
    await sheet.getByLabel("Phone").fill("+91 90000 22222");
    await callSwitch.click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toHaveCount(0);
    await learner.goto(`/person/${trainerId}`);
    await expect(learner.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919000022222", { timeout: 15_000 });
    // the Stats chip on somebody else's page opens THEIR record, not the board they stand on
    await expect(learner.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", `/person/${trainerId}/stats`);
    // off again: the number stays on the record, the page stops dialling it
    await openEditProfile(trainer);
    await expect(sheet.getByLabel("Phone")).toHaveValue("+91 90000 22222", { timeout: 15_000 });
    await expect(callSwitch).toHaveAttribute("aria-checked", "true");
    await callSwitch.click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toHaveCount(0);
    await learner.reload();
    await expect(learner.getByRole("link", { name: "Call" })).toHaveCount(0);
    // a plain user's sheet has no such switch: their page carries no buttons at all
    const userSheet = learner.getByRole("dialog", { name: "Edit profile" });
    await openEditProfile(learner);
    await expect(userSheet.getByRole("switch", { name: "Show Call on my profile" })).toHaveCount(0);
    await userSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(userSheet).toHaveCount(0);

    // ── 2b. AND ON A CREW'S PAGE — the leader's switch, in Edit crew. The policy on
    // crew_contacts IS the switch: off, no reader gets the number through any door.
    await learner.goto(`/crews/${crewId}/manage`);
    await learner.getByRole("button", { name: "Edit crew" }).click();
    const crewSheet = learner.getByRole("dialog", { name: "Edit crew" });
    const crewSwitch = crewSheet.getByRole("switch", { name: "Show Call on the crew's page" });
    await expect(crewSwitch).toHaveAttribute("aria-checked", "false");
    await crewSheet.getByLabel("Phone").fill("+91 90000 33333");
    await crewSwitch.click();
    await crewSheet.getByRole("button", { name: "Save" }).click();
    await expect(crewSheet).toHaveCount(0);
    await trainer.goto(`/crew/${crewId}`);
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919000033333", { timeout: 15_000 });
    await expect(trainer.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", `/crew/${crewId}/stats`);

    // ── 3. AN ORGANIZATION'S PIN lives in its Edit profile sheet, under Location — the
    // map itself is Google's and is driven by scripts/shots/shoot-location.js, not here;
    // what this asserts is that the block is the ORGANIZATION's alone
    const orgSheet = owner.getByRole("dialog", { name: "Edit profile" });
    await openEditProfile(owner);
    await expect(orgSheet.getByText("On the map")).toBeVisible();
    await expect(orgSheet.getByRole("switch", { name: "Show Call on my profile" })).toHaveCount(0);
    await orgSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(orgSheet).toHaveCount(0);

    // ── 4. SOMEBODY ELSE'S RECORD AND RANK — one page shape for four kinds of profile.
    // A place is never printed without its denominator, and an empty board is said,
    // not drawn as "#0" (Step 25's rule): the assertions accept either honest answer.
    const standing = /of \d+ (dancers?|artists?|studios?|crews?)|Not on this board yet/;
    await learner.goto(`/person/${trainerId}/stats`);
    await expect(learner.getByRole("heading", { name: trainerName })).toBeVisible();
    await expect(learner.getByText("The record")).toBeVisible();
    await expect(learner.getByTestId("standing-card")).toHaveCount(2);
    await expect(learner.getByTestId("standing-card").first()).toContainText(standing);
    await learner.goto(`/crew/${crewId}/stats`);
    await expect(learner.getByRole("heading", { name: crewName })).toBeVisible();
    await expect(learner.getByTestId("standing-card")).toHaveCount(2);
    await expect(learner.getByTestId("standing-card").first()).toContainText(standing);
    // a STRANGER reads a listed studio's, and an organization's — which is its studios' — but a plain user's is still a signed-in page
    const guestContext = await browserRef.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.goto(`/studio/${tenantId}/stats`);
      await expect(guest.getByRole("heading", { name: studioName })).toBeVisible();
      await expect(guest.getByTestId("standing-card")).toHaveCount(2);
      await expect(guest.getByTestId("standing-card").first()).toContainText(standing);
      await guest.goto(`/org/${ownerId}/stats`);
      await expect(guest.getByRole("heading", { name: "E2E Owner" })).toBeVisible();
      await expect(guest.getByRole("link", { name: `${studioName} — its record and rank` })).toHaveAttribute("href", `/studio/${tenantId}/stats`);
      await guest.goto(`/person/${learnerId}/stats`);
      await guest.waitForURL(/\/login/);
    } finally {
      await guestContext.close();
    }
  });

  test("the team by the profile you are in: two granted powers, four labels, and a label that IS a seat", async () => {
    // ---- 20 Sep 2026: the user's answers on the team slice ----
    // "1. permission given by Artist or Studio for managing Attendance and Refunds.
    //  2. [relabelling away from Studio owner silently takes the seat back] Fix in
    //  best way. 3. [no way to make somebody an owner from the studio's own desk]
    //  Yes and should be able to switch profile for that studio from profile
    //  switcher. 5. [associations are seats, not history] fix in best way."
    //
    // ⚠ Rule 9 in an e2e: one of the controls below hands out a REAL OWNER SEAT on
    // a studio. The migration's dry run proves the door; this proves the SCREENS
    // that reach it, which is the half that was missing when the door shipped.

    // ── 1. THE TWO STANDING POWERS are the studio's to grant, and only those two.
    // Everything else a seat carries is decided by the seat; these two are the ones
    // an owner hands out per person, because the database keeps them per person.
    await owner.goto(`/business/${tenantId}/staff`);
    await owner.getByRole("button", { name: `Manage ${learnerName}` }).click();
    const teamSheet = owner.getByRole("dialog", { name: learnerName });
    await expect(teamSheet.getByText("WHAT YOU GRANT THEM")).toBeVisible();
    const register = teamSheet.getByRole("switch", { name: `Run the register — ${learnerName}` });
    const refunds = teamSheet.getByRole("switch", { name: `Settle refunds — ${learnerName}` });
    await expect(register).toHaveAttribute("aria-checked", "false");
    await register.click();
    await expect(owner.getByRole("status")).toContainText("run the register on", { timeout: 15_000 });
    await expect(register).toHaveAttribute("aria-checked", "true");
    await expect(refunds).toHaveAttribute("aria-checked", "false");
    /* the grant is on the ROW, not in this sheet's head: a reload is the sure way
       back to the rows (the member sheet closes on its scrim, never on Escape) */
    await owner.reload();
    await owner.getByRole("button", { name: `Manage ${learnerName}` }).click();
    await expect(register).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });

    // ── 2. AND THE OWNER SEAT CAN BE HANDED OVER from the studio's own desk — the
    // half of the user's answer 3 that needed a new word in `set_member_role`. An
    // INVITE still cannot offer it: consent first, the seat after.
    await expect(teamSheet.getByRole("button", { name: `Make ${learnerName} Owner` })).toBeVisible();
    await teamSheet.getByRole("button", { name: `Make ${learnerName} Owner` }).click();
    await expect(owner.getByRole("status")).toContainText("Owner", { timeout: 15_000 });
    /* an owner holds both powers by their seat, so the grants beside them are gone
       rather than left as switches that cannot be turned off */
    await expect(teamSheet.getByText("WHAT YOU GRANT THEM")).toHaveCount(0);
    await expect(teamSheet.getByRole("button", { name: `Make ${learnerName} Owner` })).toHaveAttribute("aria-pressed", "true");
    /* ⚠ AND BACK TO FACULTY WITHOUT CLOSING THE SHEET. An OWNER's row carries no
       "Manage …" control at all (a studio's owner is not somebody the desk
       manages), so reloading here would shut the only door back — the sheet that
       is already open is the way out of the state it just created. */
    await teamSheet.getByRole("button", { name: `Make ${learnerName} Faculty` }).click();
    await expect(owner.getByRole("status")).toContainText("Faculty", { timeout: 15_000 });
    await owner.reload();
    await expect(owner.getByRole("button", { name: `Manage ${learnerName}` })).toBeVisible({ timeout: 15_000 });

    // ── 3. THE ORGANIZATION'S FOUR LABELS, and the one that is not a word.
    // The learner is this organization's confirmed Owner from the push-2 segment.
    await owner.goto("/business/team");
    const label = owner.getByRole("combobox", { name: `What ${learnerName} is` });
    await expect(label).toBeVisible({ timeout: 15_000 });
    /* all four are offered, and Studio owner names a studio rather than being one word */
    await expect(label.getByRole("option", { name: "Owner", exact: true })).toHaveCount(1);
    await expect(label.getByRole("option", { name: `Studio owner · ${studioName}` })).toHaveCount(1);
    await expect(label.getByRole("option", { name: "Event team" })).toHaveCount(1);
    await expect(label.getByRole("option", { name: "Other team member" })).toHaveCount(1);

    // ⚠ NAMING THE STUDIO IS THE GRANT. The toast says so, because this is the one
    // label on the screen that changes who can RUN something.
    await label.selectOption(`studio_owner:${tenantId}`);
    await expect(owner.getByRole("status")).toContainText(`now runs ${studioName}`, { timeout: 20_000 });

    // THE STUDIO'S OWN DESK SAYS THEY ARE AN OWNER OF IT NOW — the seat is real,
    // and the desk shows it the way it shows every owner: the row prints Owner and
    // stops being something the desk manages (an owner is not managed from here).
    await owner.goto(`/business/${tenantId}/staff`);
    /* two owners on this desk now — the organization that made the studio, and the
       person it just named.
       ⚠ RE-CUT 20 Sep 2026: the flat roster printed a LEVEL and a label in one
       text node ("Admin · Owner") and the grouped roster prints neither — the
       level word is gone (every label carries its own colour now, so a second,
       coarser scale would have painted Faculty, Visiting faculty and Assistant
       the same orange) and the label stands alone in the row. The group heading
       is the better claim anyway: it is the desk's own count of that seat, which
       is exactly what this check is about, and it does not care which row was
       drawn first. */
    await expect(owner.getByText("Owners", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByText("Owner", { exact: true })).toHaveCount(2);
    await expect(owner.getByRole("button", { name: `Manage ${learnerName}` })).toHaveCount(0);

    // …and the organization's public page prints them under Studio owners, with the
    // studio they run beside their name
    await trainer.goto(`/org/${ownerId}`);
    /* ⚠ `Group`'s title is a styled SPAN, not a heading (profile-kit) — so
       getByRole("heading") finds nothing here, and the absence check below would
       have passed for that reason rather than the right one. Text locators. */
    await expect(trainer.getByText("Studio owners", { exact: true })).toBeVisible({ timeout: 15_000 });
    const soRow = trainer.getByRole("link", { name: `Open ${learnerName}` });
    await expect(soRow).toContainText("Studio owner");
    await expect(soRow).toContainText(studioName);

    // ── 4. THE STUDIO IS A HOME THEY CAN SWITCH TO. ⚠ Not a before/after: they were
    // already on this studio's team as Faculty, so the row was already in their
    // switcher — what the owner seat changes is what they may DO once they are
    // there, which is why the studio's own home opens for them at all.
    await learner.goto("/");
    await learner.getByRole("button", { name: "Switch profile" }).click();
    /* ⚠ a MENUITEM, not a link: the switcher is a menu (`aria-haspopup="menu"`),
       so its rows carry that role however they are rendered. Read off the trace's
       own DOM snapshot rather than guessed — the row was there all along. */
    const studioRow = learner.getByRole("menuitem", { name: new RegExp(studioName) });
    await expect(studioRow).toBeVisible({ timeout: 15_000 });
    await expect(studioRow).toHaveAttribute("href", `/business/${tenantId}`);
    await studioRow.click();
    await learner.waitForURL(`**/business/${tenantId}`, { timeout: 20_000 });
    await expect(learner.getByRole("heading", { name: studioName })).toBeVisible({ timeout: 15_000 });

    // ── 5. A SEAT IS NOT A CLASS TAUGHT — the user's answer 5. Two groups, two
    // different facts: where somebody is on the team, and where they have published.
    await trainer.goto(`/person/${learnerId}`);
    await expect(trainer.getByText("Studios associated with", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(trainer.getByRole("link", { name: new RegExp(`Open ${studioName}`) }).first()).toBeVisible();

    // ── 6. ⚠ AND MOVING THE LABEL AWAY PUTS BACK WHAT IT REPLACED (20260920140000).
    // Before that migration this took the whole seat away: somebody who was Faculty
    // when the organization named them Studio owner fell off the studio's team
    // altogether when it changed the word back — and nothing said so.
    await owner.goto("/business/team");
    await label.selectOption("event_team");
    await expect(owner.getByRole("status")).toContainText(`no longer runs ${studioName}`, { timeout: 20_000 });
    await owner.goto(`/business/${tenantId}/staff`);
    const backRow = owner.getByRole("button", { name: `Manage ${learnerName}` });
    await expect(backRow).toBeVisible({ timeout: 15_000 });
    await backRow.click();
    await expect(teamSheet.getByRole("button", { name: `Make ${learnerName} Faculty` })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    /* and the public page stops calling them a studio owner */
    await trainer.goto(`/org/${ownerId}`);
    await expect(trainer.getByText("Studio owners", { exact: true })).toHaveCount(0);
  });

  test("routines: a song and a video, added from the class page, with its usage counted", async () => {
    // ---- routines (19 Sep 2026) ----
    // The user: "Routines are just a combination of Music — link or MP3 — and
    // Video — link. Artist should be able to add Routines from the class detail
    // page and should be visible. There should be a way to see the usage for
    // that particular routine — how many sessions taken with this and details of
    // people who have taken classes for this routine and how many."
    const routineName = `E2E Routine ${stamp}`;

    // ── the desk: a routine is made in Routines, never typed on a class (12334)
    await trainer.goto("/routines");
    await expect(trainer.getByRole("heading", { name: "Routines" })).toBeVisible();
    await trainer.getByRole("button", { name: "＋ New routine" }).click();
    await trainer.getByLabel("Routine name").fill(routineName);
    // ⚠ NO SONG NAME FIELD since 19 Sep 2026 (the user: "just remove song name
    // from the add routine form") — the link or the MP3 IS the song
    await expect(trainer.getByLabel("Song name")).toHaveCount(0);
    await trainer.getByLabel("Song link").fill("https://youtu.be/ilahi-instrumental");
    await trainer.getByLabel("Video link").fill("https://youtu.be/breath-release");
    await trainer.getByRole("button", { name: "Save routine" }).click();
    const row = trainer.getByRole("link", { name: `Open ${routineName}` });
    await expect(row).toBeVisible({ timeout: 15_000 });
    // it is on no class yet, and both media are real links on the row
    await expect(row.getByTestId("routine-classes")).toHaveText("0");
    await expect(row.getByRole("link", { name: `Open the song for ${routineName}` })).toHaveAttribute("href", "https://youtu.be/ilahi-instrumental");
    await expect(row.getByRole("link", { name: `Open the video for ${routineName}` })).toHaveAttribute("href", "https://youtu.be/breath-release");

    // ── the class page: the class's CONFIRMED ARTIST puts it on, and it shows
    await trainer.goto(`/c/${shareSlug}`);
    await trainer.getByRole("button", { name: "Add a routine to this class" }).click();
    await trainer.getByRole("button", { name: `Put ${routineName} on this class` }).click();
    await expect(trainer.getByRole("link", { name: `Open the song for ${routineName}` })).toBeVisible({ timeout: 15_000 });

    // ⚠ AND IT IS VISIBLE TO THE CLASS, NOT ONLY TO ITS ARTIST: the learner who
    // booked it reads the song and the video, and is offered no way to change them
    await learner.goto(`/c/${shareSlug}`);
    await expect(learner.getByRole("link", { name: `Open the video for ${routineName}` })).toHaveAttribute("href", "https://youtu.be/breath-release");
    await expect(learner.getByRole("button", { name: "Add a routine to this class" })).toHaveCount(0);
    await expect(learner.getByRole("button", { name: `Take ${routineName} off this class` })).toHaveCount(0);

    // ── THE USAGE, from within the routines section. ⚠ THE CLASS IS STILL AHEAD,
    // so the honest answer is one class and NOTHING ELSE: a class on the calendar
    // has taught nobody, and the page says so in the words the feature is built
    // on — dancers are people who were CHECKED IN, never people who booked.
    await trainer.goto("/routines");
    await expect(row.getByTestId("routine-classes")).toHaveText("1");
    await row.click();
    await trainer.waitForURL(/\/routines\/[0-9a-f-]+$/);
    await expect(trainer.getByRole("heading", { name: routineName })).toBeVisible();
    await expect(trainer.getByTestId("routine-classes")).toHaveText("1");
    await expect(trainer.getByTestId("routine-sessions")).toHaveText("0");
    await expect(trainer.getByTestId("routine-dancers")).toHaveText("0");
    await expect(trainer.getByText(/counts people who were CHECKED IN/)).toBeVisible();

    // ── and now the same routine after a session has actually RUN. The session is
    // back-dated and the register written with the service role — the two things
    // no user may do, and the same pair `scripts/demo-data.js` uses to make a past
    // class exist. This is the last segment, so nothing downstream reads the date.
    const cls = (await (await fetch(`${supabaseUrl}/rest/v1/classes?share_slug=eq.${shareSlug}&select=id,business_id`, { headers: adminHeaders })).json()) as Array<{ id: string; business_id: string }>;
    const ses = (await (await fetch(`${supabaseUrl}/rest/v1/class_sessions?class_id=eq.${cls[0].id}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    const bk = (await (await fetch(`${supabaseUrl}/rest/v1/class_bookings?session_id=eq.${ses[0].id}&user_id=eq.${learnerId}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/class_sessions?id=eq.${ses[0].id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ starts_at: ago(3), ends_at: ago(2) }) });
    await fetch(`${supabaseUrl}/rest/v1/attendance`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ class_booking_id: bk[0].id, session_id: ses[0].id, class_id: cls[0].id, business_id: cls[0].business_id, user_id: learnerId, created_by: ownerId, updated_by: ownerId }),
    });
    await trainer.reload();
    await expect(trainer.getByTestId("routine-sessions")).toHaveText("1");
    await expect(trainer.getByTestId("routine-dancers")).toHaveText("1");
    // and the people are named, with how many of its sessions each turned up to
    await expect(trainer.getByRole("link", { name: `Open ${learnerName}'s profile` })).toBeVisible();
    await expect(trainer.getByText("DANCERS WHO LEARNED IT · 1")).toBeVisible();

    // ── somebody else's routine is not theirs to see, and not on their desk
    const routineUrl = trainer.url();
    const seen = await learner.goto(routineUrl);
    expect(seen?.status()).toBe(404);
    await learner.goto("/routines");
    await expect(learner.getByRole("link", { name: `Open ${routineName}` })).toHaveCount(0);
  });

});
