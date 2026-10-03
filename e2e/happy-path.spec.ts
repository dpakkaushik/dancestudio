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
 *  no chips either: the City field is a Google city search, or, on a studio,
 *  the city the placed pin resolved to.
 *
 *  A test must not depend on Google answering — it costs quota and can simply
 *  stop on a demo key — so it takes the deterministic path the product has for
 *  exactly that situation: type the name, take it as typed. When the field
 *  already holds a city (an edit, or a pin that named one) it is a read-back
 *  with a Change button, so that is pressed first.
 *
 *  `page` is wherever the picker lives — the page, or the dialog it is in, so
 *  a sheet's own field is not confused with the page's behind it. */
/** ⚠⚠ EVERY DROPDOWN IN THE APP IS AN IN-APP SHEET NOW (27 Sep 2026) — so
 *  `selectOption` is gone from this suite, and the option is NOT inside the
 *  scope its trigger is in: `PickSheet` is PORTALLED to `document.body`, which
 *  is the whole point (an animated form panel clips a `position: fixed` child).
 *  So the trigger is clicked in `scope` and the option is found on the PAGE.
 *
 *  Two pickers answer to this: `Pick`/`PickSheet` names its rows `role="option"`,
 *  and the app's own style picker (`DosStylePicker`, the prototype's 3548, which
 *  draws its list INLINE) names its rows `role="button"`. One locator takes
 *  either, so a test does not have to know which control a screen wears. */
async function pick(scope: Page | Locator, label: string, option: string) {
  const page: Page = "context" in scope ? scope : scope.page();
  await scope.getByRole("button", { name: label, exact: true }).first().click();
  const row = page.getByRole("option", { name: option, exact: true });
  await row.or(page.getByRole("button", { name: option, exact: true })).first().click();
}

/** THE ONE CITY DROPDOWN (19 Sep 2026), an in-app sheet since 27 Sep. */
async function pickCity(page: Page | Locator, city: string) {
  /* a closed list since later on 19 Sep 2026: the city is one of the registry's options */
  await pick(page, "Choose a city", city);
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
/** R16 (9 Sep 2026): a STUDIO shows DanceOS five to ten photos of its space
 *  before it may ask to be verified — R16 said "organization" and 14 Sep moved
 *  the review onto the studio. They go to a PRIVATE bucket, so the only people
 *  who see them before it is listed are its own team and a platform admin. */
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

/** Walk onboarding as it stands since 26 Sep 2026: ONE kind of account. The
 *  "Organization" tap is GONE — the organization login was retired then
 *  (20260926120000), and organizations themselves on 29 Sep 2026. So: ONE name,
 *  the city, Continue (the row is made and the photo picker appears — the photo
 *  is REQUIRED, so Continue names it until one is up), the styles, optional
 *  links, and "Open DanceOS →" off the bow.
 *  ⚠ The `role` parameter went on 29 Sep: it had been typed `"User"` and
 *  `void`ed since the login was retired, which is a parameter offering a choice
 *  it no longer has. */
async function onboard(page: Page, name: string, city: string, style = "Hip-Hop") {
  await expect(page).toHaveURL(/\/onboarding/);
  /* the tap that used to be here must NOT be offered any more — asserted, so a
     tile that quietly came back would be caught by the first segment */
  await expect(page.getByText("Organization", { exact: true })).toHaveCount(0);
  await page.locator('input[name="name"]').fill(name);
  await pickCity(page, city);
  // the button reads "Continue" once the name is in (prototype 3820-3821)
  await page.getByRole("button", { name: "Continue" }).click();
  // the row exists now, so the picker is offered — and the button says the photo is missing
  await expect(page.getByRole("button", { name: "Add your profile photo" })).toBeVisible();
  await expect(page.getByLabel("Add a photo")).toBeAttached();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await confirmCrop(page);
  await expect(page.getByLabel("Your profile photo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

/** THE SHEET THAT OPENS A BUSINESS (26 Sep 2026): a studio from /business — and,
 *  until 29 Sep, an organization from /organizations, which wore the same
 *  fields. A name, where it is, the city, and a MOBILE NUMBER and an EMAIL,
 *  which the sheet requires. One helper fills the pair so no site forgets one
 *  and is refused at Create. */
async function fillBusinessContact(page: Page, email: string) {
  await page.locator('input[name="phone"]').fill("+919876543210");
  await page.locator('input[name="contact_email"]').fill(email);
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
/* ⚠ RE-CUT 26 Sep 2026 (the user: "edit profile to be removed from all profiles
   settings and should be a button on top right … clicking on the edit pencil
   button from top right on every profile should open the option to edit
   everything from the home tab"). The pencil is BACK on Home's corner and it
   TOGGLES edit mode — every editor appears with it — so the words a form still
   holds are the "Edit details" chip beside the name, and that is what opens the
   sheet. Settings has no Edit tile any more, and that is asserted where it was. */
async function openEditProfile(page: Page) {
  await page.goto("/");
  await enterEditMode(page);
  await page.getByRole("button", { name: "Edit details" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit profile" });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
}

/** press the corner pencil on a home so its editors appear — idempotent, so a
 *  segment can call it after a reload without knowing whether it already did */
async function enterEditMode(page: Page) {
  const pencil = page.getByRole("button", { name: "Edit profile", exact: true });
  await expect(pencil).toBeVisible({ timeout: 20_000 });
  if ((await pencil.getAttribute("aria-pressed")) !== "true") await pencil.click();
  await expect(pencil).toHaveAttribute("aria-pressed", "true");
}

/** the contact buttons' own sheet on a home (26 Sep 2026): the pencil, then the
 *  ⊕ beside the buttons — where a number, an email, a WhatsApp and Enquiry are
 *  made and unmade, now that none of them is in the Edit sheet */
async function openContacts(page: Page, at = "/") {
  await page.goto(at);
  await enterEditMode(page);
  await page.getByRole("button", { name: "Edit contact buttons" }).click();
  const sheet = page.getByRole("dialog", { name: "Contact buttons" });
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
  let businessId: string | null = null;
  /* ⚠ `eventsHostId` and `orgName` went on 29 Sep 2026: the organization
     BUSINESS the owner opened, and every address in this story that was keyed
     on it — its events desk, its team, its GST screen, its public page, its
     stats. `eventTitle`, `battleTitle` and `inTwelveDays` went with the events
     they named. */

  /* the values a later segment needs from an earlier one */
  let shareSlug = "";
  let studioUrl = "";
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
    /* business delete cascades classes → sessions → class_bookings; user delete
       cascades the profiles. Cleanup failures surface but don't mask the test. */
    if (businessId) {
      await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${businessId}`, { method: "DELETE", headers: adminHeaders });
    }
    /* EVERY BUSINESS THESE ACCOUNTS OWN GOES WITH THEM (18 Sep 2026): until
       29 Sep that included the organization the owner opened, and what it still
       catches is the artist page Home provisions for the trainer the moment
       their plan is live — a business whose owner is deleted is otherwise left
       ownerless on production (the #0w pile). */
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

  test("a person signs up, opens a studio, the studio is verified by an admin, and publishes a class with a room and a trainer", async () => {
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
    /* 26 Sep 2026: a USER. The organization login is retired; a person opens a
       studio from Home's Studios hub (the user: "user signs up as a user … and
       also has an option to open or run a studio"). */
    await onboard(owner, "E2E Owner", "Pune");

    // ---- NOTHING IS WITHHELD FROM A NEW PERSON --------------------------------
    // Nothing waits on an admin, and the hub offers Add studio from the first
    // minute (20260926090000 took the "Only an organization" line out of
    // why_no_studio).
    await owner.goto("/");
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);

    await owner.goto("/business");
    await expect(owner.getByRole("button", { name: "Add studio" })).toBeVisible();
    await expect(owner.getByRole("status", { name: /^Cannot add a studio: / })).toHaveCount(0);

    /* ⚠⚠ AN ORGANIZATION WAS OPENED HERE UNTIL 29 Sep 2026, and it is worth
       naming what went with it, because it was a quarter of this segment: the
       Organizations hub and its Add-organization sheet (a name, an area, a
       city, a number and an email, landing on the new business's own
       Subscription screen), the org business read back out of the database as
       `eventsHostId`, its events desk printing the one sentence between it and
       an event, `/business/{id}/events/new` redirecting to that organization's
       own GST screen with "Events need this first" on it, the GST number
       refused in the wrong shape and accepted in the right one, and the ₹5,000
       mandate granted through the service role so `org_is_public` read true.
       Every screen in that list is gone. */

    // ---- a platform admin — named through the service role, never self-serve --
    adminId = await signUp(admin, `e2e-admin-${stamp}@example.com`);
    const named = await fetch(`${supabaseUrl}/rest/v1/platform_admins`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ user_id: adminId }),
    });
    expect(named.ok).toBeTruthy();

    // ---- create the studio (nothing gates it at all since 26 Sep 2026 — any
    // ---- person may); it is born PRIVATE until it is verified AND subscribed --
    await owner.goto("/business");
    await owner.getByRole("button", { name: "Add studio" }).click();
    await owner.locator('input[name="name"]').fill(studioName);
    await owner.locator('input[name="area"]').fill("Baner");
    await pickCity(owner, "Pune");
    await expect(owner.locator('input[name="city"]')).toHaveValue("Pune");
    /* the sheet asks for a number and an email now (26 Sep 2026) */
    await fillBusinessContact(owner, `e2e-studio-${stamp}@example.com`);
    // the sheet carries the studio's rooms — "a studio is created WITH its
    // floors" (prototype 2675-2683), and Create is refused until one is named
    await owner.getByLabel("Room 1 name").fill("Studio A");
    // a studio says what it dances, at birth (19 Sep 2026) — the database
    // refuses one without a style, so Create is disabled until there is one
    await pick(owner, "Add a dance style", "Hip-Hop");
    await owner.getByRole("button", { name: "Create studio" }).click();

    /* ⚠ CREATING LANDS ON PAYMENT (27 Sep 2026 — the user's item 8, and their
       own answer: "Pay at creation, verify after"). The sheet used to close
       onto the hub in place; it goes straight to the new studio's own
       Subscription screen, so the money is part of creating. Asserted here
       rather than navigated around — and note SUBSCRIBE IS OFFERED while the
       studio is still unverified, which is the whole of the new order:
       `20260927100000` took `subscribe`'s badge refusal out, and
       `guard_business_visibility` still decides Discover. */
    /* ⚠ AND IT LANDS WITH THE BOW (2 Oct 2026, the user: "on creation similar
       welcome message for studio and crew profiles as we get on sign up") —
       `?welcome=studio` draws it over the Subscription screen; Continue drops
       the param with a replace and the screen is underneath, untouched */
    await owner.waitForURL(/\/business\/[0-9a-f-]{36}\/subscription\?welcome=studio$/, { timeout: 30_000 });
    const studioBow = owner.getByTestId("welcome-bow");
    await expect(studioBow).toContainText(`Welcome, ${studioName}!`, { timeout: 15_000 });
    await studioBow.getByRole("button", { name: "Continue" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]{36}\/subscription$/);
    await expect(owner.getByTestId("welcome-bow")).toHaveCount(0);
    await expect(owner.getByText("What it buys")).toBeVisible({ timeout: 15_000 });
    await expect(owner.getByRole("button", { name: /^Subscribe · / })).toBeVisible({ timeout: 15_000 });
    await owner.goto("/business");

    // the hub lists the new studio as a row
    const studioRow = owner.getByText(studioName, { exact: true });
    await expect(studioRow).toBeVisible();

    // ---- 11 Sep 2026: THE STUDIO IS WHAT DANCEOS VERIFIES ----------------------
    // The user: "the user will upload 5-10 images and social media for the
    // studio, then admin will verify the studio, then the studio will get badge,
    // then it will subscribe to go live." Under the row: the strip says Not
    // verified — and since 27 Sep 2026 Subscribe IS offered beside it, because
    // paying comes first and the badge is what puts it on Discover.
    const verifyStrip = owner.getByTestId("studio-verification");
    await expect(verifyStrip).toHaveAttribute("aria-label", "Studio verification: Not verified");
    /* ⚠⚠ AND SUBSCRIBE **IS** OFFERED, BEFORE THE BADGE (27 Sep 2026). This
       asserted `toHaveCount(0)` and was right until the user chose "pay at
       creation, verify after": `20260927100000` took `subscribe`'s badge
       refusal out, so a strip that still hid the button would be the screen
       refusing what the database allows. What verification decides is DISCOVER,
       and that is asserted where it belongs — the studio is still not listed
       after the badge lands, further down, and `guard_business_visibility` is
       proven by `rls-proof-studio-verification` check 7.
       Asked on /subscription, which is where a studio's subscription lives
       since 20 Sep 2026; reading it off the hub, as this line used to, could
       only ever pass because the strip has never been there. */
    await owner.goto("/subscription");
    await expect(owner.getByTestId("studio-subscription").filter({ hasText: studioName })).toBeVisible();
    await expect(owner.getByTestId("studio-subscription").filter({ hasText: studioName }).getByRole("button", { name: /^Subscribe/ })).toBeVisible();
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

    /* ⚠⚠ AND WHERE IT STANDS IS IN THE STUDIO'S OWN SETTINGS (21 Sep 2026, the
       user: "Studio-Invoices subscription and refunds to be managed from
       settings"). This block asserted the same three on the studio's HOME a few
       hours earlier, at the same user's word; it asserts the move at BOTH ends,
       because a check that only looks at the new place cannot tell you the old
       one was cleared — and this pair has now been in three places, so a check
       that does not clear behind itself is how a fourth copy appears.
       ⚠ THE SHEET IS THE CHROME'S, which is the whole reason it can be a
       studio's at all: it was rendered by the person's own profile page, so the
       only profile it could ever be about was theirs. Asserted while the request
       is UNDER REVIEW — the state with nothing to fill in, and so the one most
       likely to be drawn empty. */
    await owner.goto(`/business/${studioId}`);
    await expect(owner.getByTestId("studio-verification")).toHaveCount(0);
    await expect(owner.getByTestId("studio-subscription")).toHaveCount(0);
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    const studioSettings = owner.getByRole("dialog", { name: "Settings" });
    await expect(studioSettings).toBeVisible();
    await expect(studioSettings).toContainText("THIS STUDIO");
    /* it says WHOSE settings these are, because it is no longer always yours */
    await expect(studioSettings).toContainText(studioName);
    /* the studio's tiles — ⚠ NO Subscription and NO Edit tile since 26 Sep 2026
       (the user: "subscriptions also become an option on home tab for all
       profiles and is removed from settings for all … edit profile to be
       removed from all profiles settings"): both are the studio's own home's */
    for (const tile of ["Verification", "Invoices", "Refunds", "Payments"]) {
      await expect(studioSettings.getByText(tile, { exact: true })).toBeVisible();
    }
    /* ⚠ AND ENQUIRY TYPES IS NOT HERE ANY MORE (27 Sep 2026, the user:
       "enquiries should be removed from settings") — it is the contact ⊕ on the
       studio's own home, beside the switch that draws the Enquiry button. Both
       halves are asserted, because a check that only looks at the new place
       cannot tell you the old one was cleared. */
    await expect(studioSettings.getByText("Enquiry types", { exact: true })).toHaveCount(0);
    await expect(studioSettings.getByText("Subscription", { exact: true })).toHaveCount(0);
    await expect(studioSettings.getByRole("link", { name: "Edit studio", exact: true })).toHaveCount(0);
    /* ⚠ and NOT the account's own plan switch — a sheet that mixes the two is
       the "which profile am I changing?" bug this ask exists to end */
    await expect(studioSettings.getByText("Artist tools", { exact: true })).toHaveCount(0);
    await owner.keyboard.press("Escape").catch(() => {});
    /* the one tile that is a FORM has a page, and it carries the real form */
    await owner.goto(`/business/${studioId}/verification`);
    await expect(owner.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Under review");

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
    /* ⚠ THIS SENTENCE IS THE DATABASE'S, NOT THE PAGE'S, and I broke this
       assertion for one run by assuming otherwise (27 Sep 2026). The
       explanations that came off the Subscription page were the app's own
       paragraphs; THIS is `why_not_public`'s return value — the one sentence
       between a studio and Discover, raised by the RPC and printed where the
       Subscribe button is. A refusal in the database's own words is not an
       explanation to be tidied away. */
    await expect(studioStrip).toContainText("Each studio has its own subscription");
    await expect(studioStrip.getByRole("button", { name: /^Subscribe · ₹1,200\/mo$/ })).toBeVisible();
    /* ⚠⚠ AND THE STUDIO'S OWN HOME CARRIES NEITHER STRIP — the third and final
       reading of one question (21 Sep 2026). This assertion has now said
       `toHaveCount(0)` (20 Sep, C31), then `toContainText("NOT LIVE")` (21 Sep,
       C51, a few hours ago), and says count-0 again on the same user's later
       word: the standing is in the studio's own Settings, which is the first
       home for it that is per-profile. ⚠ It is asserted HERE as well as at the
       block above because this is the point in the story where the badge is on
       and the mandate is not — the exact state a strip would be drawn for. */
    await owner.goto(`/business/${studioId}`);
    await expect(owner.getByTestId("studio-subscription")).toHaveCount(0);
    await expect(owner.getByTestId("studio-verification")).toHaveCount(0);
    /* and Settings, opened from the STUDIO, is where it went — badged verified
       now, which is the state the tile's own badge reads */
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    const afterBadge = owner.getByRole("dialog", { name: "Settings" });
    await expect(afterBadge.getByText("Verification", { exact: true })).toBeVisible();
    await expect(afterBadge).toContainText("verified");
    await owner.keyboard.press("Escape").catch(() => {});
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
    // the Accounts desk counts it for the owner (the chip appears with the first studio)
    await admin.goto(`/admin/accounts?q=${encodeURIComponent(ownerEmail)}`);
    await expect(admin.getByTestId("admin-account").filter({ hasText: ownerEmail })).toContainText("1/1 STUDIOS SUBSCRIBED");
    // Home: NO card (11 Sep 2026 — the user: "after verification I don't need
    // this box; the user will create the studio and to make it discoverable he
    // will subscribe"). The hub's PUBLIC · GRANTED row above is the studio's own state.
    await owner.goto("/");
    await expect(owner.getByRole("status", { name: /^Verification:/ })).toHaveCount(0);

    // an admin is ADMIN ONLY (9 Sep 2026): no profile, no Home — the panel is
    // its whole app, and the chrome draws it no tab bar, only a way out
    await admin.goto("/");
    await expect(admin).toHaveURL(/\/admin(\/verifications)?$/);
    await expect(admin.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(admin.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    // and the owner's own PROFILE names the studio under the seats they hold
    // (26 Sep 2026: the owner is a person, so their profile is `/person/{id}` —
    // C40; the organization-only "Your studios" group went with the login).
    // ⚠ THE GROUP IS "Studios" SINCE 27 Sep 2026 — Teach, Assist and Manage
    // collapsed into one, at the user's own word, with the title on each row
    // instead of over it, because a studio was appearing up to three times.
    // A person's page carries the Followers figure like everybody's — none yet
    await owner.goto(`/person/${ownerId}`);
    await expect(owner.getByText("Studios", { exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: new RegExp(`Open ${studioName}`) }).first()).toBeVisible();
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
    businessId = owner.url().match(/\/business\/([0-9a-f-]+)$/)?.[1] ?? null;
    await expect(owner.getByRole("heading", { name: studioName, exact: true })).toBeVisible();
    await expect(owner.getByText("Studio Tools")).toBeVisible();
    /* ⚠ ONE EMPTY-DAY CARD FOR EVERY KIND OF HOME (21 Sep 2026, the user: "when
       todays schedule blank just shouw card with Heading Nothing On Today's
       Schedule, no bottons below"). It used to say three different sentences —
       "Nothing in your rooms today" on a studio's, "Nothing on today" on a
       person's and an organization's — over a row of pills. One heading now,
       and the absence of the pills is asserted too, because a card that merely
       stopped rendering them would read the same as one that kept them. */
    await expect(owner.getByText("Nothing On Today’s Schedule")).toBeVisible();
    await expect(owner.getByRole("link", { name: "See everything you manage" })).toHaveCount(0);
    /* ⚠ THE PICTURES MOVED OFF THE PENCIL (20 Sep 2026, the user: "edit profile
       for studio not consistent with how its done for Artist and users. for
       social media links, photos etc."). A studio's two pictures are changed
       from the studio's OWN HOME now — the ⊕ on the disc and the ⊕ on the
       posters rail, exactly where a person's have been since 19 Sep — and the
       Edit sheet holds only words. The rails themselves still offer no picker. */
    await expect(owner.getByLabel("Add a photo")).toHaveCount(0);
    await expect(owner.getByLabel("Add photos of your space")).toHaveCount(0);
    /* ⚠ AND NOTHING IS EDITABLE UNTIL THE PENCIL IS PRESSED (26 Sep 2026, the
       user: "clicking on the edit pencil button from top right on every profile
       should open the option to edit everything from the home tab thats when
       the button to edits need to appear"). Both states, because a ⊕ that is
       always there is exactly what was asked to go. */
    await expect(owner.getByRole("button", { name: "Change profile picture" })).toHaveCount(0);
    await expect(owner.getByRole("button", { name: "Edit contact buttons" })).toHaveCount(0);
    await enterEditMode(owner);
    await expect(owner.getByRole("button", { name: "Change profile picture" })).toBeVisible();
    await expect(owner.getByRole("button", { name: "Edit contact buttons" })).toBeVisible();
    /* the words a form still holds are the Edit details chip, which lands on the
       sheet's ADDRESS (`?edit=1`, 22 Sep 2026); no "Edit studio" button anywhere */
    await expect(owner.getByRole("button", { name: "Edit studio", exact: true })).toHaveCount(0);
    await owner.getByRole("link", { name: "Edit details" }).click();
    await expect(owner).toHaveURL(/edit=1/);
    const studioSheet = owner.getByRole("dialog", { name: "Edit business" });
    await expect(studioSheet.getByText("Update profile", { exact: true })).toHaveCount(0);
    await expect(studioSheet.getByText("Update header", { exact: true })).toHaveCount(0);
    await expect(studioSheet.getByText("Links", { exact: true })).toHaveCount(0);
    // and the address does not move because somebody scrolled past the map
    await expect(studioSheet.getByRole("button", { name: "Change address" })).toBeVisible();
    await expect(studioSheet.getByRole("searchbox", { name: /Search an address/ })).toHaveCount(0);
    await studioSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(studioSheet).toHaveCount(0);
    // ⚠ AND CANCEL MEANS CANCEL (16 Sep 2026, carried through the move). A
    // staged picture is held in the browser and nothing is uploaded until Save,
    // so dismissing the sheet must leave the record exactly as it was. The
    // reported bug was the opposite: a pressed ✕ destroyed the file outright
    // and Cancel had nothing to undo.
    const proofRows = async () =>
      ((await (
        await fetch(`${supabaseUrl}/rest/v1/studio_photos?business_id=eq.${businessId}&deleted_at=is.null&select=id`, { headers: adminHeaders })
      ).json()) as unknown[]).length;
    // this studio showed DanceOS five photos to be verified, and they ARE its header
    const before = await proofRows();
    expect(before).toBe(5);
    /* the sheet's Cancel went back a history entry, so the home is fresh and read-only again */
    await enterEditMode(owner);
    await owner.getByRole("button", { name: "Edit posters" }).click();
    const postersSheet = owner.getByRole("dialog", { name: "Posters", exact: true });
    await expect(postersSheet).toBeVisible();
    // stage one more, and stage a removal of one that exists
    await postersSheet.getByLabel("Add photos of your space").setInputFiles(ONE_PX_PNG);
    await confirmCrop(owner);
    await expect(postersSheet.getByLabel(`Remove photo ${before + 1}`)).toBeAttached({ timeout: 20_000 });
    await postersSheet.getByLabel("Remove photo 1").click();
    await expect(postersSheet.getByLabel("Undo removing photo 1")).toBeAttached();
    expect(await proofRows(), "a pressed ✕ has not touched the database").toBe(before);
    await postersSheet.getByRole("button", { name: "Cancel" }).click();
    expect(await proofRows(), "and Cancel left every picture exactly where it was").toBe(before);
    await owner.getByRole("link", { name: "Classes", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);

    // ---- the room came with the studio; give it an amenity (Step 11) ------
    // 18 Sep 2026: the register's chip rail is gone (the user: "the row below the
    // classes heading … should be removed") — every door it held is a tile on the
    // studio's own home, which is where this goes now.
    await owner.goto(`/business/${businessId}`);
    await owner.getByRole("link", { name: "Rooms", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/rooms$/);
    /* amenities live with the room and show up on the public class page.
       ⚠ A ROOM IS EDITED ONLY THROUGH ITS FORM since 4 Oct 2026 (the user: "edit
       only from editing form now not outside") — the card shows it, Edit opens
       the same sheet the room was added with, and nothing is written until Save */
    await owner.getByRole("link", { name: "Edit Studio A" }).click();
    const editRoom = owner.getByRole("dialog", { name: "Edit room" });
    await expect(editRoom).toBeVisible({ timeout: 15_000 });
    await editRoom.getByRole("button", { name: "🪞 Mirrors", exact: true }).click();
    await editRoom.getByRole("button", { name: "Save room" }).click();
    await owner.getByRole("button", { name: "Save it" }).click();
    await expect(editRoom).toBeHidden({ timeout: 15_000 });
    const roomA = owner.getByTestId("room-card").filter({ hasText: "Studio A" });
    await expect(roomA.getByTestId("room-amenities")).toContainText("🪞 Mirrors", { timeout: 15_000 });
    // ⚠ and the card carries no inline control any more
    await expect(owner.getByLabel("Studio A name")).toHaveCount(0);
    await expect(owner.getByRole("button", { name: "Amenities in Studio A" })).toHaveCount(0);

    /* ⚠ ADDING A ROOM IS A FORM NOW (22 Sep 2026, the user: "form for adding
       asset and adding room should be same way"). Until today the ＋ CREATED the
       room on the press — named "Room N" after a counter, holding twenty people
       nobody had chosen — and left you to correct both on the row. Capacity is
       the one field on this desk the database enforces on every booking, so it
       is asked for; the old defaults are prefilled, so the same answer is still
       one press. ⚠ The room is removed again at the end, because the rest of
       this serial story is written against a studio with exactly one. */
    await owner.getByRole("link", { name: "Add room" }).click();
    const addRoom = owner.getByRole("dialog", { name: "Add room" });
    await expect(addRoom).toBeVisible({ timeout: 15_000 });
    await expect(owner).toHaveURL(/\/rooms\?new=1$/);
    // the defaults are the ones the press used to apply silently
    await expect(addRoom.getByLabel("Room name")).toHaveValue("Room 2");
    await expect(addRoom.getByLabel("How many it holds")).toHaveValue("20");
    await addRoom.getByLabel("Room name").fill("Studio B");
    await addRoom.getByLabel("How many it holds").fill("12");
    /* ⚠ and the amenities are asked for in the add form too (4 Oct 2026) */
    await addRoom.getByRole("button", { name: "❄️ AC", exact: true }).click();
    await addRoom.getByRole("button", { name: "Add room" }).click();
    await owner.getByRole("button", { name: "Add it" }).click();
    await expect(addRoom).toBeHidden({ timeout: 15_000 });
    const roomB = owner.getByTestId("room-card").filter({ hasText: "Studio B" });
    await expect(roomB.getByTestId("room-capacity")).toHaveText("12", { timeout: 15_000 });
    await expect(roomB.getByTestId("room-amenities")).toContainText("❄️ AC");
    await owner.getByRole("button", { name: "Remove Studio B" }).click();
    await expect(owner.getByTestId("room-card").filter({ hasText: "Studio B" })).toHaveCount(0, { timeout: 15_000 });

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
    await onboard(trainer, trainerName, "Pune");

    await owner.goto(`/business/${businessId}/staff`);
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
    await owner.goto(`/business/${businessId}/classes`);
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
    // ⚠ "SEND REQUEST", NOT "SAVE & ASK" (28 Sep 2026, the user's own word). The
    // old label named the two things the press does in the order the CODE does
    // them; what the person pressing it is doing is asking somebody. The confirm
    // sheet moved with it — a save that asks nobody still says "Save as draft?".
    await owner.getByRole("button", { name: "Send request" }).click();
    await owner.getByRole("dialog", { name: "Send this request?" }).getByRole("button", { name: "Send request" }).click();

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
    // the Inbox opens on Requests — what somebody wants you FOR, which a class
    // ask is (S_chats; the desks are Requests · Invites · Done since 27 Sep 2026,
    // "All" is gone and Enquiries is a desk of its own, behind a Tools tile)
    await pressPill(trainer, /^Requests — \d+ waiting/);
    // ⚠ ACCEPT, not Confirm (27 Sep 2026, the user: "class and event requests
    // should have same cards with accept and reject buttons") — a class ask is
    // an ASK, and the invitations to join are a second section with Join/Decline
    await trainer.getByRole("button", { name: `Accept ${classTitle}` }).click();
    await expect(trainer.getByText(/Accepted · you are the artist taking it/)).toBeVisible({ timeout: 15_000 });
    // now the owner publishes from the register — the door the form no longer is
    await owner.goto(`/business/${businessId}/classes`);
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
    await owner.goto(`/business/${businessId}`);
    await owner.getByRole("link", { name: "Calendar", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/calendar$/);
    await expect(owner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
    await owner.getByRole("button", { name: "Month", exact: true }).click();
    await expect(owner.getByText("nothing on")).toBeVisible();
    await owner.getByRole("button", { name: "Day", exact: true }).click();
    await expect(owner.getByText("8 am")).toBeVisible();
    await owner.goto(`/business/${businessId}/classes`);

    // ---- the earnings desk reads that same ledger (Step 13) ---------------
    // Owner-only, and it is the pay side of the prototype's S_earn — not a
    // payroll desk: the studio settles by bank or UPI and records it here.
    await owner.goto(`/business/${businessId}`);
    await owner.getByRole("link", { name: "Earnings", exact: true }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/earnings$/);
    await expect(owner.getByText(/DanceOS does not move this money/)).toBeVisible();
    // 18 Sep 2026: the trainer is ON the ledger from here, because accepting the
    // class is what let it be published at all — and nothing is owed yet, because
    // the session is three days out. (Until today the ask was still unanswered at
    // this point and the desk read "Nobody has taught a session yet".)
    await expect(owner.getByText(trainerName).first()).toBeVisible();
    await expect(owner.getByText("₹0", { exact: true }).first()).toBeVisible();

    /* ---- the income half of the same screen (Step 13b part 2b) --------------
       ⚠ RE-CUT 21 Sep 2026 (the user: "lets fix earnings for all profile
       types"). This asked for `GROSS · SEPTEMBER`, a card that labelled a MONTH
       and whose period chips governed only the income half of the page — picking
       a past month unmounted the whole expense side. The shared `EarningsScreen`
       says the same money as REVENUE, of the period in the URL, with EXPENSES
       beside it and the net between them, which no money screen here had ever
       printed. So the classPerson asserted is the one underneath: a new studio has
       taken nothing, so revenue, expenses and what is left are all ₹0, and the
       four filters are there to choose a window with. */
    await expect(owner.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
    await expect(owner.getByTestId("earn-revenue")).toHaveText("₹0");
    await expect(owner.getByTestId("earn-expenses")).toHaveText("₹0");
    await expect(owner.getByTestId("earn-left")).toHaveText("₹0");
    for (const p of ["Day", "Week", "Month", "Year"]) {
      await expect(owner.getByRole("link", { name: p, exact: true })).toBeVisible();
    }
    // HOW STUDENTS PAID stays: the method split is a fact nothing else carries
    await expect(owner.getByText("HOW STUDENTS PAID")).toBeVisible();
    await expect(owner.getByText(/No payments yet this month/)).toBeVisible();
    /* and the month chips keep their own job — opening a past month's STATEMENT,
       with its deductions and its CSV, honestly empty for a new studio */
    await owner.getByRole("button", { name: lastMonthName(), exact: true }).click();
    await expect(owner.getByText("WHERE IT CAME FROM")).toBeVisible();
    await expect(owner.getByText("DEDUCTIONS")).toBeVisible();
    await expect(owner.getByText("Net settled")).toBeVisible();
    await expect(owner.getByText(/₹0 net · 0 payments/).first()).toBeVisible();
    await owner.getByRole("button", { name: "This month", exact: true }).click();
    await expect(owner.getByText("HOW STUDENTS PAID")).toBeVisible();

    /* the teaching side, for the person who was asked — the SAME screen a studio
       and an organization now get, with the four filters and the graph, and with
       no Expenses block at all: a person employs nobody, so what is left IS what
       came in, and the screen says that rather than drawing an empty half. */
    await trainer.goto("/earnings");
    await expect(trainer.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
    await expect(trainer.getByTestId("earn-revenue")).toHaveText("₹0");
    await expect(trainer.getByTestId("earn-expenses")).toHaveCount(0);
    /* ⚠ WHAT IS LEFT IS THE FIGURE, NOT A SENTENCE (27 Sep 2026, the user:
       "remove unessesary explanations from earnings … there should be no extra
       details for everything in the app unless things are very important").
       This asserted the paragraph under WHAT IS LEFT — "DanceOS records it, it
       does not move the money" — which is now said in the code and not on the
       screen. BOTH ENDS, because a check that only looks at the new place
       cannot tell you the old one was cleared. */
    await expect(trainer.getByTestId("earn-left")).toHaveText("₹0");
    await expect(trainer.getByText(/DanceOS records it, it does not move the money/)).toHaveCount(0);
  });

  test("the class page, its share link, and a learner booking from it", async () => {
    // ---- the class detail page + its booking link (Step 8) ----------------
    await owner.goto(`/business/${businessId}/classes`);
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
    /* ⚠ `exact` (28 Sep 2026): a bare string here is a case-insensitive
       SUBSTRING match, and the class page gained the artist's powers switch the
       same day — "{name} holds Attendance" — so this matched the TAB and the
       SWITCH and Playwright refused with a strict-mode violation. The product
       was right; the locator was loose. This repo's fourth time. */
    await owner.getByRole("button", { name: "Attendance", exact: true }).click();
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

    /* ⚠⚠ THE POSTER OPENS THE POSTER, AND SHARING IS A BLOCK IN THE DETAILS
       (29 Sep 2026, the user: "when clicking on the poster right now we get
       poster and a qr code for the class which should not happen — should just
       open poster in that. share should be part of the details with qr code
       with link and option to copy the link as well"). From 24 Aug the poster
       opened a TICKET carrying the art, the booking link and an entry code —
       "one place instead of three" (prototype 12001) — which is why the obvious
       act, look at the poster, was the one thing it did not do. Both ends. */
    await owner.getByRole("button", { name: "Open the poster" }).click();
    const posterView = owner.getByRole("dialog", { name: `Poster for ${classTitle}` });
    await expect(posterView).toBeVisible();
    await expect(posterView.getByRole("img", { name: /^(Booking link|Entry code)/ })).toHaveCount(0);
    await posterView.getByRole("button", { name: "Done" }).click();
    await expect(posterView).toHaveCount(0);

    /* the SHARE block: the code somebody points a camera at, the address in
       words, and one press to copy. ⚠ The square is asserted SCANNABLE — a
       `/c/{slug}` link is a version-3 or -4 code, so under ~125px `QRBlock`
       marks itself "small" and the one thing this block exists for is somebody
       holding a camera up to it. */
    /* ⚠ `exact` (3 Oct 2026): the block's own Share button reads "Share", and a
       bare string is a case-insensitive SUBSTRING match — the heading and the
       button both matched */
    await expect(owner.getByText("SHARE", { exact: true })).toBeVisible();
    const shareQr = owner.getByRole("img", { name: `Booking link for ${classTitle}` });
    await expect(shareQr).toBeVisible();
    await expect(shareQr).toHaveAttribute("data-qr-scannable", "yes");
    await expect(owner.getByText(new RegExp(`/c/${shareSlug}$`))).toBeVisible();
    await owner.getByRole("button", { name: "Copy the booking link" }).click();
    await expect(owner.getByText("Copied ✓")).toBeVisible();
    /* and SHARE beside it (3 Oct 2026) — the phone's own sheet; not pressed here,
       because a headless browser either has no sheet or opens one nobody closes */
    await expect(owner.getByRole("button", { name: "Share the booking link" })).toBeVisible();

    // ---- learner: signup → onboard → open the shared link → book ----------
    learnerId = await signUp(learner, `e2e-learner-${stamp}@example.com`);
    await onboard(learner, learnerName, "Pune");

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
    /* ⚠ FIFTEEN, NOT FIVE (28 Sep 2026). Confirming writes the seat through an
       RPC and the page re-renders on the SERVER, so this is a round trip after a
       mutation — the one shape in this suite that outruns the default five
       seconds on a busy machine, and it has cost a run on 27 Sep and twice on
       28 Sep. It was never a wrong value: the seat is booked and the words are
       simply late. The same fifteen the style chip and "Since 2016" already
       carry, for the same reason. */
    await expect(learner.getByText(/You.re booked/)).toBeVisible({ timeout: 15000 });
    /* ⚠ "Tap the poster above for your code" until 29 Sep 2026, when the poster
       stopped being a ticket. What gets somebody through a door is their OWN
       profile code, which the register's scanner reads. */
    await expect(learner.getByText("Your own profile QR is what gets you in — it is on your profile.")).toBeVisible();
    // and the owner's register now reads the seat's meta: a free seat
    await owner.reload();
    await owner.getByRole("button", { name: "Attendance", exact: true }).click();
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

    /* ⚠ THE CALENDAR DRAWS PILLS (28 Sep 2026, the user: "calendar should only
       have pills with infor instead of cards"). The accessible name is the SAME
       `Open {class}` the card carries on the public schedule — one control name
       for one act — so what separates them is the shape, and that is what this
       asserts. The other end of it is in the follows segment below, where the
       same class on `/…/schedule` must still be a CARD. */
    const calPill = learner.getByTestId("cal-pill").first();
    await expect(calPill).toBeVisible();
    const pillShape = await calPill.evaluate((el) => ({
      radius: getComputedStyle(el).borderTopLeftRadius,
      h: Math.round(el.getBoundingClientRect().height),
    }));
    expect(pillShape.radius).toBe("999px");
    expect(pillShape.h).toBeLessThan(60);

    /* ⚠⚠ AND "TODAY" IS SAID ONCE, AND IS NOT BLUE (28 Sep 2026, the user:
       "should not repeat today teice it appears in blue which it should not on
       all profile schedules and calendar").
       The controls row carried a `TODAY` badge whenever the day you were on WAS
       today — which it is on first load — immediately beside the `Today` button,
       so one line said the word twice. Counting the LEAF elements whose whole
       text is the word is what catches that: it read 2 before and reads 1 now.
       And `SKY` is `#5AC8FA` — rgb(90, 200, 250) — which is what "blue" meant. */
    const todayWords = await learner.evaluate(() =>
      [...document.querySelectorAll("span,div,b")].filter((el) => el.children.length === 0 && /^today$/i.test((el.textContent || "").trim())).length
    );
    expect(todayWords).toBe(1);
    const blueToday = await learner.evaluate(() =>
      [...document.querySelectorAll("span,div,b")]
        .filter((el) => el.children.length === 0 && /^today$/i.test((el.textContent || "").trim()))
        .map((el) => getComputedStyle(el).color)
        .filter((c) => c.replace(/\s/g, "") === "rgb(90,200,250)").length
    );
    expect(blueToday).toBe(0);
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
    /* ⚠ AND HERE IT IS STILL A CARD — the other end of the pill check in the
       bookings segment, and the user's own narrowing of it in the same breath:
       "pills should only be in calendar not on schedule on profiles visible
       through discover", "or any public profile page". This IS that surface:
       `PublicSchedulePage` is the only caller passing `mode="public"` and it is
       what every public profile's Schedule button opens. A stranger deciding
       whether to come needs the price, the seats and the teacher — which is what
       a card carries and a pill does not. */
    await expect(learner.getByTestId("cal-pill")).toHaveCount(0);
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
    /* ⚠ THE SHORTER FORM (2 Oct 2026, the user: "shorter forms for every kind of
       enquiry"): a type's choices are one-tap chips in a labelled group, not
       dropdowns; Level and Where-they-train are gone; Where is one optional
       line, and the message is optional too. */
    await enqSheet.getByRole("group", { name: "Session format" }).getByRole("button", { name: "One-on-one" }).click();
    await enqSheet.getByRole("group", { name: "Dance style" }).getByRole("button", { name: "Bollywood", exact: true }).click();
    await enqSheet.getByLabel("Where", { exact: true }).fill("Pune");
    await enqSheet.getByLabel("Message").fill("Eight evening sessions before a wedding.");
    await enqSheet.getByRole("button", { name: "Send enquiry" }).click();
    await expect(enqSheet.getByText("Enquiry sent")).toBeVisible();
    await enqSheet.getByRole("button", { name: "Done" }).click();

    /* ⚠ ENQUIRIES IS ITS OWN DESK SINCE 27 Sep 2026 (the user: "only enquiry
       becomes a new option in tab and is removed from inbox") — the Inbox keeps
       what somebody has asked OF you; this is somebody wanting to BOOK you. It
       was the bar's fourth TAB for a few hours that morning and is a TOOL TILE
       by the evening ("enquiries should not be on navbar a tab in tools for
       all"); `shoot-tiles` presses the tile on all four grids, so what this
       segment drives is the desk behind it. */
    /* ⚠⚠ RE-CUT 2 Oct 2026 (the user: "all items on home tab should be for that
       specific profile"): unscoped, the desk is YOUR PROFILE's, so an enquiry to
       the STUDIO is on the studio's own desk — `?as={studio}`, the address its
       tile opens — and NOT on the owner's personal one. Both ends asserted. */
    /* ⚠⚠ RE-CUT AGAIN 2 Oct 2026 (the user: "shift back enquiries to inbox from
       home tools for all profiles"): the desk is each profile's INBOX, and the old
       addresses redirect onto it — the person's own `/inbox`, the studio's
       `/business/{id}/inbox`, both opened on the Enquiries section. */
    await owner.goto("/enquiries");
    await owner.waitForURL(/\/inbox\?show=enquiries$/);
    await expect(owner.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` })).toHaveCount(0);
    await owner.goto(`/enquiries?as=${businessId}`);
    await owner.waitForURL(new RegExp(`/business/${businessId}/inbox\\?show=enquiries$`));
    await expect(owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` })).toBeVisible({ timeout: 15_000 });
    await owner.goto("/inbox?show=enquiries");
    /* ⚠⚠ AND THE SETTINGS ARE ON IT (the user: "with its setting as well manged
       from there") — the kinds left the contact ⊕ for the desk the same evening.
       Closed, the disclosure states the standing without opening anything; the
       studio takes every kind its type allows, which is what a null column
       MEANS rather than what it holds. */
    /* ⚠⚠ AND UNSCOPED THEY ARE YOUR OWN PROFILE'S, NOT YOUR STUDIOS' (27 Sep
       2026, the user: *"user and artist should see settings for only their
       profiles not for other profiles created by them in their enquiries
       section"*). This line asserted the disclosure on the UNSCOPED desk and is
       the decision that changed: a person's own Enquiries tile carries no
       `?as=`, and it used to hand back a settings block for every business they
       owned — so somebody who had opened two studios and an organization pressed
       their own tile and got four of them, three about businesses with tiles and
       desks of their own.
       ⚠ BOTH ENDS ARE ASSERTED, because a check that only looks at the new place
       cannot tell you the old one was cleared: gone from the unscoped desk, and
       present on the studio's own — which is the address its tile opens. */
    await expect(owner.getByRole("button", { name: /^Enquiry settings/ })).toHaveCount(0);
    await owner.goto(`/business/${businessId}/inbox?show=enquiries`);
    await expect(owner.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    /* ⚠ the count is the TYPE's, not a constant: a studio is offered four kinds
       (judging is a person's job), an artist page five, an organization three —
       so the assertion is that a real count is stated rather than which one. */
    await expect(owner.getByRole("button", { name: /^Enquiry settings/ }).first()).toBeVisible();
    /* ⚠ the count is INSIDE the settings since 3 Oct 2026 (the user: "settings
       for enquiry requests and invites should not have the second heading") —
       the closed card is its title alone, so the count is read once it is open */
    await owner.getByRole("button", { name: /^Enquiry settings/ }).first().click();
    await expect(owner.getByText(/^\d+ of \d+ kinds$/).first()).toBeVisible();
    await owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(owner.getByText("WHAT THEY ASKED FOR")).toBeVisible();
    /* ⚠⚠ RE-CUT 3 Oct 2026 — the user's own process, agreed point by point
       (`20261003140000`): the business ACCEPTS the enquiry before it prices it; a
       quote is lines or one total with an advance and a valid-until; the sender
       accepts it whole or asks for a revision WITH A REASON; the project is then
       on, paid online or recorded by hand; once money has moved, ending it is
       terms the other side answers; and completing it takes both ends. */
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("New");
    await owner.getByRole("button", { name: "Accept enquiry" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Accepted", { timeout: 15_000 });
    await owner.getByRole("button", { name: "Send a quote" }).click();
    await owner.getByRole("button", { name: "One total", exact: true }).click();
    await owner.getByLabel("Project total").fill("5000");
    await owner.getByRole("button", { name: "Send quote", exact: true }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Quoted", { timeout: 15_000 });

    await learner.goto("/enquiries");
    await learner.getByRole("button", { name: "Sent enquiries" }).click();
    await learner.getByRole("link", { name: `Private Sessions enquiry to ${studioName}` }).click();
    await learner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(learner.getByTestId("quote-1-state")).toHaveText("Waiting on an answer");
    /* a revision needs a reason — the sheet will not send without one */
    await learner.getByRole("button", { name: "Ask to revise" }).click();
    await learner.getByTestId("ask-revise").getByRole("button", { name: "Ask for a revision" }).click();
    await expect(learner.getByTestId("ask-revise").getByRole("alert")).toContainText("Say why");
    await learner.getByTestId("ask-revise").getByLabel("Reason").fill("Could it be four thousand?");
    await learner.getByTestId("ask-revise").getByRole("button", { name: "Ask for a revision" }).click();
    await expect(learner.getByTestId("revision-asked")).toBeVisible({ timeout: 15_000 });
    await expect(learner.getByTestId("revision-asked")).toContainText("Could it be four thousand?");
    await expect(learner.getByTestId("quote-1-state")).toHaveText("Revision asked");

    await owner.reload();
    await expect(owner.getByTestId("revision-asked")).toContainText("Could it be four thousand?");
    await owner.getByRole("button", { name: "Revise the quote" }).click();
    /* the composer starts from the price it revises */
    await expect(owner.getByLabel("Project total")).toHaveValue("5000");
    await owner.getByLabel("Project total").fill("4000");
    await owner.getByRole("button", { name: "Send the revised quote" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Quoted", { timeout: 15_000 });

    await learner.reload();
    await expect(learner.getByTestId("quote-2-state")).toHaveText("Waiting on an answer");
    await learner.getByRole("button", { name: "Accept this quote" }).click();
    await expect(learner.getByTestId("enquiry-stage")).toHaveText("Ongoing", { timeout: 15_000 });
    /* the payment goes through the rail: the button names what is owed, priced by
       the quote (30% of ₹4,000). The Cashfree window itself is not driven. */
    await expect(learner.getByTestId("enquiry-pay").first()).toHaveText("Pay ₹1,200");
    await expect(learner.getByTestId("project-total")).toHaveText("₹4,000");

    await owner.reload();
    await owner.getByTestId("dues").getByRole("button", { name: "Record received" }).first().click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Advance paid", { timeout: 15_000 });

    /* money has moved, so withdrawing is TERMS the business answers, not an exit */
    await learner.reload();
    await expect(learner.getByText(/has been paid — propose how much goes back/)).toBeVisible();

    /* completion waits for the balance — the button is offered, and off */
    await expect(owner.getByRole("button", { name: "Mark the project complete" })).toBeDisabled();
    await owner.getByTestId("dues").getByRole("button", { name: "Record received" }).first().click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Paid", { timeout: 15_000 });
    await owner.getByRole("button", { name: "Mark the project complete" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Completing", { timeout: 15_000 });
    await expect(owner.getByTestId("completion-waiting")).toBeVisible();

    await learner.reload();
    await expect(learner.getByTestId("completion-asked")).toBeVisible();
    await learner.getByRole("button", { name: "Confirm complete" }).click();
    await expect(learner.getByTestId("enquiry-stage")).toHaveText("Completed", { timeout: 15_000 });
    await expect(learner.getByTestId("enquiry-closed-by")).toContainText("by you");

    await owner.reload();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Completed");
    await expect(owner.getByTestId("enquiry-closed-by")).toContainText(learnerName);
  });

  /* ⚠⚠ THE EVENTS TEST WAS HERE AND IS GONE (29 Sep 2026). It was Step 21's
     whole story in one segment and it is worth naming, because nothing else
     in this suite covered any of it: a studio's register and its own home
     each offering NO Events door (an event was the organization's, R15); the
     organization's events desk; Create event opening a sheet at `?new=1` over
     that desk with `/business/{id}/events/new` still a page of its own; the
     two-step form; Publish event behind its confirm sheet; the learner finding
     the showcase on Discover's Events tab and opening its page; a free seat
     booked through the confirm sheet and the payment step; the ticket held
     under `/my-events?show=spectator` and ABSENT under participants; and the
     organiser's manager checking that spectator in at the door.
     The four tests after it kept their own subjects; what they lost to events
     is marked where it was. */

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
    /* ⚠ "created", not "lead" (29 Sep 2026). The hub is two columns now — the
       crews you created, and the ones you are a part of — so the empty state of
       the first column is about creating one, which is also what the button
       under it does. */
    await expect(learner.getByText("You have not created a crew yet.")).toBeVisible();
    /* ⚠ "Create crew", not "＋ Create crew" (20 Sep 2026). The ＋ moved to the top
       of the desk as the shared `DeskAddButton`, where the glyph is an
       `aria-hidden` icon and the LABEL is the words — which is what a screen
       reader should say, and a different accessible name from the one the dashed
       row carried. The same slice's Rooms and Team buttons kept theirs, and the
       only way to know which of the three moved was to DIFF the three files
       against HEAD rather than hunt with another 12-minute run. */
    await learner.getByRole("link", { name: "Create crew", exact: true }).click();
    /* ⚠ AND IT OPENS AS A SHEET OVER THE HUB (22 Sep 2026, ask 6) — `?new=1` on
       `/crews` rather than a page away. `/crews/new` is still the page. */
    await learner.waitForURL(/\/crews\?new=1$/);
    await expect(learner.getByRole("dialog", { name: "Create crew" })).toBeVisible();
    /* ⚠ THE FORM WEARS THE ADD CLASS ANATOMY (21 Sep 2026, the user: "Create
       Crew form in crews should look similar to add class page"): a ← heading
       and a fixed bar whose button NAMES the missing answer rather than greying
       out. That last part is the one worth asserting — it is the prototype's own
       rule (15573-15578) and the reason the forms were moved onto one kit.
       ⚠ AND IT IS ONE PAGE NOW (22 Sep 2026, the user: "apart from class and
       event form all forms should be for one page"), so there is no Continue to
       press: members were the second step and are OPTIONAL — "a crew of one is a
       real crew" — so the bar was making somebody walk through a step they could
       skip entirely to reach a button that was already live. */
    await expect(learner.getByRole("heading", { name: "Create crew" })).toBeVisible();
    await expect(learner.getByRole("button", { name: "Name your crew first" })).toBeVisible();
    await learner.getByLabel("Crew name").fill(crewName);
    /* a crew dances a LIST since 2 Oct 2026 — the multi picker's one add control,
       the same name the New-studio sheet's has */
    await pick(learner, "Add a dance style", "Hip-Hop");
    await expect(learner.getByRole("button", { name: "Remove Hip-Hop", exact: true })).toBeVisible();
    /* THE CREW'S OWN NUMBER AND EMAIL, REQUIRED (26 Sep 2026) — the bar names each
       missing answer before it offers Create crew */
    await expect(learner.getByRole("button", { name: "Add the crew's mobile number" })).toBeVisible();
    await learner.getByLabel("Mobile", { exact: true }).fill("+91 90000 33330");
    await expect(learner.getByRole("button", { name: "Add the crew's email" })).toBeVisible();
    await learner.getByLabel("Email", { exact: true }).fill(`crew-${stamp}@example.com`);
    await learner.getByRole("button", { name: "Add a member" }).click();
    await learner.getByLabel("Search DanceOS for a dancer").fill(trainerName);
    await learner.getByRole("button", { name: `Add ${trainerName} to the crew` }).click();
    await expect(learner.getByText("MEMBERS · 1 added")).toBeVisible();
    await learner.getByRole("button", { name: "Create crew", exact: true }).click();
    await learner.getByRole("dialog", { name: "Create this crew?" }).getByRole("button", { name: "Create crew", exact: true }).click();
    /* the crew's home opens under its welcome bow (2 Oct 2026) — `?welcome=crew`,
       closed by Continue, which drops the param */
    await learner.waitForURL(/\/crews\/[0-9a-f-]+\/manage\?welcome=crew$/);
    crewId = learner.url().match(/\/crews\/([0-9a-f-]+)\/manage/)![1];
    const crewBow = learner.getByTestId("welcome-bow");
    await expect(crewBow).toContainText("is ready!", { timeout: 15_000 });
    await crewBow.getByRole("button", { name: "Continue" }).click();
    await learner.waitForURL(/\/crews\/[0-9a-f-]+\/manage$/);
    // the crew's HOME (18 Sep 2026): the hero, the Team and Events tiles, the crew's own bar
    await expect(learner.getByTestId("crew-hero")).toBeVisible();
    await expect(learner.getByRole("navigation", { name: "Crew" }).getByRole("link", { name: "Inbox" })).toBeVisible();
    /* ⚠ AND THE CORNER OPENS **THIS CREW'S** PUBLIC PAGE (21 Sep 2026, the user:
       "studio and crew pages on home tab should have option to view their
       profile pages currently taking to organizations page and user/artist
       page"). It pointed at the Profile tab for a few hours this morning, which
       on a crew's home is the PERSON who leads it — true, and nothing to do with
       the crew. Both ends asserted, so the thing it replaced cannot live on. */
    await expect(learner.getByRole("link", { name: "Public view", exact: true })).toHaveAttribute("href", `/crew/${crewId}`);
    await expect(learner.getByRole("link", { name: "Your profile", exact: true })).toHaveCount(0);
    await learner.getByRole("link", { name: "Team", exact: true }).click();
    await learner.waitForURL(/\/crews\/[0-9a-f-]+\/manage\/team$/);
    // ASKED IS NOT JOINED: the desk says the trainer has not answered, and counts one member
    await expect(learner.getByText("⏳ Waiting on them to confirm")).toBeVisible();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("1");
    /* ⚠ ONE TEAM DESK, THREE KINDS OF PROFILE (21 Sep 2026, the user: "fix Team
       pages for all kinds of profile types"). The crew's was the last one adding
       people its own way: a hand-rolled DASHED control at the FOOT of the roster
       reading "＋ Add member", where a studio's and an organization's are the
       shared solid pill at the TOP reading "Add a team member", opening a sheet.
       Both ends asserted — the shared control, and the absence of the old one —
       because a check that only looks for what was added lets it live on. */
    await expect(learner.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(learner.getByRole("button", { name: "Add member", exact: true })).toHaveCount(0);
    await learner.getByRole("button", { name: "Add a team member" }).click();
    const crewAdd = learner.getByRole("dialog", { name: "Add a team member" });
    await expect(crewAdd).toBeVisible();
    // the app's one people search, with its own clothes on — as on the other two desks
    await expect(crewAdd.getByRole("textbox", { name: "Search DanceOS for a dancer" })).toBeVisible();
    await learner.mouse.click(10, 10); // the scrim closes it
    await expect(crewAdd).toHaveCount(0);

    // the trainer answers from the INVITES desk — only they can
    await trainer.goto("/inbox");
    // ⚠ A DESK OF ITS OWN, NOT A SECTION OF REQUESTS (27 Sep 2026, the user:
    // "different columns for join team requests … other team join, crew join,
    // studio join, organization join for invites should also be different in
    // style and should be card style but segregated in a different section
    // now"). It was a heading inside Requests for one morning; a crew ask is a
    // question about BELONGING and now has its own column and its own card,
    // reading Join / Decline. The class ask this trainer already accepted is on
    // Requests and is not counted here, which is what the split is for.
    await pressPill(trainer, /^Invites — \d+ waiting/);
    await expect(trainer.getByText(`invited by ${learnerName}`)).toBeVisible();
    await trainer.getByRole("button", { name: `Join ${crewName}` }).click();
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
       green run away from a strict-mode violation. The row is the unit here.
       ⚠⚠ AND THE ROW IS ON **DONE** NOW (27 Sep 2026, the user: "sepreate
       section request, invites and enquiries which are already completed").
       Answered rows still exist — the 19 Sep rule is untouched, nothing is
       deleted — they have simply moved off the live desk, which is what stops
       Invites filling with rows that carry no buttons. So the check presses Done
       first; that it is NOT on Invites any more is asserted straight after,
       because a check that only looks at the new place cannot tell you the old
       one was cleared. */
    await expect(trainer.getByRole("button", { name: `Join ${crewName}` })).toHaveCount(0, { timeout: 15_000 });
    /* ⚠ COMPLETED IS A SIDE OF EACH COLUMN since later on 2 Oct 2026 (the user:
       "completed … with received and sent in their respective section") — so
       the answered invitation is under Invites › Completed, not a pill of its own */
    await expect(trainer.getByRole("button", { name: /^Completed — / })).toHaveCount(0);
    await trainer.getByRole("button", { name: "Completed invitations" }).click();
    const crewAsk = trainer.getByTestId("request-row").filter({ hasText: crewName }).filter({ hasText: `invited by ${learnerName}` });
    await expect(crewAsk.getByText("Joined — you said yes")).toBeVisible({ timeout: 15_000 });
    await expect(crewAsk.getByRole("button", { name: `Join ${crewName}` })).toHaveCount(0);
    await expect(crewAsk.getByRole("button", { name: `Decline ${crewName}` })).toHaveCount(0);
    await learner.reload();
    await expect(learner.getByTestId("crew-tile-members")).toHaveText("2");
    /* ⚠ the crew DESK's roster row, not a profile group — "Member" is the word
       `CREW_ROLE_WORD` puts on the row, and the desk is untouched by the 27 Sep
       profile re-cut (I changed this line to "Crew" by mistake and the run said
       so within five minutes) */
    await expect(learner.getByText("Member", { exact: true })).toBeVisible();

    // the public page prints the confirmed roster; the hub knows which list the trainer belongs on
    await trainer.goto(`/crew/${crewId}`);
    /* the Members figure left the page (19 Sep 2026) — the roster IS the count: two rows, each opening a person.
       ⚠ THE ROW IS THE APP'S OWN `Row` SINCE 27 Sep 2026 (the user: "the same
       should reflect in profile pages for all profiles"), so its accessible
       name is `Open {name}` like every other roster row rather than the crew
       page's own `Open {name}'s profile` — and the ROLE is the gold right-hand
       word now instead of being buried in the sub line beside the city. */
    await expect(trainer.locator('a[href^="/person/"]')).toHaveCount(2);
    await expect(trainer.getByText("You are in this crew")).toBeVisible();
    /* ⚠ SCOPED TO THE ROW (27 Sep 2026). "Crew leader" is now BOTH the group's
       heading and the leader's own right-hand word — the same shape a studio's
       page has had all along (an Owner group over a row that says Owner), and
       the word earns its place because the Crew members group beneath holds
       two roles. A bare `getByText` therefore matched two nodes and was a
       strict-mode violation; what the check means is "the leader's row says so",
       so that is what it asks. */
    await expect(trainer.getByRole("link", { name: `Open ${learnerName}`, exact: true })).toContainText("Crew leader");
    /* ⚠ TWO COLUMNS ON THE CREWS HUB (29 Sep 2026, the user: "crew tab should
       have 2 colums for where you have created the crew and where you are a part
       of in the other column"). The stacked CREWS YOU LEAD / CREWS YOU ARE IN
       headings are segments now, so the crew this trainer is merely ON is in the
       second column rather than further down the page. */
    /* ⚠ a segment pill's accessible name is its `aria` plus its count, never its
       visible label (`SegmentedNav` line 78) — the label is for the eye and the
       aria is the sentence, which is what a screen reader and a locator read. */
    await trainer.goto("/crews?show=in");
    await expect(trainer.getByRole("link", { name: /^The crews you are a part of/ })).toBeVisible();
    await expect(trainer.getByRole("link", { name: `${crewName} — open the profile` })).toBeVisible();
    await trainer.goto("/discover?city=Pune&tab=crews");
    await expect(trainer.getByRole("link", { name: `${crewName} — Crew` })).toBeVisible();

    /* ⚠⚠ AND THE SECOND HALF OF THIS TEST — "a crew entry made by its leader" —
       WENT WITH EVENTS (29 Sep 2026). The owner published a free crew battle
       (crews only, eight places, no spectator tickets), the leader entered the
       crew from the crews they lead with the pick already made because they
       lead exactly one, the entry read "Crew entry · {crew}", the organiser's
       Participants register said "entered by its leader · registered", and the
       crew's public page carried it as its BATTLE RECORD.
       ⚠ Step 22 paid two of Step 21's debts in its own migration — a crew entry
       is made by the person who LEADS the crew, and a duet partner is a PERSON
       who is asked — and both are unreachable now: `event_bookings.crew_id` and
       `partner_id` exist with nothing that can write them. A crew's page shows
       its roster and no record under it. */
  });

  test("Discover: search, the style rail and the filter sheet", async () => {
    // ---- Step 23: search + Discover filters ----
    // The one search box finds the studio by a prefix of its name and opens its
    // page; the style rail narrows the classes shelf (Bollywood keeps the class,
    // an unrelated style empties it with a Clear filters door); the filter
    // sheet's Cheapest sort lands in the URL and the button counts what is on.
    // ⚠ THE EVENTS HALF OF THIS TEST WENT ON 29 Sep 2026: the Events tab, the
    // Battles quick chip keeping the battle and dropping the showcase, and the
    // "Search events" box narrowing by title. `search_dance_os` still HAS an
    // events branch (the migration's to drop) and nothing can reach it — the
    // repository drops event hits before they are offered, because a row that
    // opens a 404 is worse than no row.
    await learner.goto("/discover?city=Pune&tab=classes");
    /* the STAMPED name, not the shared "E2E Studio" prefix: search_dance_os caps
       each kind at three ordered by name, so leftovers from a killed run pushed
       this run own studio out of its own result list (10 Sep 2026) */
    await learner.getByLabel("Search DanceOS").fill(studioName);
    await learner.getByRole("option", { name: `${studioName} — Studio · Pune` }).click();
    await learner.waitForURL(new RegExp(`/studio/${businessId}$`));

    await learner.goto("/discover?city=Pune&tab=classes");
    /* Discover is a SHARED shelf: any Bollywood class in Pune wears this same
       derived name, so the tile is pinned to this run's class by its share slug */
    const ourTile = learner.locator(`a[href="/c/${shareSlug}"][aria-label="Open ${classTitle}"]`);
    await expect(ourTile).toBeVisible();
    /* ⚠ THE STYLE RAIL IS INSIDE THE FILTER SHEET since 2 Oct 2026 (the user:
       "dance styles inside filter on discover"), under FAMILY — and what is
       picked rides the row under the tabs as a pill that takes it off */
    await learner.getByRole("button", { name: "All filters" }).click();
    const styleSheet = learner.getByRole("dialog", { name: "Filters" });
    await styleSheet.getByRole("button", { name: "Bollywood", exact: true }).click();
    await learner.waitForURL(/styles=Bollywood/);
    await expect(styleSheet.getByRole("button", { name: "Bollywood", exact: true })).toHaveAttribute("aria-pressed", "true");
    await styleSheet.getByRole("button", { name: "Show results" }).click();
    await expect(learner.getByRole("button", { name: "Remove Bollywood", exact: true })).toBeVisible();
    await expect(ourTile).toBeVisible();
    // a FAMILY narrows the same way: Bollywood's own keeps the class, Latin drops it
    await learner.goto("/discover?city=Pune&tab=classes&fam=Bollywood");
    await expect(ourTile).toBeVisible();
    await learner.goto("/discover?city=Pune&tab=classes&fam=Latin");
    /* ⚠ PINNED TO THIS RUN'S CLASS, not to an empty shelf (3 Oct 2026): the
       re-seeded demo world has a Salsa class in Pune, so "Nothing in Pune matches
       that" was a claim about the world, not the filter. Wait for the filtered
       page (its Remove pill), then assert our Bollywood tile is gone. */
    await expect(learner.getByRole("button", { name: "Remove Latin family", exact: true })).toBeVisible();
    await expect(ourTile).toHaveCount(0);
    // and the Styles section has filters of its own: Latin is its three styles
    await learner.goto("/discover?city=Pune&tab=styles&fam=Latin");
    await expect(learner.getByTestId("style-card")).toHaveCount(3);
    await expect(learner.getByRole("button", { name: "Remove Latin family", exact: true })).toBeVisible();
    // a style the studio does not teach empties the shelf, with a door back
    await learner.goto("/discover?city=Pune&tab=classes&styles=Kalbelia");
    await expect(learner.getByText("Nothing in Pune matches that")).toBeVisible();
    await learner.getByRole("link", { name: "Clear filters" }).click();
    await expect(ourTile).toBeVisible();

    /* THE FILTER SHEET, on the shelf that is still here. It was driven on the
       EVENTS tab until 29 Sep 2026 (Cheapest, then the count, then Clear), and
       the sheet is the same control on every tab — what changes per tab is
       which ROWS it offers, which is the reason it is worth driving at all. */
    await learner.getByRole("button", { name: "All filters" }).click();
    const filterSheet = learner.getByRole("dialog", { name: "Filters" });
    await filterSheet.getByRole("button", { name: "Cheapest" }).click();
    await filterSheet.getByRole("button", { name: "Show results" }).click();
    await learner.waitForURL(/sort=price/);
    await expect(learner.getByRole("button", { name: "All filters" })).toHaveText(/Filters · 1/);
    await learner.getByRole("button", { name: "Clear filters" }).click();
    await learner.waitForURL((url) => !url.search.includes("sort="));
    await expect(ourTile).toBeVisible();
  });

  test("notifications: the bell, the stacks and what reaches you", async () => {
    // ---- Step 24: notifications ----
    // Nothing in this leg raises a notification: everything the story already did
    // — a seat booked, a person asked onto a class and answering, a crew ask
    // confirmed, an entry made — raised one through a trigger. So the bell is
    // read as evidence of the rest of the test, which is the whole classPerson.
    await owner.goto("/");
    await expect(owner.getByTestId("bell-badge")).toBeVisible();
    await owner.getByRole("link", { name: /^Notifications/ }).click();
    await owner.waitForURL(/\/notifications$/);
    await expect(owner.getByText("What needs you")).toBeVisible();
    // the stacks are one per kind, and the studio's story made at least these two.
    // (People is the trainer's and the crew leader's, further down.)
    await expect(owner.getByRole("button", { name: /^Bookings — \d+ updates?$/ })).toBeVisible();
    /* ⚠ THE `Events` STACK went on 29 Sep 2026 — a seat booked on an event and a
       duet partner asked were what raised one. `NotificationKind` KEEPS the
       word (162 rows on production still carry it and a notification is a
       record of something that happened), so the stack still renders for an
       account that holds one; nothing can raise a new one. */
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

  test("stats: three columns, every profile", async () => {
    // ---- Step 25: stats ----
    // ⚠⚠ THREE COLUMNS, AND THIS SEGMENT HAS NOW DESCRIBED THREE DIFFERENT
    // SCREENS IN TWO DAYS (29 Sep 2026, the user: "you messed up with the stats
    // page — it was supposed to be the one with the graphs and number grid,
    // history and rankings in 3 columns for all profiles").
    //
    // Earlier the same day the two stats screens were collapsed into one, and
    // into the WRONG one: `StatsScreen` (Record · History · Rankings) was
    // deleted and the thin `EntityStatsPage` kept. The ask had been "only one
    // view", and what it wanted was the RICH screen made universal. So the
    // three-column screen is back and it is every profile's — a person's, a
    // studio's and a crew's — and `EntityStatsPage` is the one that is gone.
    //
    // Nothing this story creates has ENDED (every session it books is in the
    // future), so the record is honestly empty — and saying so is the assertion.
    await learner.goto("/stats");
    /* ⚠ `/stats` IS STILL AN ADDRESS (Rule 14) and lands on your own record —
       proved as a redirect, not assumed. */
    await learner.waitForURL(new RegExp(`/person/${learnerId}/stats`));
    await expect(learner.getByRole("heading", { name: learnerName })).toBeVisible();
    /* TWO COLUMNS SINCE 2 Oct 2026 (the user: "remove history from stats for
       all profiles . can completly remove this section") — named, and the one
       that went asserted ABSENT, so it cannot come back unnoticed */
    for (const col of ["Record", "Rankings"]) {
      await expect(learner.getByRole("link", { name: col, exact: true })).toBeVisible();
    }
    await expect(learner.getByRole("link", { name: "History", exact: true })).toHaveCount(0);
    /* the three sides, and A ZERO IS DRAWN (27 Sep 2026, the user: "show all
       metrics for that particular profile type even if its 0") */
    await expect(learner.getByLabel(/^Classes taken — 0 sessions/)).toBeVisible();
    await expect(learner.getByLabel(/^Classes taught — 0 sessions/)).toBeVisible();
    /* ⚠ THE NUMBER GRID IS BACK — the four figures that open the list behind
       them, which went with `StatsScreen` and are the "number grid" of the ask */
    await expect(learner.getByRole("button", { name: /^Styles — 0, open the list$/ })).toBeVisible();

    /* THE RANKINGS COLUMN — where you stand, then the board you stand on. A
       place is never printed without its denominator, and "#0" is refused in
       words (Step 25's own rule, kept). */
    await learner.getByRole("link", { name: "Rankings", exact: true }).click();
    await learner.waitForURL(/tab=charts/);
    const standings = learner.getByTestId("standing-card");
    await expect(standings.first()).toBeVisible();
    await expect(standings.first()).toContainText("Everywhere");
    /* the boards are browsable again — the four segments went with StatsScreen */
    await expect(learner.getByRole("link", { name: "Dancers", exact: true })).toBeVisible();
    await expect(learner.getByRole("link", { name: "Studios", exact: true })).toBeVisible();
    /* the points rules are a DISCLOSURE beside the count (27 Sep 2026), not a
       card standing between the controls and the board */
    await learner.getByRole("button", { name: "Points" }).click();
    await expect(learner.getByText("Session conducted", { exact: true })).toBeVisible();

    /* ⚠ THE SAME THREE COLUMNS FOR SOMEBODY ELSE — which is "for all profiles".
       The trainer's record is read by the learner, and it carries THEIR
       rankings; the History column is drawn and says WHY it is empty, because
       `my_session_history` is the caller's own by Step 25's design and an empty
       shelf would read as "they have danced nothing". */
    await learner.goto(`/person/${trainerId}/stats`);
    await expect(learner.getByRole("heading", { name: trainerName })).toBeVisible();
    await expect(learner.getByRole("link", { name: `Back to ${trainerName}` })).toBeVisible();
    await expect(learner.getByRole("link", { name: "History", exact: true })).toHaveCount(0);
    await learner.getByRole("link", { name: "Rankings", exact: true }).click();
    await expect(learner.getByTestId("standing-card").first()).toBeVisible();

    /* and a crew's own page wears the same three, which is where the crew
       home's chip points since the board went (29 Sep 2026) */
    await learner.goto(`/crew/${crewId}/stats?tab=charts`);
    await expect(learner.getByRole("heading", { name: crewName })).toBeVisible();
    await expect(learner.getByTestId("standing-card").first()).toBeVisible();
    /* the crew's points are its confirmed members — ⚠ no "Event entered · +3 pts"
       since 29 Sep 2026, when events went */
    await learner.getByRole("button", { name: "Points" }).click();
    await expect(learner.getByText("Event entered", { exact: true })).toHaveCount(0);
    await expect(learner.getByText("Confirmed member", { exact: true })).toBeVisible();
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
    /* ⚠⚠ AND THE STUDIO IS ON THIS PAGE ONCE — WHICH IS THE CHANGE (27 Sep
       2026). It was TWICE on purpose from 20 Sep: "Studios taught at" counted
       PUBLISHED CLASSES and "Studios associated with" counted the SEAT, and
       both are true of this trainer (they accepted the class in segment 1, and
       accepting is what seated them as visiting faculty). The user asked for one
       group with the team title on the row — *"Studios with team Title"* — so
       the two facts are one row, keyed by the studio's id, and the SEAT's word
       is what it reads because a seat is what the studio calls you.
       ⚠ **Train** IS GONE FROM EVERY PROFILE (27 Sep 2026, the user: *"Train
       section to be removed from profiles"*). It was where somebody had TAKEN
       classes and it was their own tab's alone, because a booking is private —
       the check below asserted its absence HERE for that reason, and it now
       asserts something stronger for a simpler one: no profile draws it at all.
       A studio you bought a class from is a receipt, not a relationship. */
    await expect(learner.getByRole("link", { name: new RegExp(`^Open ${studioName}`) })).toHaveCount(1);
    /* ⚠ ONE "Studios" GROUP SINCE 27 Sep 2026, with the title on the row. The
       two facts this pair used to assert separately — they TEACH here and they
       hold a SEAT here — are one row now, and a seat outranks a class, so the
       row reads the seat's word. ⚠ And the third line is now true on BOTH
       screens rather than on this one alone (see above). */
    await expect(learner.getByText("Studios", { exact: true })).toBeVisible();
    await expect(learner.getByText("Teach", { exact: true })).toHaveCount(0);
    await expect(learner.getByText("Train", { exact: true })).toHaveCount(0);
    // the crew they confirmed into is on their page, and it opens the crew
    await expect(learner.getByRole("link", { name: `Open ${crewName}` })).toBeVisible();
    // following a person is one bit, and the count moves — as data on the toggle,
    // never as a figure on the page (19 Sep 2026)
    const personFollow = learner.getByTestId("follow-toggle");
    await expect(personFollow).toHaveAttribute("data-followers", "0");
    /* The toggle by its test id, not by name: since 2 Oct 2026 the Followers and
       Following FIGURES on a person's page are buttons too ("Followers — 0",
       "Following — 0"), and a bare name is a case-insensitive SUBSTRING match,
       so "Follow" found three controls and /^Following/ would find the figure. */
    await personFollow.click();
    await expect(personFollow).toHaveAttribute("aria-pressed", "true");
    await expect(personFollow).toHaveAttribute("data-followers", "1");
    // and it is really one bit: pressing again takes it back
    await personFollow.click();
    await expect(personFollow).toHaveAttribute("aria-pressed", "false");
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
    /* fifteen seconds, not five (4 Oct 2026): the box reads "Searching…" while a
       server action runs the rate limit and the search, and on a local
       `next start` that round trip outran five — the snapshot showed the
       listbox still searching, never a wrong answer */
    await expect(learner.getByRole("listbox", { name: "Search results" }).getByText("Artists")).toBeVisible({ timeout: 15_000 });
    await learner
      .getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) })
      .and(learner.locator('[href^="/person/"]'))
      .click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);

    // ⚠ INVERTED 26 Sep 2026: the owner is a PERSON now (the organization login
    // is retired), so what R9 kept out of search and off a page is IN it — the
    // same term that finds the trainer finds the owner under People, and the
    // owner's address is an ordinary signed-in person's page (200, "User"). The
    // ORGANIZATION is a business with a page of its own at /org/{business id},
    // which the push-2 segment reads.
    await learner.goto("/discover?city=Pune&tab=classes");
    /* two classPeople, each on a term that cannot be crowded out by a leftover: this
       run stamp finds the trainer, and the owner's name finds the owner */
    await learner.getByLabel("Search DanceOS").fill(stamp);
    /* AN ARTIST IS FOUND ONCE (later on 18 Sep 2026, the user: "should only come
       as their profile as artist, no separate page required"): search lists the
       trainer under Artists as the PERSON — one row, opening their profile — and
       the page Home provisioned for them is nobody's destination any more */
    const trainerRows = learner.getByRole("option", { name: new RegExp(`^${trainerName} — Artist`) });
    await expect(trainerRows).toHaveCount(1);
    await expect(trainerRows.and(learner.locator('[href^="/person/"]'))).toBeVisible();
    await learner.getByLabel("Search DanceOS").fill("E2E Owner");
    await expect(learner.getByRole("option", { name: /^E2E Owner/ }).and(learner.locator('[href^="/person/"]')).first()).toBeVisible();
    const ownerPage = await learner.goto(`/person/${ownerId}`);
    expect(ownerPage?.status()).toBe(200);
    /* ⚠ "User", NOT "USER" (20 Sep 2026): `HERO_EYEBROW` uppercases in CSS, so
       the DOM keeps the word a screen reader should say; the word carries the
       account number against it with no gap (C28), so the match is on the
       joined token rather than on the word alone. */
    await expect(learner.getByTestId("person-hero").getByText(/^User(-\d{6})?$/)).toBeVisible();

    // the crew's public roster opens its people too, and the trainer's own page
    // says it is theirs rather than offering them a Follow button
    await trainer.goto(`/crew/${crewId}`);
    /* `Open {name}`, the shared row's name since 27 Sep — see the count above */
    await trainer.getByRole("link", { name: `Open ${trainerName}`, exact: true }).click();
    await trainer.waitForURL(/\/person\/[0-9a-f-]+$/);
    /* ⚠⚠ RE-CUT 21 Sep 2026, AND IT IS A REAL CHANGE RATHER THAN A MOVED
       LOCATOR. `/person/{me}` drew the PUBLIC component with `isMe` until today —
       your page minus the owner's extras. Your own profile is served at that
       address now (`/profile` is a redirect to it), so the hero here is the
       OWNER's, `my-hero`, and that preview of "what a visitor sees" no longer
       exists as a screen. What must still hold is asserted instead: the door off
       the crew roster lands on the person, it is your own version, and the two
       things 19 Sep took off it are still off — no Follow on yourself, and Stats
       opens your own record.
       ⚠ `exact: true` on Follow is load-bearing: the owner's figure buttons are
       named "N followers" and "N following", and a bare string matches by
       SUBSTRING. */
    await expect(trainer.getByTestId("my-hero")).toBeVisible();
    // ⚠ `/person/{you}/stats`, not `/stats` (22 Sep 2026): a person's stats had
    // two addresses drawing two different screens, and the richer one was the
    // one that did not name you. One address per subject now, so the chip reads
    // the same whoever is looking — `/stats` is a redirect and is proved as one.
    await expect(trainer.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", `/person/${trainerId}/stats`);
    await expect(trainer.getByRole("button", { name: "Follow", exact: true })).toHaveCount(0);
    // ⚠ and no photo control here either (16 Sep 2026): a picture is changed
    // behind the disc on HOME, and this screen only ever shows it
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
    /* the ⊕ appears with the corner pencil (26 Sep 2026) — read-only until then */
    await expect(trainer.getByRole("button", { name: "Change profile picture" })).toHaveCount(0);
    await enterEditMode(trainer);
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
    await enterEditMode(trainer);
    await trainer.getByRole("button", { name: "Edit posters" }).click();
    await expect(trainer.getByRole("dialog", { name: "Posters" })).toBeVisible();
    await trainer.getByRole("dialog", { name: "Posters" }).getByRole("button", { name: "Cancel" }).click();
    /* and Edit profile carries neither picture any more — nor the number and the
       email, which are the ⊕ beside the buttons since 26 Sep 2026 */
    const wordsOnly = await openEditProfile(trainer);
    await expect(wordsOnly.getByLabel("Change your photo")).toHaveCount(0);
    await expect(wordsOnly.getByLabel("Add picture")).toHaveCount(0);
    await expect(wordsOnly.getByLabel("Phone")).toHaveCount(0);
    await expect(wordsOnly.getByLabel("Email")).toHaveCount(0);
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

  test("/managed is an address, not a page — and its rows are reached through the desks", async () => {
    /* ⚠⚠ S_managed IS GONE (21 Sep 2026, the user's answer when asked whether it
       still earned a door: *"No need for it"*).
       It was one list over everything a person runs. What made it redundant was
       the year before the decision, not the decision: the Classes and Events
       tiles on every grid open the same rows through the desks that can actually
       ACT on them, so it had become a view of a view. Its tile went on 19 Sep and
       its last pill on 21 Sep, leaving it reachable only by typing the address.
       ⚠ THE ADDRESS STAYS AND REDIRECTS (Rule 14): a link handed out is a
       promise, and the installed TWA reopens on the last URL it showed. So this
       segment asserts the promise is kept and that what the screen used to list
       is still reachable — which is the only thing that made removing it safe. */
    await owner.goto("/");
    await expect(owner.getByRole("link", { name: "Everything you manage", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Manage", exact: true })).toHaveCount(0);

    /* ⚠ A PERSON LANDS ON THEIR REGISTER. This pair used to say "an organization
       lands on its studios, a person on their register" with the owner as the
       organization; since 26 Sep 2026 the owner is a person who OWNS studios and
       an organization, and the redirect reads the account, not what it owns —
       so both land on the register. Getting this wrong is how a redirect ends
       up somewhere true-looking and wrong. */
    await owner.goto("/managed");
    await owner.waitForURL(/\/my-classes\?show=manage$/);
    await learner.goto("/managed");
    await learner.waitForURL(/\/my-classes\?show=manage$/);

    /* ── AND THE ROWS IT USED TO CARRY ARE STILL THERE, through the desks. This
       is the half that matters: removing a view is only safe while everything on
       it has another way in. ── */
    await owner.goto(`/business/${businessId}/classes`);
    await expect(owner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
    /* ⚠ and its DESK is one press from the row — the **Roster** pill. This read
       `Manage ${classTitle}` on its first cut, which was S_managed's OWN row
       name: I asserted the deleted screen's vocabulary against the screen that
       replaced it. The register has never used that word — a row is the app's
       one class tile plus the pills its status allows. */
    await owner.getByRole("link", { name: "Roster", exact: true }).first().click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes\/[0-9a-f-]+\/roster$/);
    /* ⚠ the other half of "everything on it has another way in" was the two
       events the story made, found on the organization's own events desk. Both
       the events and that desk went on 29 Sep 2026, so what `/managed` used to
       carry is classes alone — which is exactly what its redirect now says. */
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
    /* ⚠ AND NO CORNER AT ALL ON THIS PAGE (21 Sep 2026). The pencil went to
       Settings on 19 Sep ("all edit profile options to be removed from home and
       profile pages") and the EYE went today, on the user's own question —
       "i guess profile tab and profile page are the same thing?" — which makes
       "no top right button required on profile pages" cover this screen too.
       ⚠ The classPerson underneath the old assertion was never "an eye exists": it was
       "you can get from here to your public page". That is what is asserted now,
       and it is the DISC that carries it, saying so in plainer words than the
       glyph did. Removing a door is only safe while the other one is there, so
       both halves are checked. */
    await expect(trainer.getByRole("button", { name: "Edit profile", exact: true })).toHaveCount(0);
    await expect(trainer.getByRole("link", { name: "Public view" })).toHaveCount(0);
    /* ⚠ RE-CUT 21 Sep 2026 — WRITTEN THIS MORNING AND ALREADY STALE, which is the
       point worth keeping. When the corner's eye came off, this line was added to
       prove the door it replaced still existed: the disc, named "Open your public
       page". The profile merge later the same day made THIS page that address, so
       the disc pointed at what it was standing on and the link went. The classPerson
       underneath survives the control that carried it — you can still reach your
       public address, because you are on it — and that is what is asserted. */
    await expect(trainer.getByRole("link", { name: "Open your public page", exact: true })).toHaveCount(0);
    await expect(trainer).toHaveURL(/\/person\/[0-9a-f-]+$/);
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
    /* and on Home the two ＋ appear with the pencil (26 Sep 2026) — not before */
    await expect(trainer.getByRole("button", { name: "Add a dance style" })).toHaveCount(0);
    await enterEditMode(trainer);
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
    await enterEditMode(trainer);
    await trainer.getByRole("button", { name: "Add a link" }).click();
    await trainer.getByRole("button", { name: "Add Instagram" }).click();
    await trainer.getByLabel("URL", { exact: true }).fill("https://instagram.com/rheamoves");
    await trainer.getByRole("dialog", { name: "Add your Instagram" }).getByRole("button", { name: "Save" }).click();
    await trainer.getByRole("dialog", { name: "Add a social link" }).getByRole("button", { name: "Done" }).click();
    await expect(trainer.getByRole("button", { name: "Instagram — @rheamoves" })).toBeVisible({ timeout: 15_000 });
    // and a bad address is refused with the database's own sentence, not saved
    await enterEditMode(trainer);
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
    // ⚠ A BUTTON, NOT A LINK (21 Sep 2026): the gear used to navigate to
    // `/profile?settings=1` and let THAT page open the sheet, which is exactly
    // why Settings could only ever be about that person. It opens the sheet over
    // whatever you are looking at now, so a studio gets a studio's settings.
    /* ⚠ `/profile` is a REDIRECT to `/person/{id}`, so a press straight after
       the goto can land before React has claimed the gear and do nothing (2 Oct
       2026: one whole-suite run lost this segment that way, the page fully drawn
       in the snapshot). Wait for the address, and retry the press until the
       sheet answers — a click before hydration is not a click. */
    await trainer.waitForURL(/\/person\//);
    const settings = trainer.getByRole("dialog", { name: "Settings" });
    await expect(async () => {
      if (!(await settings.isVisible())) {
        await trainer.getByRole("button", { name: "Settings", exact: true }).click();
      }
      /* ⚠ SIX seconds per press, not two (3 Oct 2026): the gear PUSHES
         `?settings=1`, which is a server round trip for this page, and a local
         `next start` renders `/person/{me}` in ~3 s. A retry every two seconds
         pressed again mid-flight, and each press ABORTS the navigation before it
         — traced: `_rsc … net::ERR_ABORTED`, the sheet never opening while one
         unhurried press opened it every time. A retry must outlast the thing it
         is waiting for. */
      await expect(settings).toBeVisible({ timeout: 6_000 });
    }).toPass({ timeout: 30_000 });
    /* ⚠ NO "YOUR PLAN" SINCE 26 Sep 2026 — the plan is the Subscription tile on Home */
    await expect(settings.getByText("YOUR PLAN")).toHaveCount(0);
    await expect(settings.getByText("ACCOUNT")).toBeVisible();
    /* 19 Sep 2026: TILES, and no Notifications among them — "What reaches you"
       lives on the bell's own screen, once (the user: "can remove notifications
       and keep it inside the notifications section only"); Help & support and
       Message DanceOS merged into one door to the conversation */
    await expect(settings.getByRole("button", { name: /Notifications/ })).toHaveCount(0);
    await expect(settings.getByRole("link", { name: /Notifications/ })).toHaveCount(0);
    await expect(settings.getByRole("link", { name: /Help & support/ })).toHaveAttribute("href", "/support");
    await expect(settings.getByRole("link", { name: /Message DanceOS/ })).toHaveCount(0);
    /* ⚠ AND LOG OUT IS NOT HERE ANY MORE (21 Sep 2026, the user: "shift log out
       from setting to profile switcher"). Both halves are asserted, because a
       check that only looks for the new place lets the old one live on: it is
       GONE from Settings, and it is in the switcher — which is the chip beside
       the gear on every screen, so the way out is one tap from anywhere rather
       than two taps inside the Profile tab. */
    await expect(settings.getByRole("button", { name: /Log out/ })).toHaveCount(0);
    /* ⚠ ENQUIRY TYPES HAS LEFT SETTINGS (27 Sep 2026, the user: "enquiries
       should be removed from settings"). It was the prototype's own sheet
       (9000-9030) behind a tile here; the kinds a business takes are now chips
       under the Take-enquiries switch in the contact ⊕ on its own home, which is
       where the button they govern is made. The whole BUSINESS block went with
       the tile rather than leaving a heading over nothing. */
    await expect(settings.getByText("Enquiry types", { exact: true })).toHaveCount(0);
    await expect(settings.getByText("BUSINESS", { exact: true })).toHaveCount(0);
    // Payments is a real screen now (S_payments 16531): the trainer's goes to their OWN page's desk
    await settings.getByRole("link", { name: /Payments & verification/ }).click();
    await expect(trainer).toHaveURL(/\/business\/[0-9a-f-]+\/payments$/);
    expect(trainer.url()).not.toContain(businessId);
    await expect(trainer.getByRole("heading", { name: "Payments & verification" })).toBeVisible();
    await expect(trainer.getByText("ACCEPTED FROM STUDENTS")).toBeVisible();
    /* ⚠ AND THIS IS A DRILL PAGE, WHICH IS THE POINT (21 Sep 2026, the user:
       "make profile switcher constant like settings"). The switcher lived on the
       DanceOS mark from 18 Sep, and the mark is drawn on four tabs and two
       entity homes — so on a desk like this one there was no switcher at all,
       while the gear was right there. It is a chip beside the gear now, on every
       screen, and Log out is the last row of the menu it opens. */
    const switcherChip = trainer.getByRole("button", { name: /^Switch profile/ });
    await expect(switcherChip).toBeVisible();
    await switcherChip.click();
    const profiles = trainer.getByRole("menu", { name: "Your profiles" });
    await expect(profiles).toBeVisible();
    await expect(profiles.getByRole("menuitem", { name: /Log out/ })).toBeVisible();
    /* the menu closes on its scrim or on a navigation, never on Escape — and the
       next line navigates anyway, which is what takes it down */
    /* ⚠⚠ THE TRAINER IS BOUNCED OFF THE STUDIO'S DESKS NOW (28 Sep 2026, the
       user: "that profile switcher and rights should never be given for faculty,
       visiting faculty, assistant, event team or other team members").
       This segment used to open the studio's Payments desk AS THE TRAINER and
       read its takings — and the same seat could reach its Students desk with
       every student's phone number, its invoice ledger and its refunds. The
       switcher stopped offering the studio, and a gate closed only in the menu
       that opens it is not closed, so the ADDRESSES are what is driven here. */
    for (const desk of ["payments", "students", "invoices", "refunds", "staff"]) {
      await trainer.goto(`/business/${businessId}/${desk}`);
      await expect(trainer).toHaveURL(/\/business$/);
    }
    /* ⚠ and what they KEEP, because that is half the decision: the studio is
       still on their hub under the taught-at list, with a door to its PUBLIC
       page rather than its manage home.
       ⚠ IT IS THE SECOND COLUMN NOW (29 Sep 2026, the user: "same should be for
       studios with 2 colums — your own studios and the second column with where
       your learned"). Taught-at rides in that column under its own head rather
       than becoming a third: both are "a studio that is not yours".
       ⚠ AND IT IS ITS OWN THIRD COLUMN SINCE 3 Oct 2026 (the user: "Studio
       column name- Manage, Team and Student") — `?show=team`. */
    await trainer.goto("/business?show=team");
    await expect(trainer.getByText("STUDIOS YOU HAVE TAUGHT AT")).toBeVisible();

    /* …and the two things this block used to prove ride the OWNER now, which is
       who they were always about. ⚠ The non-owner refusal ("Only the owner
       changes what the business accepts") is UNREACHABLE through the UI until
       `manager` exists — it is the server's guard either way, and the held
       migration is what gives it a person again. */
    await owner.goto(`/business/${businessId}/payments`);
    await expect(owner.getByText("ACCEPTED FROM STUDENTS")).toBeVisible();
    await owner.getByRole("button", { name: "Verification" }).click();
    /* 14 Sep 2026: the badge is the STUDIO's now, and an admin gave this studio
       its badge in the first segment — so the tab reads verified, and it would
       be a bug if it did not */
    await expect(owner.getByText("Verified studio")).toBeVisible();
    // Artist tools is the Artist PLAN's switch (8855), and the plan has been live
    // since the trainer got it on day one — so the strip reads PRO ACTIVE, and
    // pressing it ENDS the plan
    /* ⚠ THE PLAN IS THE SUBSCRIPTION TILE ON HOME SINCE 26 Sep 2026 (the user:
       "subscribe to become an artist should not be a separate tab in settings
       like artist tools … subscriptions also become an option on home tab for
       all profiles and is removed from settings for all"). Both ends: Settings
       carries neither the switch nor the tile, and the tile on Home opens the
       plan's own screen, where ENDING is a real Cancel with a confirm. */
    await trainer.goto("/profile?settings=1");
    const settings2 = trainer.getByRole("dialog", { name: "Settings" });
    await expect(settings2.getByText("ACCOUNT")).toBeVisible();
    await expect(settings2.getByText("PRO ACTIVE")).toHaveCount(0);
    await expect(settings2.getByRole("button", { name: "Artist tools" })).toHaveCount(0);
    await expect(settings2.getByRole("link", { name: /Subscription/ })).toHaveCount(0);
    await trainer.goto("/");
    await expect(trainer.getByRole("link", { name: "Subscription", exact: true })).toHaveAttribute("href", "/subscription");
    // 10 Sep 2026: ENDING means stop renewing, the way every real subscription
    // works — the tools stay on until the period paid for is over, so the badge
    // still reads ARTIST, and the plan's own screen says it is ending. The ROLE
    // never moved either way (8 Sep 2026: Pro is a row, not a role)
    await trainer.goto("/subscription");
    await expect(trainer.getByTestId("subscription-card")).toBeVisible();
    /* the trainer's plan is an admin's GRANT (segment 4), so it renews nothing
       and there is no Cancel to press — the screen says exactly that */
    await expect(trainer.getByText("ACTIVE · GRANTED")).toBeVisible();
    await expect(trainer.getByText("This period does not renew. Once it ends you can subscribe again from here.")).toBeVisible();
    await expect(trainer.getByRole("button", { name: /^Cancel subscription/ })).toHaveCount(0);
    // what was paid for stands: the same profile is still an artist
    await trainer.goto("/profile");
    await expect(trainer.getByText(/^Artist(-\d{6})?$/).first()).toBeVisible({ timeout: 15_000 });

    // ---- the business's own words on its public page (Since 10691, Call 10879) ----
    // ⚠ NO ABOUT SINCE 20 Sep 2026 (the user: "Remove bio from all profiles") — the
    // textarea is off this sheet too, and the sheet is asserted not to offer one.
    // The COLUMN is still read and simply never written, so an existing paragraph
    // survives a Save; what is proven here is that the form cannot set one.
    /* ⚠ THE EDIT CELL IS OFF THE PUBLIC PAGE (22 Sep 2026) — a studio had TWO
       doors to its own form, this one and the corner pencil, where a person has
       had exactly one since C22. Both are gone; the sheet is `?edit=1` on the
       studio's own home, which is where Settings' THIS STUDIO tile lands. */
    await owner.goto(studioUrl);
    await expect(owner.getByRole("button", { name: "Edit business" })).toHaveCount(0);
    await owner.goto(`/business/${businessId}?edit=1`);
    const bizEdit = owner.getByRole("dialog", { name: "Edit business" });
    await expect(bizEdit.getByLabel("About")).toHaveCount(0);
    await pick(bizEdit, "Since", "2016");
    /* ⚠ NO PHONE IN THE SHEET (26 Sep 2026) — the number is the ⊕ beside the buttons */
    await expect(bizEdit.getByLabel("Phone", { exact: true })).toHaveCount(0);
    await bizEdit.getByRole("button", { name: "Save" }).click();
    /* fifteen seconds, not the default five: this lands in the one SERVER
       re-render the save triggers, and a whole-suite run was lost to the default
       here on 18 Sep 2026 (green alone, nothing on the page changed) */
    await expect(owner.getByText("Since 2016")).toBeVisible({ timeout: 15_000 });
    /* the number, through the studio home's contact sheet — the studio's own */
    const bizContacts = await openContacts(owner, `/business/${businessId}`);
    await bizContacts.getByLabel("Phone", { exact: true }).fill("+91 98765 43210");
    await bizContacts.getByRole("button", { name: "Save" }).click();
    await expect(bizContacts).toHaveCount(0, { timeout: 15_000 });
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
  test("Home’s PassDeck: today’s sessions as swiped cards, with the invoice on the card", async () => {
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
    /* ⚠ LIVE IS THE CARD'S FRAME NOW (2 Oct 2026, the user: "live on class cards
       should not be there and instead the border of card should be green with a
       live button on top left") — a badge on the card's corner, not a chip in
       its line */
    await expect(card.getByTestId("live-badge")).toBeVisible();
    await expect(card.locator('[data-live="yes"]')).toHaveCount(1);
    /* ⚠ the deck frames every card by where it stands today (2 Oct 2026) — done
       red, live green, upcoming amber — and a live card wears neither of the other two */
    await expect(card.locator('[data-deck-state="live"]')).toHaveCount(1);
    await expect(card.getByTestId("done-badge")).toHaveCount(0);
    await expect(card.getByTestId("upcoming-badge")).toHaveCount(0);
    /* ⚠⚠ AND NOTHING UNDER THE CARD (2 Oct 2026, the user: "should not show
       invoice and cancel booking option on todays schedule tile on home … can
       also remove you are booked an everything in that section below the bar").
       Both live on the class page, which the card opens. Asserted at the old
       place, because a check that only looks at the new place cannot tell you
       the old one was cleared. */
    await expect(card.getByText(/You.re booked/)).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Invoice" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /Cancel booking/ })).toHaveCount(0);
    /* ⚠⚠ THE ENTRY-CODE TICKET IS GONE (29 Sep 2026, the user: "scan this at
       door text not required as your personal qr code for user or artist
       profile is being used to enter the classes"). The card drew a 54px QR of
       `bookingCodeOf(…)` that opened a full-screen pass reading "Scan this at
       the door." — and **no door in this app has ever read one**: the register's
       scanner resolves a PERSON's profile link and `can_run_register_for_class`
       decides. What survives is the string it encoded, which was always a
       booking REFERENCE rather than a key, printed where it already was. */
    await expect(learner.getByRole("button", { name: `Show the entry code for ${classTitle}` })).toHaveCount(0);
    await expect(card.getByText("Your own profile QR is what gets you in.")).toHaveCount(0);
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

    // THE OWNER'S HOME ASKS NO STUDIO'S QUESTION (17 Sep 2026, the user:
    // "organization home tab should not have classes options"; 26 Sep 2026: the
    // owner is a PERSON, so this is a user's Home — its Studios tile is the door
    // to every studio they run and nothing on it opens a register or a studio
    // calendar).
    await owner.goto("/");
    await expect(owner.getByRole("link", { name: "Classes at this studio" })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Open the studio calendar" })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Students", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("link", { name: "Studios", exact: true })).toBeVisible();
    // Stats is the chip beside the QR in the hero since 18 Sep 2026, not a tile — still one link called Stats
    await expect(owner.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
    /* ⚠ the organization's own home carrying its Events tile was checked here
       until 29 Sep 2026, and it was the line that said where an event belonged
       once a studio's home stopped offering one (R17, R48). Neither end of that
       sentence exists now. */
    // the studio's question — what is running in its rooms — is asked on the STUDIO's own home
    await owner.goto(`/business/${businessId}`);
    await expect(owner.getByTestId("deck-card").first().getByText("At your studio", { exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: "Classes", exact: true })).toHaveAttribute("href", `/business/${businessId}/classes`);
    await expect(owner.getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute("href", `/business/${businessId}/calendar`);
  });

  test("the wiring slice: a tick, two numbers, a followers list and two buttons that had no door", async () => {
    // ---- parity slice 7: D7 · N8 · I4 · B6 · the History chip · See crew ranking · the rank row ----
    // Every row here is the same shape of gap — a FIELD that exists and a SCREEN
    // that never read it — so they are proved together, in the order a person
    // would meet them.

    // ── D7: the tick on Discover's cards. Verification is DanceOS's to give
    // (the guard migration makes that a rule, not a comment), so the story sets
    // it the only way anything can: through the service role.
    const ticked = await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${businessId}`, {
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
    /* ⚠ THROUGH THE CONTACT SHEET SINCE 26 Sep 2026 — the ⊕ beside the buttons
       on Home, behind the pencil; the Edit profile sheet carries no number */
    const editSheet = learner.getByRole("dialog", { name: "Contact buttons" });
    await openContacts(learner);
    await editSheet.getByLabel("Phone").fill("+91 98765 43210");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    // the record kept it: the sheet re-opens holding the number. `openContacts`
    // navigates, so it re-reads the row — re-opening in the same breath as the
    // save would race router.refresh() and read the OLD one
    await openContacts(learner);
    await expect(editSheet.getByLabel("Phone")).toHaveValue("+91 98765 43210", { timeout: 15_000 });
    // somebody else's read of it: the trainer opens the learner's page — no Call on a user's page
    await trainer.goto(`/person/${learnerId}`);
    // the toggle by its test id: the person page's figures are buttons too (2 Oct 2026)
    await expect(trainer.getByTestId("follow-toggle")).toBeVisible();
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveCount(0);
    // and it is the person's to withdraw: an empty box saves null
    await editSheet.getByLabel("Phone").fill("");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toHaveCount(0);
    await openContacts(learner);
    await expect(editSheet.getByLabel("Phone")).toHaveValue("", { timeout: 15_000 });
    await editSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(editSheet).toHaveCount(0);

    // ── I4: the OTHER end of an enquiry can ring too. The business publishes its
    // number on its own page; the person who asked reads it on the enquiry they sent.
    const bizSheet = await openContacts(owner, `/business/${businessId}`);
    await bizSheet.getByLabel("Phone", { exact: true }).fill("+91 90000 11111");
    await bizSheet.getByRole("button", { name: "Save" }).click();
    await expect(bizSheet).toHaveCount(0);
    await learner.goto("/enquiries");
    /* ⚠ COMPLETED, NOT SENT, since 3 Oct 2026: the enquiry segment now ends with
       the business marking this enquiry Completed, and a closed enquiry lives
       under Completed (C96) — the Sent side holds only what is still open */
    await learner.getByRole("button", { name: "Completed enquiries" }).click();
    await learner.getByRole("link", { name: `Private Sessions enquiry to ${studioName}` }).click();
    await learner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(learner.getByRole("link", { name: `Call ${studioName}` })).toHaveAttribute("href", "tel:+919000011111");
    // the business's side is unchanged: this enquiry carried no mobile, so it still
    // says so rather than offering a dead button. ⚠ On the STUDIO's own desk
    // since 2 Oct 2026 — the unscoped desk is the owner's personal profile.
    await owner.goto(`/enquiries?as=${businessId}`);
    /* ⚠ the studio's desk opens on Received, and this enquiry was closed */
    await owner.getByRole("button", { name: "Completed enquiries" }).click();
    await owner.getByRole("link", { name: `Private Sessions enquiry from ${learnerName}` }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    /* ⚠ 3 Oct 2026: the rebuilt detail page draws NO Call at all when the
       enquiry carries no number, rather than a dashed sentence telling a
       business to "quote them here" on an enquiry that is already completed.
       Wait for the page itself, then assert the absence. */
    await expect(owner.getByTestId("enquiry-stage")).toBeVisible();
    await expect(owner.getByRole("link", { name: new RegExp(`^Call ${learnerName}`) })).toHaveCount(0);

    /* ⚠⚠ B6: THE FIGURE IS THE DOOR NOW, FOR EVERYBODY (27 Sep 2026, the user:
       "fix follow following for all profiles. list should open when clicked
       from anywhere"). This pressed a small owner-only button in the member row
       while the FIGURE two lines above it — which every visitor sees — was a
       dead number. Both ends: the old control is gone, the figure opens the
       same list, and the sheet reads its rows on the press. */
    await owner.goto(studioUrl);
    await expect(owner.getByRole("button", { name: "Followers — see who" })).toHaveCount(0);
    await owner.getByTestId("business-followers").click();
    const followersSheet = owner.getByRole("dialog", { name: /^Followers of / });
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
       remove History button") — and that is still true, while the LIBRARY it
       used to open is back as the stats screen's own second column (29 Sep
       2026). Both ends: no chip on the calendar, and `?tab=history` carried
       through the `/stats` redirect opens the library at the far end, which is
       what that parameter was kept alive for. */
    await learner.goto("/calendar");
    await expect(learner.getByRole("link", { name: "History" })).toHaveCount(0);
    /* ⚠ and since 2 Oct 2026 there is no library at all — an old
       `?tab=history` link lands on the Record column rather than an error */
    await learner.goto("/stats?tab=history");
    await learner.waitForURL(new RegExp(`/person/${learnerId}/stats`));
    await expect(learner.getByText("COMPLETED · 0")).toHaveCount(0);
    await expect(learner.getByLabel(/^Classes taken — 0 sessions/)).toBeVisible();

    /* ⚠⚠ THE STATS CHIP ON A CREW'S OWN HOME OPENS THAT CREW'S OWN STATS
       (29 Sep 2026). It pointed at `/stats?tab=charts&seg=crew` — the crew
       BOARD, drawn on the PERSON's stats screen — which is the studio chip's
       own bug of 21 Sep in a second place: a chip on a crew's home opening a
       page about everybody. With the boards gone that link would have walked
       the leader to their own record. */
    await learner.goto(`/crews/${crewId}/manage`);
    const rankingBtn = learner.getByRole("link", { name: "Stats", exact: true });
    await expect(rankingBtn).toHaveAttribute("href", `/crew/${crewId}/stats`);
    await rankingBtn.click();
    await learner.waitForURL(new RegExp(`/crew/${crewId}/stats`));
    await expect(learner.getByRole("heading", { name: crewName })).toBeVisible();
    /* the standings live in the Rankings column — the screen opens on Record */
    await learner.getByRole("link", { name: "Rankings", exact: true }).click();
    await expect(learner.getByTestId("standing-card").first()).toBeVisible();

    /* ⚠ THE RANK IS OFF BOTH SCREENS (19 Sep 2026 — "remove rank from profile
       tab", then "Remove rank from home"). Where you stand is the Stats chip's
       own page, which prints the place WITH its population; a bare "#4" beside
       two follower counts said less than it implied. Both are asserted here
       because a rank row reappearing on either is the regression. */
    /* ⚠ "global" is gone from the name (27 Sep 2026, the user: "remove global
       from name as only for india") — this names a control that is already
       absent on both screens, so it matches nothing either way; widened so it
       would still catch a regression under either word. */
    const rankLink = /^Rank \d+ of \d+ — open (global )?rankings$/;
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

    /* ⚠⚠ A STUDIO'S MEMBERSHIPS ARE ON THE STUDIO'S OWN HOME (21 Sep 2026, the
       user: "fix memberships for studio"), and this segment is re-cut to reach
       them the way a studio owner does — by pressing the tile. Until today that
       tile opened the prototype's "nothing here yet": the desk landed on 19 Sep
       at `/memberships` and nobody came back for the tile, so for two days the
       feature was live one address away from the only door to it. The other half
       is why this had to be an ADDRESS rather than a redirect: `/memberships`
       sold from "the first business you own", so an organization's second studio
       could not be reached at all. */
    await owner.goto(`/business/${businessId}`);
    await owner.getByRole("link", { name: "Memberships", exact: true }).click();
    await owner.waitForURL(new RegExp(`/business/${businessId}/memberships$`));
    await expect(owner.getByRole("heading", { name: "Memberships" })).toBeVisible();
    // the desk says WHOSE it is — an organization runs several studios
    await expect(owner.getByText(`What ${studioName} sells`)).toBeVisible();
    // and it is not the shrug it used to be
    await expect(owner.getByText("Class packs and plans this studio sells")).toHaveCount(0);

    // ── FOUR FIELDS AND NOTHING ELSE. It is free on purpose: a free membership
    // is granted on the press, which is the only way a browser test can hold a
    // real pass — a priced one opens Cashfree's own window.
    /* ⚠ THE FORM IS A SHEET OVER THIS DESK NOW (22 Sep 2026, ask 6) — it wore
       the Add class anatomy from 21 Sep and wears its own address no longer:
       `?new=1` on the desk that offered it, so the studio it sells for is the
       desk's own and `?business=` is not needed at all from here (it stays for
       `/memberships/new`, which is still a page — Rule 14). */
    await owner.getByRole("link", { name: "New membership" }).click();
    await owner.waitForURL(new RegExp(`/business/${businessId}/memberships\\?new=1$`));
    await expect(owner.getByRole("dialog", { name: "Add membership" })).toBeVisible();
    await expect(owner.getByRole("button", { name: "Name the membership first" })).toBeVisible();
    await owner.getByLabel("Membership name").fill(passName);
    /* hours only since 3 Oct 2026 — there is no Classes / Hours switch any more */
    await owner.getByLabel("How many hours").fill("2");
    // ⚠ no Continue: four fields, one page (22 Sep 2026)
    await owner.getByLabel("Price", { exact: true }).fill("0");
    await owner.getByLabel("Total memberships").fill("5");
    /* VALID FOR (3 Oct 2026): 30 · 60 · 90 days, 30 picked until another is */
    await expect(owner.getByRole("button", { name: "30 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await owner.getByRole("button", { name: "60 days", exact: true }).click();
    await expect(owner.getByRole("button", { name: "60 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await owner.getByRole("button", { name: "Put it on sale" }).click();
    await owner.getByRole("dialog", { name: "Put this on sale?" }).getByRole("button", { name: "Put it on sale" }).click();
    /* back to the desk that SENT them — it pushed `/memberships` whatever opened
       it, so a studio owner landed on a page that no longer lists what they made */
    await owner.waitForURL(new RegExp(`/business/${businessId}/memberships$`), { timeout: 20_000 });
    const card = owner.getByRole("link", { name: `Open ${passName}` });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // ── IT IS ON SALE ON THE STUDIO'S OWN PUBLIC PAGE, which is where the user
    // said it is bought — not on a desk somebody has to be told about
    await learner.goto(`/studio/${businessId}`);
    const onSale = learner.getByTestId("memberships-on-sale");
    await expect(onSale).toBeVisible({ timeout: 15_000 });
    await expect(onSale.getByText(passName)).toBeVisible();
    await expect(onSale.getByText("2 hours · valid 60 days · 5 left")).toBeVisible();

    /* ── AND A PERSON TAKES IT FROM THERE, through the PAYMENT STEP (19 Sep
       2026, the user: "Membership on profiles to have a better pay button and
       should take to payment option"). A free one says "no payment" in the same
       sheet rather than pretending there is a step to take. ── */
    await learner.getByRole("button", { name: `Buy ${passName}` }).click();
    const payStep = learner.getByRole("dialog", { name: "Confirm — no payment" });
    await expect(payStep).toBeVisible();
    await expect(payStep.getByText("2 hours")).toBeVisible();
    await expect(payStep.getByText("60 days from purchase")).toBeVisible();
    await expect(payStep.getByText("Free")).toBeVisible();
    await payStep.getByRole("button", { name: "Buy now" }).click();
    /* ── AND IT LANDS ON THE PASS ITSELF (2 Oct 2026, the user: "should take to …
       membership detail page after payment is done") — the tools' own
       Memberships section, open on the passes you hold, with the progress bar
       reading off real units — nothing used yet */
    await learner.waitForURL(/\/memberships\?show=booked$/, { timeout: 20_000 });
    const held = learner.getByTestId("my-pass").filter({ hasText: passName });
    await expect(held).toBeVisible({ timeout: 15_000 });
    /* BOOKED · MANAGE (19 Sep 2026, the user: "membership columns should be
       Booked and Manage") — the learner sells nothing, so they see no segments
       at all; the seller below sees both */
    // the bar is drawn from two real numbers, never a stored percentage
    await expect(held.getByTestId("pass-progress")).toHaveAttribute("data-pct", "0");
    await expect(held.getByTestId("pass-progress")).toHaveAttribute("aria-label", "0 of 2 used");
    /* a free pass is valid from the moment it is taken — the date is printed */
    await expect(held.getByTestId("pass-validity")).toContainText("Valid till");
    /* and they may not take a second one while one is live — the database's rule,
       and since 2 Oct 2026 the page's too: no Buy is offered, the row says it is
       theirs and opens the pass (the user: "should not show option to buy it if
       already active") */
    await learner.goto(`/studio/${businessId}`);
    await expect(learner.getByRole("button", { name: `Buy ${passName}` })).toHaveCount(0);
    await expect(learner.getByRole("link", { name: `${passName} — yours, open it` })).toBeVisible({ timeout: 15_000 });

    // ── THE SELLER TRACKS IT, per class and per student (the user's own words).
    // Nothing has been spent yet, so the honest answer is one holder at nothing
    // used — a figure and the list behind it being the same number (Step 25).
    await owner.goto(`/business/${businessId}/memberships`);
    /* ⚠ ONE SIDE, NOT TWO (21 Sep 2026): Booked · Manage are the two sides a
       PERSON has — what they hold and what they sell. A studio holds no passes,
       because a business is not a person (`guard_person_only`), so its own desk
       is the selling side alone and the switch is not drawn at all. ⚠ Nothing in
       this story sees BOTH segments any more: they belong to an artist, who
       holds passes and sells from their own page, and this story's artist sells
       no membership. Said out loud rather than left as a silent gap. */
    await expect(owner.getByRole("button", { name: /^Booked/ })).toHaveCount(0);
    await expect(owner.getByRole("button", { name: /^Manage/ })).toHaveCount(0);
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

  test("assets: what a business owns, three fields, and ₹0 meaning one it already had", async () => {
    /* ---- 21 Sep 2026, the user: "Fix assets for both artist, studio and
       organization. Make sure to just add name type of asset and price/ Old
       asset." The tile had opened the prototype's "nothing here yet" since
       18 Sep on an artist's grid and a studio's, and an ORGANIZATION never had
       the tile at all. Driven from the tile, because the tile is what was
       broken. ---- */
    const assetName = `E2E PA system ${stamp}`;

    await owner.goto(`/business/${businessId}`);
    await owner.getByRole("link", { name: "Assets", exact: true }).click();
    await owner.waitForURL(new RegExp(`/business/${businessId}/assets$`));
    await expect(owner.getByRole("heading", { level: 1, name: "Assets" })).toBeVisible();
    // it names the business, because an organization runs several
    await expect(owner.getByText(`What ${studioName} owns`)).toBeVisible();
    // and it is not the shrug it used to be
    await expect(owner.getByText("inventory and what it is worth")).toHaveCount(0);
    /* ⚠ the testid is on the FIGURE now, not on the whole line (22 Sep 2026):
       "INVENTORY · ₹0 total" became a heading, a rule and a figure, because the
       user asked for "a sprator between title and figure" on every counted head.
       Asserting the figure alone is the better test anyway — it was checking the
       heading's punctuation as well as the money. */
    /* ⚠ AND SINCE 4 Oct 2026 the count and the total are their own middle
       section, under Add asset (the user: "total assets count and total amount in
       middle section below add asset button") — two figures, each a tile */
    await expect(owner.getByTestId("assets-total")).toHaveText("₹0");
    await expect(owner.getByTestId("assets-count")).toHaveText("0");

    /* ⚠ THE FORM OPENS OVER THE DESK (22 Sep 2026, the user: "form for adding
       asset and adding room should be same way"). It was a card standing on this
       desk permanently — three fields above the very list they add to, whether or
       not you were adding anything — which is the shape the routine and
       membership forms were in before 21 Sep. */
    const addAsset = async (name: string, type: string, worth: string) => {
      await owner.getByRole("link", { name: "Add asset" }).click();
      const sheet = owner.getByRole("dialog", { name: "Add asset" });
      await expect(sheet).toBeVisible({ timeout: 15_000 });
      // ⚠ and the desk is still underneath, not navigated away from
      await expect(owner.getByRole("heading", { level: 1, name: "Assets" })).toBeVisible();
      // ── THE THREE FIELDS AND NOTHING ELSE (the user's own list)
      await sheet.getByLabel("Asset name").fill(name);
      await pick(sheet, "Type of asset", type);
      await sheet.getByLabel("What it is worth — 0 means you already had it").fill(worth);
      await sheet.getByRole("button", { name: "Add asset" }).click();
      await owner.getByRole("button", { name: "Add it" }).click();
      await expect(sheet).toBeHidden({ timeout: 15_000 });
    };

    /* the bar NAMES the missing answer rather than greying out (15573-15578), and
       ⚠ the VALUE is one of the answers it asks for: on the old card an empty box
       became `Number(value || 0)`, so not typing quietly filed the asset as one
       the business already had — a classPerson about money made by leaving a field alone */
    await owner.getByRole("link", { name: "Add asset" }).click();
    const empty = owner.getByRole("dialog", { name: "Add asset" });
    /* ⚠ ASKED FOR BY ACCESSIBLE NAME, not by text — the button carries no
       `aria-label`, so what a screen reader hears IS what the screen says. Five
       of these forms grew a fixed one on 22 Sep and this segment caught it. */
    await expect(empty.getByRole("button", { name: "Name the asset first" })).toBeVisible();
    await empty.getByLabel("Asset name").fill("x");
    await expect(empty.getByRole("button", { name: "Say what it is worth — ₹0 if you already had it" })).toBeVisible();
    // and system back closes it, leaving the desk exactly where it was
    await owner.goBack();
    await expect(empty).toBeHidden({ timeout: 15_000 });
    await expect(owner).toHaveURL(new RegExp(`/business/${businessId}/assets$`));

    await addAsset(assetName, "Sound & AV", "28000");
    const row = owner.getByTestId("asset-row").filter({ hasText: assetName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId("asset-value")).toHaveText("₹28,000");
    await expect(row.getByText("Sound & AV")).toBeVisible();
    // the total is COUNTED off the very rows it adds up (Step 25's rule)
    await expect(owner.getByTestId("assets-total")).toHaveText("₹28,000");
    await expect(owner.getByTestId("assets-count")).toHaveText("1");

    /* ⚠ ₹0 IS THE "OLD ASSET" ANSWER, not a missing one — the prototype's own
       `₹ (0 = old)` placeholder and its own "₹0 (legacy)" row (16792). There is
       no second control, because two ways to say one thing can disagree. */
    const legacyName = `E2E Mirrors ${stamp}`;
    await addAsset(legacyName, "Mirrors", "0");
    const legacy = owner.getByTestId("asset-row").filter({ hasText: legacyName });
    await expect(legacy.getByTestId("asset-value")).toHaveText("₹0 (legacy)", { timeout: 15_000 });
    // and it does not move the total, which is the point of counting it as zero — it moves the COUNT
    await expect(owner.getByTestId("assets-total")).toHaveText("₹28,000");
    await expect(owner.getByTestId("assets-count")).toHaveText("2");

    // ── EDIT IN PLACE, the prototype's own row edit (16823-16830)
    await row.getByRole("button", { name: `Edit ${assetName}` }).click();
    await owner.getByLabel(`What ${assetName} is worth`).fill("30000");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByTestId("asset-value")).toHaveText("₹30,000", { timeout: 15_000 });
    await expect(owner.getByTestId("assets-total")).toHaveText("₹30,000");

    // ── AND REMOVING ONE IS A SOFT DELETE the list stops carrying
    await legacy.getByRole("button", { name: `Remove ${legacyName}` }).click();
    await expect(owner.getByTestId("asset-row").filter({ hasText: legacyName })).toHaveCount(0, { timeout: 15_000 });

    /* ⚠ THE OWNER'S ALONE, and the database says so too (`is_business_owner` is
       the only SELECT policy on `assets`) — so the trainer, who is on this
       studio's team, never reads what its floor cost. A presentation gate over a
       real one, not instead of one.
       ⚠ THE LANDING MOVED ON 28 Sep 2026: it was the studio's own home, and a
       trainer cannot open that either now, so the bounce goes all the way out to
       the hub. Two gates in a row, and the outer one answers first. */
    await trainer.goto(`/business/${businessId}/assets`);
    await expect(trainer).toHaveURL(/\/business$/, { timeout: 15_000 });
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
    await owner.goto(`/business/${businessId}/staff`);

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
       what the row is. So the classPerson is made directly: the fallback words are
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
    await owner.goto(`/business/${businessId}/staff`);
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

    /* ⚠⚠ AND THE HISTORY IS A PAGE (29 Sep 2026, the user: "Team payment history
       to be a button called History which should show all transactions with that
       particular person on a different page"). The member sheet drew
       `paidTo(user).slice(0, 6)` under a heading that counted ALL of them, so a
       studio paying somebody monthly read twelve payments over six rows with no
       way to reach the rest — and a sheet is the wrong shape for a ledger. Both
       ends: the button is on the sheet, and the rows are on the page. */
    /* ⚠ AND THE MANAGE SHEET CARRIES NEITHER (3 Oct 2026, the user: *"manage page
       for team without option to see history and record payment in it"*) — the
       history is the card's own History button, paying its Pay button */
    await owner.getByRole("button", { name: `Manage ${learnerName}` }).click();
    await expect(memberSheet.getByText("September")).toHaveCount(0);
    await expect(memberSheet.getByRole("link", { name: /history/i })).toHaveCount(0);
    await expect(memberSheet.getByRole("button", { name: /record a payment|^Pay /i })).toHaveCount(0);
    await owner.reload();
    await owner.getByRole("link", { name: `History — ${learnerName}` }).click();
    await owner.waitForURL(new RegExp(`/business/${businessId}/staff/[0-9a-f-]+$`));
    await expect(owner.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(owner.getByText(learnerName).first()).toBeVisible();
    await expect(owner.getByText("₹2,500").first()).toBeVisible();
    await expect(owner.getByText("September")).toBeVisible();
    /* ⚠ `record_team_payment` writes a payout with NO session lines ON PURPOSE
       (19 Sep 2026, R35) — it is a salary, not a bill for sessions — so the page
       says that rather than drawing an empty list under it. */
    await expect(owner.getByText("Not against sessions — recorded as an amount.")).toBeVisible();
    await owner.getByRole("link", { name: "Back to the team" }).click();
    await owner.waitForURL(new RegExp(`/business/${businessId}/staff$`));

    await owner.goto(`/business/${businessId}/earnings`);
    await expect(owner.getByText("₹2,500").first()).toBeVisible({ timeout: 15_000 });

    // ── AND ORDERED. The owner arranges the team; a trainer cannot.
    await owner.goto(`/business/${businessId}/staff`);
    await owner.getByRole("button", { name: `Move ${learnerName} up` }).click();
    await expect(owner.getByRole("button", { name: `Move ${learnerName} up` })).toBeDisabled({ timeout: 20_000 });
    /* ⚠⚠ AND SINCE 28 Sep 2026 THE TRAINER DOES NOT REACH THE DESK AT ALL. This
       line read `toHaveCount(0)` on the Move buttons, which would now pass on the
       HUB it lands on instead — true, and for the wrong reason, which is the one
       kind of green worth nothing. The URL is what is asserted. */
    await trainer.goto(`/business/${businessId}/staff`);
    await expect(trainer).toHaveURL(/\/business$/, { timeout: 15_000 });
    await expect(trainer.getByRole("button", { name: /^Move / })).toHaveCount(0);

    /* ── A STUDENT IS NOT A LEAD ANY MORE (21 Sep 2026, the user: "Students
       section dont need to track a lead should just simply be able to send
       invite to a new user from here through mobile no. or email. rest all
       students are added automatically when they attend a class or take a
       membership").

       So this block proves the three halves of that sentence: the pipeline is
       GONE, a student arrives by CONSEQUENCE, and the invite is a real link
       rather than a send nothing can make. ⚠ The learner took one of this
       studio's memberships in the segment above, which is exactly the "or take
       a membership" case — so they must already be here, with nobody having
       typed them in. */
    await owner.goto(`/business/${businessId}/students`);
    await expect(owner.getByRole("button", { name: "Add a lead" })).toHaveCount(0);
    await expect(owner.getByText("Any stage")).toHaveCount(0);

    const learnerRow = owner.getByRole("link", { name: `Open ${learnerName}` });
    await expect(learnerRow).toHaveAttribute("href", `/person/${learnerId}`, { timeout: 15_000 });
    /* the card says WHY they are here — they hold a pass, so the MEMBER chip; not a
       stage somebody set. ⚠ Said ONCE since 4 Oct 2026 (the user: "no second line
       below name, member only as a chip on right"): the "🎟 {pass}" line is gone */
    const learnerCard = owner.getByTestId("student-card").filter({ has: learnerRow });
    await expect(learnerCard.getByTestId("student-member")).toHaveText("MEMBER");
    await expect(learnerCard.getByText("🎟")).toHaveCount(0);
    /* ONE BUTTON AND SIX BOXES (4 Oct 2026, the user: "remove all buttons and one
       common button called Student detail", then "headings - Attended, Booked,
       Hours, Turn Up, Routines, dance styles … d capital for detail") */
    await expect(learnerCard.getByRole("link", { name: `Student Detail — ${learnerName}` })).toHaveAttribute("href", `/business/${businessId}/students/${learnerId}`);
    await expect(learnerCard.getByRole("link", { name: /^(Profile|Stats|Membership) — / })).toHaveCount(0);
    for (const box of ["attended", "booked", "hours", "turnup", "routines", "styles"]) {
      await expect(learnerCard.getByTestId(`student-card-${box}`)).toHaveCount(1);
    }

    /* ── THE INVITE IS A HAND-OFF, and the link it hands off carries this
       studio's own page. There is no SMS provider and Resend reaches nobody but
       the account owner, so a "Send" button would be a door that does not open;
       what this asserts is the thing that DOES work from a phone. */
    await owner.getByRole("button", { name: "Invite a student" }).click();
    const inviteSheet = owner.getByRole("dialog", { name: "Invite a student" });
    await expect(inviteSheet).toBeVisible();
    await inviteSheet.getByLabel("Mobile number").fill("+91 98765 43210");
    const wa = inviteSheet.getByRole("link", { name: "WhatsApp" });
    await expect(wa).toHaveAttribute("href", new RegExp(`^https://wa\\.me/919876543210\\?text=.*${businessId}`));
    /* and the other half of the user's own sentence — "through mobile no. or email" */
    await inviteSheet.getByRole("button", { name: "Email" }).click();
    await inviteSheet.getByLabel("Email address").fill("someone@example.com");
    await expect(inviteSheet.getByRole("link", { name: "Open mail" })).toHaveAttribute("href", /^mailto:someone@example\.com\?subject=/);
    await inviteSheet.getByRole("button", { name: "Done" }).click();
    await expect(inviteSheet).toHaveCount(0);
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
    await owner.goto(`/business/${businessId}/classes/new`);
    await owner.getByLabel("Class date").fill(when.date);
    await pick(owner, "Starts", when.time);
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
    await owner.getByRole("button", { name: "Send request" }).click();
    await owner.getByRole("dialog", { name: "Send this request?" }).getByRole("button", { name: "Send request" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);

    // the person asked reads the ask in their own Inbox, naming the studio that
    // sent it — which is the whole of the bug, since the studio is a draft's away
    await learner.goto("/inbox");
    await pressPill(learner, /^Requests — \d+ waiting/);
    /* ⚠ A CLASS ASK IS A CLASS CARD SINCE 27 Sep 2026 (the user: "event and
       class request cards should also look like class and event cards on
       discover with accept and reject buttons"), so the row's own sentence —
       "wants to list you as the artist on {class}" — is gone with the row. What
       is drawn is the app's `ClassTile` for the class, with one line over it
       saying who is asking and as what. Both are asserted, because the card
       naming the right CLASS is the half the old wording carried. */
    await expect(learner.getByText(`wants you as`)).toBeVisible({ timeout: 15_000 });
    await expect(learner.getByTestId("request-row").filter({ hasText: "Salsa" })).toBeVisible();
    // and they say yes, so the only thing left in the way is the room
    await learner.getByRole("button", { name: "Accept Salsa · All levels" }).click();
    await expect(learner.getByText(/Accepted · you are the artist taking it/)).toBeVisible({ timeout: 15_000 });

    await owner.goto(`/business/${businessId}/classes`);
    await owner.getByRole("button", { name: /^Draft, \d+ classes$/ }).click();
    await owner.getByRole("button", { name: "Publish", exact: true }).click();
    const sheet = owner.getByRole("dialog", { name: "Publish this class?" });
    /* ⚠ FIFTEEN, NOT FIVE (21 Sep 2026) — and it is not a flake allowance, it is
       what this press actually waits on. The Publish button asks the room BEFORE
       it opens the sheet (`checkRoomClashAction`, F3), so the sheet does not
       exist until a server action has been out and back; on a loaded machine
       that round trip is the whole of the default five seconds, and the failure
       reads as "no clash warning" when the DOM has no dialog in it at all. The
       siblings that wait on a server re-render already have fifteen. */
    await expect(sheet.getByText(/ROOM ALREADY BUSY/)).toBeVisible({ timeout: 15_000 });
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
      await fetch(`${supabaseUrl}/rest/v1/classes?business_id=eq.${businessId}&title=eq.${encodeURIComponent("Salsa · All levels")}&select=status`, { headers: adminHeaders })
    ).json()) as Array<{ status: string }>;
    expect(rows.map((r) => r.status)).toEqual(["draft"]);
  });

  test("push 2: Call is a switch, and a profile's own stats page", async () => {
    // ---- push 2 (19 Sep 2026): the user's answers on the profile-page re-cut that needed schema ----
    // "2. Call is off for artist page by default but should have option to make
    // it available on profile and same for crew. … 4. stats page on any profile
    // should show all stats for that particular profile and rankings as well."

    /* ⚠⚠ ITEM 1 — "you add a user or artist in Team section for organization to
       label them as owner" — WENT ON 29 Sep 2026 with organizations, and it was
       the first third of this test: the organization's Team desk, its shared
       Add-a-team-member pill opening a sheet, "Ask as owner" through the one
       people picker, ASKED-IS-NOT-JOINED on the desk with the waiting tile at 1,
       a visitor reading NO Owner on the public page until the answer, the join
       card in the learner's own Inbox naming who invited them (which is what
       `20260926140000` existed to make readable), the answered ask moving to
       DONE, the owners tile at 1, the public row with its door to `/person/{id}`
       and its Owner word, and the two both-ends checks that no Stats chip is
       drawn and `/org/{id}/stats` redirects.
       ⚠ Item 3 had already gone on 26 Sep (an organization's pin moved off
       `set_my_place` onto its business row), so what this test still covers is
       items 2 and 4 — which is why its name is shorter now. */

    // ── 2a. CALL IS A SWITCH ON AN ARTIST'S PAGE — off by default. The trainer holds the
    // plan (ending, still active), so their sheet carries the switch and their page may dial.
    /* ⚠ THE SWITCH IS IN THE CONTACT SHEET SINCE 26 Sep 2026 — beside the number
       it governs, behind the pencil on Home */
    const sheet = trainer.getByRole("dialog", { name: "Contact buttons" });
    await openContacts(trainer);
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
    await openContacts(trainer);
    await expect(sheet.getByLabel("Phone")).toHaveValue("+91 90000 22222", { timeout: 15_000 });
    await expect(callSwitch).toHaveAttribute("aria-checked", "true");
    await callSwitch.click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toHaveCount(0);
    await learner.reload();
    await expect(learner.getByRole("link", { name: "Call" })).toHaveCount(0);
    // a plain user's sheet has no such switch: their page carries no buttons at all
    const userSheet = learner.getByRole("dialog", { name: "Contact buttons" });
    await openContacts(learner);
    await expect(userSheet.getByRole("switch", { name: "Show Call on my profile" })).toHaveCount(0);
    await userSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(userSheet).toHaveCount(0);

    // ── 2b. AND ON A CREW'S PAGE — the leader's switch, in the crew's contact
    // sheet. The policy on crew_contacts IS the switch: off, no reader gets the
    // number through any door.
    /* ⚠ THE PENCIL IS BACK ON THE CREW'S CORNER (26 Sep 2026), and it toggles edit
       mode; Settings carries NO Edit crew tile any more — both ends asserted */
    await learner.goto(`/crews/${crewId}/manage`);
    await expect(learner.getByRole("button", { name: "Edit crew" })).toHaveCount(0);
    await learner.getByRole("button", { name: "Settings", exact: true }).click();
    const crewSettings = learner.getByRole("dialog", { name: "Settings" });
    await expect(crewSettings.getByText("THIS CREW")).toBeVisible();
    await expect(crewSettings.getByRole("link", { name: "Edit crew", exact: true })).toHaveCount(0);
    /* the words — name, city, the first style — are still `?edit=1`, reached
       from the Edit details chip; the number is the contact sheet */
    await learner.goto(`/crews/${crewId}/manage`);
    await enterEditMode(learner);
    await learner.getByRole("link", { name: "Edit details" }).click();
    const crewWords = learner.getByRole("dialog", { name: "Edit crew" });
    await expect(crewWords).toBeVisible({ timeout: 15_000 });
    await expect(crewWords.getByLabel("Phone")).toHaveCount(0);
    await crewWords.getByRole("button", { name: "Cancel" }).click();
    await expect(crewWords).toHaveCount(0);
    const crewSheet = await openContacts(learner, `/crews/${crewId}/manage`);
    const crewSwitch = crewSheet.getByRole("switch", { name: "Show Call on the crew's page" });
    await expect(crewSwitch).toHaveAttribute("aria-checked", "false");
    await crewSheet.getByLabel("Phone").fill("+91 90000 33333");
    await crewSwitch.click();
    await crewSheet.getByRole("button", { name: "Save" }).click();
    await expect(crewSheet).toHaveCount(0);
    await trainer.goto(`/crew/${crewId}`);
    await expect(trainer.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919000033333", { timeout: 15_000 });
    await expect(trainer.getByRole("link", { name: "Stats", exact: true })).toHaveAttribute("href", `/crew/${crewId}/stats`);

    // ── 3. DELETED 26 Sep 2026: "an organization's pin lives in its Edit PROFILE
    // sheet" — the organization login is retired, `set_my_place` is dropped, and
    // an organization's pin is its BUSINESS row's, set from the business's own
    // Edit sheet the way a studio's is (scripts/shots/shoot-location.js drives
    // that map). The owner's own Edit profile is a person's: no map block, and
    // no Call switch either, because they hold no artist plan.
    const ownerSheet = owner.getByRole("dialog", { name: "Edit profile" });
    await openEditProfile(owner);
    await expect(ownerSheet.getByText("On the map")).toHaveCount(0);
    await expect(ownerSheet.getByRole("switch", { name: "Show Call on my profile" })).toHaveCount(0);
    await ownerSheet.getByRole("button", { name: "Cancel" }).click();
    await expect(ownerSheet).toHaveCount(0);

    // ── 4. SOMEBODY ELSE'S RECORD AND RANK — one page shape for four kinds of profile.
    // A place is never printed without its denominator, and an empty board is said,
    // not drawn as "#0" (Step 25's rule): the assertions accept either honest answer.
    /* ⚠ THE STANDINGS ARE THE RANKINGS COLUMN (29 Sep 2026) — `?tab=charts` is
       how this page is opened at it, since the screen opens on Record. */
    const standing = /of \d+ (dancers?|artists?|studios?|crews?)|Not on this board yet/;
    await learner.goto(`/person/${trainerId}/stats?tab=charts`);
    await expect(learner.getByRole("heading", { name: trainerName })).toBeVisible();
    await expect(learner.getByTestId("standing-card")).toHaveCount(2);
    await expect(learner.getByTestId("standing-card").first()).toContainText(standing);
    await learner.goto(`/crew/${crewId}/stats?tab=charts`);
    await expect(learner.getByRole("heading", { name: crewName })).toBeVisible();
    await expect(learner.getByTestId("standing-card")).toHaveCount(2);
    await expect(learner.getByTestId("standing-card").first()).toContainText(standing);
    /* a STRANGER reads a listed studio's — but a plain user's is still a
       signed-in page. ⚠ A public ORGANIZATION's was read here too until
       29 Sep 2026, by its business id, and asserted to list no studios. */
    const guestContext = await browserRef.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.goto(`/studio/${businessId}/stats?tab=charts`);
      await expect(guest.getByRole("heading", { name: studioName })).toBeVisible();
      await expect(guest.getByTestId("standing-card")).toHaveCount(2);
      await expect(guest.getByTestId("standing-card").first()).toContainText(standing);
      /* ⚠ AND A SIGNED-OUT READER IS TOLD WHERE THE BOARDS ARE RATHER THAN
         MEETING AN ERROR (29 Sep 2026). `dance_chart` is granted to
         `authenticated` only — "a person's activity is not public data" (Step
         25) — so the standings above are public and the four boards are not. */
      await expect(guest.getByText("Sign in to browse the boards")).toBeVisible();
      await guest.goto(`/person/${learnerId}/stats`);
      await guest.waitForURL(/\/login/);
    } finally {
      await guestContext.close();
    }
  });

  test("the team by the profile you are in: two granted powers, the owner seat handed over, and a seat that is not a class", async () => {
    // ---- 20 Sep 2026: the user's answers on the team slice ----
    // "1. permission given by Artist or Studio for managing Attendance and Refunds.
    //  2. [relabelling away from Studio owner silently takes the seat back] Fix in
    //  best way. 3. [no way to make somebody an owner from the studio's own desk]
    //  Yes and should be able to switch profile for that studio from profile
    //  switcher. 5. [associations are seats, not history] fix in best way."
    //
    // ⚠ Rule 9 in an e2e: one of the controls below hands out a REAL OWNER SEAT on
    // a studio (part 2, the studio's own desk). ⚠ 26 Sep 2026: the OTHER door to
    // a seat — the organization's "Studio owner" label — is DELETED with the
    // organization login (an organization runs no studios; `studio_owner` is
    // refused by ask_organization_member and set_organization_member_role), so
    // the parts that drove it (the four labels, the grant, the relabel putting
    // the prior seat back) are gone from this segment.

    // ── 1. THE TWO STANDING POWERS are the studio's to grant, and only those two.
    // Everything else a seat carries is decided by the seat; these two are the ones
    // an owner hands out per person, because the database keeps them per person.
    await owner.goto(`/business/${businessId}/staff`);
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

    /* ── 3. DELETED IN TWO STEPS. On 26 Sep 2026 it lost "the organization's four
       labels, and the one that is not a word" — the `Studio owner · {studio}`
       option, the seat it wrote on the studio's desk and the Studio owners group
       on the organization's page — because an organization stopped running
       studios. What was left was the organization's Team desk offering the three
       labels that remained and never a studio, driven through the portalled
       PickSheet and closed with BACK to assert `useCloseOnBack`'s own contract.
       ⚠ On 29 Sep 2026 that went too, with organizations. The PickSheet's
       back-closes contract is still driven — by the enquiry-types sheet and by
       the class form's pickers — so what is lost here is the ORGANIZATION's team
       vocabulary and nothing about the control. */

    /* ── 4. ⚠⚠ THE STUDIO IS A HOME ONLY WHILE THE SEAT RUNS IT (28 Sep 2026, the
       user: "only these 2 get the right to get studio or organization in the
       profile switcher. that profile switcher and rights should never be given
       for faculty, visiting faculty, assistant, event team or other team
       members").

       This block used to prove the opposite — that Faculty gets the row, and
       "what the seat decides is what they may DO once there". It is the same
       person read twice now, which is the strongest version of the check the
       segment can make: they were made an Owner above and put back to Faculty a
       few lines later, so BOTH ends are the same human and the same studio, and
       the only thing that moved is the word on their seat. */
    const studioRow = () => learner.getByRole("menuitem", { name: new RegExp(studioName) });

    await learner.goto("/");
    await learner.getByRole("button", { name: "Switch profile" }).click();
    /* ⚠ a MENUITEM, not a link: the switcher is a menu (`aria-haspopup="menu"`),
       so its rows carry that role however they are rendered. */
    await expect(studioRow()).toHaveCount(0, { timeout: 15_000 });
    await learner.goto(`/business/${businessId}`);
    await expect(learner).toHaveURL(/\/business$/, { timeout: 20_000 });

    /* …and made an Owner again, both come back — so the gate is the SEAT and not
       something that merely happened to this account once */
    await owner.goto(`/business/${businessId}/staff`);
    await owner.getByRole("button", { name: `Manage ${learnerName}` }).click();
    await owner.getByRole("dialog", { name: learnerName }).getByRole("button", { name: `Make ${learnerName} Owner` }).click();
    await expect(owner.getByRole("status")).toContainText("Owner", { timeout: 15_000 });

    await learner.goto("/");
    await learner.getByRole("button", { name: "Switch profile" }).click();
    await expect(studioRow()).toBeVisible({ timeout: 15_000 });
    await expect(studioRow()).toHaveAttribute("href", `/business/${businessId}`);
    await studioRow().click();
    await learner.waitForURL(`**/business/${businessId}`, { timeout: 20_000 });
    await expect(learner.getByRole("heading", { name: studioName })).toBeVisible({ timeout: 15_000 });

    /* ⚠ and back to Faculty, because the rest of this segment is written against
       that seat — an OWNER's row carries no "Manage …" control at all (above), so
       block 6 would have nothing to press */
    await owner.getByRole("dialog", { name: learnerName }).getByRole("button", { name: `Make ${learnerName} Faculty` }).click();
    await expect(owner.getByRole("status")).toContainText("Faculty", { timeout: 15_000 });

    // ── 5. A SEAT IS NOT A CLASS TAUGHT — the user's answer 5. Two groups, two
    // different facts: where somebody is on the team, and where they have published.
    await trainer.goto(`/person/${learnerId}`);
    /* "Studios" since 27 Sep 2026 — one group with the title on the row, where
       21 Sep had four headings; the fact under it is unchanged (a SEAT held,
       which is what this check is about) */
    await expect(trainer.getByText("Studios", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(trainer.getByRole("link", { name: new RegExp(`Open ${studioName}`) }).first()).toBeVisible();

    /* ── 6. DELETED IN TWO STEPS, like block 3. On 26 Sep 2026 it lost "moving the
       label away puts back what it replaced" (20260920140000), there being no
       Studio owner label left to move away from and therefore no seat to put
       back; what remained was that relabelling on the ORGANIZATION's desk moved
       a word and left the STUDIO's desk alone. ⚠ On 29 Sep that went with
       organizations too. The studio seat this block ended by re-reading is
       asserted at line 3026 above, where the sheet is still open. */
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
    /* ⚠ THE FORM IS A SHEET OVER THE DESK NOW (22 Sep 2026, ask 6): the same
       Add class anatomy it took on 21 Sep, opened from the desk's own address
       with `?new=1` rather than a page away. `/routines/new` still renders the
       page (Rule 14), which `shoot-tiles.js` drives by URL. */
    await trainer.getByRole("link", { name: "New routine" }).click();
    await trainer.waitForURL(/\/routines\?new=1$/);
    await expect(trainer.getByRole("dialog", { name: "Add routine" })).toBeVisible();
    await expect(trainer.getByRole("button", { name: "Name the routine first" })).toBeVisible();
    await trainer.getByLabel("Routine name").fill(routineName);
    // ⚠ no Continue: five fields, one page (22 Sep 2026)
    // ⚠ NO SONG NAME FIELD since 19 Sep 2026 (the user: "just remove song name
    // from the add routine form") — the link or the MP3 IS the song
    await expect(trainer.getByLabel("Song name")).toHaveCount(0);
    await trainer.getByLabel("Song link").fill("https://youtu.be/ilahi-instrumental");
    await trainer.getByLabel("Video link").fill("https://youtu.be/breath-release");
    await trainer.getByRole("button", { name: "Save routine" }).click();
    await trainer.getByRole("dialog", { name: "Save this routine?" }).getByRole("button", { name: "Save routine" }).click();
    await trainer.waitForURL(/\/routines$/, { timeout: 20_000 });
    /* ⚠ THE ROW IS A CONTAINER, NOT A LINK (3 Oct 2026): a link holding the song
       and video links was invalid HTML and failed hydration, so the row is a
       `routine-row` with one link stretched over it — found by the link's name */
    const row = trainer.getByTestId("routine-row").filter({ has: trainer.getByRole("link", { name: `Open ${routineName}`, exact: true }) });
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
    /* ⚠ THREE COLUMNS SINCE 4 Oct 2026 — Classes · Studios · Students. Classes
       opens first (the user: "routine details 1st column classes with class
       list"): the one class it is on, a card that opens the class. */
    await expect(trainer.getByTestId("routine-class")).toHaveCount(1);
    await expect(trainer.getByTestId("routine-class").getByRole("link", { name: /^Open / })).toHaveCount(1);
    /* then Studios: the studio the class is danced at, its row open, the class
       inside it. And Delete is one word on the card's top right, behind a confirm. */
    await trainer.getByRole("link", { name: `Where ${routineName} is danced` }).click();
    await expect(trainer).toHaveURL(/show=studios/);
    await expect(trainer.getByTestId("routine-studio")).toHaveCount(1);
    await expect(trainer.getByTestId("routine-studio").getByRole("button", { expanded: true })).toBeVisible();
    await expect(trainer.getByTestId("routine-studio").getByRole("link", { name: /^Open / }).first()).toBeVisible();
    await expect(trainer.getByRole("button", { name: `Delete ${routineName}` })).toBeVisible();
    await expect(trainer.getByRole("link", { name: `Open the video for ${routineName}` })).toHaveText("Video");
    /* the Students column, pressed in place — and the rule in the page's own words:
       a dancer is somebody CHECKED IN to a session, never somebody who booked one */
    await trainer.getByRole("link", { name: `Who learned ${routineName}` }).click();
    await expect(trainer).toHaveURL(/show=students/);
    await expect(trainer.getByText(/once they are checked in to a session taught from it/)).toBeVisible();

    // ── and now the same routine after a session has actually RUN. The session is
    // back-dated and the register written with the service role — the two things
    // no user may do, and the same pair `scripts/demo-data.js` uses to make a past
    // class exist. This is the last segment, so nothing downstream reads the date.
    const cls = (await (await fetch(`${supabaseUrl}/rest/v1/classes?share_slug=eq.${shareSlug}&select=id,business_id`, { headers: adminHeaders })).json()) as Array<{ id: string; business_id: string }>;
    const ses = (await (await fetch(`${supabaseUrl}/rest/v1/class_sessions?class_id=eq.${cls[0].id}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    const bk = (await (await fetch(`${supabaseUrl}/rest/v1/class_bookings?session_id=eq.${ses[0].id}&user_id=eq.${learnerId}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
    const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    /* ⚠⚠ BOTH SET-UP WRITES ARE CHECKED, AND THAT IS THE POINT (29 Sep 2026).
       They were fired and forgotten, so a PATCH that did not land left the
       session in the FUTURE — where `my_routines` correctly counts nothing — and
       the test then reported `routine-sessions` as "0" against an expected "1".
       That reads as a product bug and is a failed fixture. A write whose status
       nobody reads is this file's own recurring lesson (20 Sep: "a cleanup that
       does not read its own status is not a cleanup"), and here it cost a run. */
    const back = await fetch(`${supabaseUrl}/rest/v1/class_sessions?id=eq.${ses[0].id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ starts_at: ago(3), ends_at: ago(2) }) });
    expect(back.ok, `back-dating the session failed: ${back.status} ${await back.clone().text()}`).toBe(true);
    const att = await fetch(`${supabaseUrl}/rest/v1/attendance`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ class_booking_id: bk[0].id, session_id: ses[0].id, class_id: cls[0].id, business_id: cls[0].business_id, user_id: learnerId, created_by: ownerId, updated_by: ownerId }),
    });
    expect(att.ok, `writing the attendance row failed: ${att.status} ${await att.clone().text()}`).toBe(true);
    await trainer.reload();
    /* ⚠ fifteen seconds, like every other post-mutation assertion in this suite
       (the style chip 19 Sep, "Since 2016" 18 Sep, `You're booked` 28 Sep): the
       count is a server read behind a reload, and on a busy worker that outruns
       the default five. */
    await expect(trainer.getByTestId("routine-sessions")).toHaveText("1", { timeout: 15_000 });
    await expect(trainer.getByTestId("routine-dancers")).toHaveText("1", { timeout: 15_000 });
    // and the people are named, with how many of its sessions each turned up to
    await expect(trainer.getByRole("link", { name: `Open ${learnerName}'s profile` })).toBeVisible();
    /* the section head draws its title and its count as two pieces since the 3 Oct
       redesign (FigureHead), so the count is the dancers figure above, and the
       empty-state sentence must be GONE now that somebody has danced it */
    await expect(trainer.getByText("STUDENTS WHO LEARNED IT", { exact: true })).toBeVisible();
    await expect(trainer.getByText(/once they are checked in to a session taught from it/)).toHaveCount(0);

    // ── somebody else's routine is not theirs to see, and not on their desk
    const routineUrl = trainer.url();
    const seen = await learner.goto(routineUrl);
    expect(seen?.status()).toBe(404);
    await learner.goto("/routines");
    await expect(learner.getByRole("link", { name: `Open ${routineName}` })).toHaveCount(0);
  });

});
