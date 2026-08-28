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

/** Fill the onboarding screen (name → role tile → city) and submit. */
async function onboard(page: Page, first: string, last: string, role: string | null, city: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByPlaceholder("First name").fill(first);
  await page.getByPlaceholder("Last name").fill(last);
  if (role) {
    await page.getByText(role, { exact: true }).click();
  }
  await page.locator('input[name="city"]').fill(city);
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
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

  let ownerId: string | null = null;
  let learnerId: string | null = null;
  let trainerId: string | null = null;
  let tenantId: string | null = null;

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
  let owner: Page;
  let learner: Page;
  let trainer: Page;
  let browserRef: Browser;

  test.beforeAll(async ({ browser }) => {
    browserRef = browser;
    ownerContext = await browser.newContext();
    learnerContext = await browser.newContext();
    trainerContext = await browser.newContext();
    owner = await ownerContext.newPage();
    learner = await learnerContext.newPage();
    trainer = await trainerContext.newPage();
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
    await ownerContext.close();
    await learnerContext.close();
    await trainerContext.close();
  });

  test("a studio signs up, onboards, and publishes a class with a room and a trainer", async () => {
    // ---- studio owner: signup → onboarding -------------------------------
    ownerId = await signUp(owner, `e2e-owner-${stamp}@example.com`);
    await onboard(owner, "E2E", "Owner", "Studio", "Pune");

    // ---- create the studio ------------------------------------------------
    await owner.goto("/business");
    await owner.getByText("＋ Add studio or business").click();
    await owner.locator('input[name="name"]').fill(studioName);
    await owner.locator('input[name="area"]').fill("Baner");
    const citySelect = owner.locator('select[name="city"]');
    await citySelect.selectOption("Pune");
    await expect(citySelect).toHaveValue("Pune");
    await owner.getByRole("button", { name: "Create studio" }).click();

    // the action refreshes the hub in place — the new studio is a row now
    const studioRow = owner.getByText(studioName);
    await expect(studioRow).toBeVisible();

    // ---- create + publish a class ----------------------------------------
    await studioRow.click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes/);
    tenantId = owner.url().match(/\/business\/([0-9a-f-]+)\/classes/)?.[1] ?? null;

    // ---- add a room, so the class has somewhere to be (Step 11) -----------
    await owner.getByRole("link", { name: "Rooms ›" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/rooms$/);
    await owner.getByRole("button", { name: "Add room" }).click();
    const roomName = owner.getByLabel("Room 1 name");
    await expect(roomName).toBeVisible();
    await roomName.fill("Studio A");
    await roomName.blur();
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
    // they show as asked-but-unanswered, and the QR the prototype promised is here
    await expect(owner.getByText(/Invited — waiting on them to accept/)).toBeVisible();
    await owner.getByRole("button", { name: "Show the invite for E2E Trainer" }).click();
    const qrSheet = owner.getByRole("dialog", { name: "Invite for E2E Trainer" });
    await expect(qrSheet.getByRole("img", { name: /Invite code/ })).toBeVisible();
    await expect(qrSheet.getByText(/\/join\/[0-9a-f]+/)).toBeVisible();
    await qrSheet.getByRole("button", { name: "Done" }).click();

    // ---- the trainer signs up and finds the invite waiting for them --------
    trainerId = await signUp(trainer, trainerEmail);
    await onboard(trainer, "E2E", "Trainer", "Artist / Trainer", "Pune");
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
    await owner.getByText("Bollywood", { exact: true }).click();
    await owner.getByLabel("Class name").fill(classTitle);
    await owner.getByRole("button", { name: "Hold it in Studio A" }).click();
    await owner.getByRole("button", { name: /Next · people & price/ }).click();
    // the room now defines the capacity (prototype: "defined by Studio A")
    await expect(owner.getByText(/defined by Studio A/)).toBeVisible();
    // and the payoff of Step 12b: the artist picker finally has somebody to
    // offer, because a real person accepted a real invite
    await expect(owner.getByRole("button", { name: "E2E Trainer takes this class" })).toBeVisible();
    // Step 13: put them on it AT A RATE. The rate field is the owner's alone —
    // a trainer's form never shows it, and the RPCs refuse it from anybody else.
    await owner.getByRole("button", { name: "E2E Trainer takes this class" }).click();
    await owner.getByLabel("What a session pays the artist").fill("900");
    // step 2 — people & price. Free trial: the ₹300 default would route booking
    // through Razorpay (Step 9), which the paid-webhook spec covers.
    await owner.getByLabel("Price per session").fill("0");
    await owner.getByRole("button", { name: "Publish" }).click();

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
    // back to Details so the share step below finds the poster
    await owner.getByRole("button", { name: "Details" }).click();

    // sharing lives behind the poster now — the pass sheet carries the link (Step 10)
    await owner.getByRole("button", { name: "Open the pass" }).click();
    const sheet = owner.getByRole("dialog", { name: "Class pass" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(`/c/${shareSlug}`)).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();

    // ---- learner: signup → onboard → open the shared link → book ----------
    learnerId = await signUp(learner, `e2e-learner-${stamp}@example.com`);
    await onboard(learner, "E2E", "Learner", null, "Pune");

    // booking is two steps now (Step 9): the bar opens the confirm sheet, and a
    // free class confirms without payment
    await learner.goto(`/c/${shareSlug}`);
    // AT THE STUDIO carries what the room has in it (Step 11)
    await expect(learner.getByText("🪞 Mirrors")).toBeVisible();
    // what the class made is the studio's business, not the room's
    await expect(learner.getByText("WHAT THIS SESSION MADE")).toHaveCount(0);
    await learner.getByRole("button", { name: "Book free trial" }).click();
    const confirmSheet = learner.getByRole("dialog", { name: "Confirm — no payment" });
    await expect(confirmSheet).toBeVisible();
    await confirmSheet.getByRole("button", { name: "Confirm free trial" }).click();
    await expect(learner.getByText(/You.re booked/)).toBeVisible();

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
    // and the follow shows on their own profile
    await learner.goto("/profile");
    await expect(learner.getByRole("link", { name: new RegExp(studioName) })).toBeVisible();

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
    await enqSheet.getByRole("button", { name: "City" }).click();
    await enqSheet.getByRole("button", { name: "Pune", exact: true }).click();
    await enqSheet.getByLabel("Message").fill("Eight evening sessions before a wedding.");
    await enqSheet.getByRole("button", { name: "Send enquiry" }).click();
    await expect(enqSheet.getByText("Enquiry sent")).toBeVisible();
    await enqSheet.getByRole("button", { name: "Done" }).click();

    await owner.goto("/inbox");
    await expect(owner.getByText("1 waiting on you")).toBeVisible();
    await owner.getByRole("button", { name: /^Enquiries — 1 waiting/ }).click();
    await owner.getByRole("link", { name: "Private Sessions enquiry from E2E Learner" }).click();
    await owner.waitForURL(/\/inbox\/enquiries\/[0-9a-f-]+$/);
    await expect(owner.getByText("WHAT THEY ASKED FOR")).toBeVisible();
    await owner.getByRole("button", { name: "Send a quote" }).click();
    await owner.getByLabel("Project cost").fill("5000");
    await owner.getByRole("button", { name: "Send this quote" }).click();
    await expect(owner.getByTestId("enquiry-stage")).toHaveText("Quoted");

    await learner.goto("/inbox");
    await learner.getByRole("button", { name: /^Enquiries/ }).click();
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
    await owner.goto(`/business/${tenantId}/classes`);
    await owner.getByRole("link", { name: "Events ›" }).click();
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/events$/);
    await owner.getByRole("link", { name: "Create event" }).click();
    await owner.waitForURL(/\/events\/new$/);
    await owner.getByRole("button", { name: "Showcase", exact: true }).click();
    await owner.getByLabel("Event name").fill(eventTitle);
    await owner.getByLabel("Dance style").selectOption("All styles");
    inTwelveDays = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await owner.getByLabel("First day").fill(inTwelveDays);
    await owner.getByLabel("Venue name").fill("E2E Hall");
    await owner.getByLabel("City", { exact: true }).selectOption("Pune");
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
    await expect(learner.getByTestId("held-booking")).toBeVisible();
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
    await learner.getByLabel("Dance style").selectOption("Hip-Hop");
    await learner.getByRole("button", { name: "Add a member" }).click();
    await learner.getByLabel("Search DanceOS for a dancer").fill("E2E Trainer");
    await learner.getByRole("button", { name: "Add E2E Trainer to the crew" }).click();
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
    await trainer.getByRole("button", { name: /^Requests — \d+ waiting/ }).click();
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
    await owner.goto(`/business/${tenantId}/events/new`);
    await owner.getByRole("button", { name: "Battle Tournament", exact: true }).click();
    await owner.getByLabel("Event name").fill(battleTitle);
    await owner.getByLabel("Dance style").selectOption("All styles");
    await owner.getByLabel("First day").fill(inTwelveDays);
    await owner.getByLabel("Venue name").fill("E2E Arena");
    await owner.getByLabel("City", { exact: true }).selectOption("Pune");
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
    await learner.getByLabel("Search DanceOS").fill("E2E Studio");
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
    await owner.getByRole("button", { name: /^Bookings — \d+ updates?$/ }).click();
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
    await learner.getByRole("link", { name: "Open E2E Trainer's profile" }).click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);
    // exact: Next's route announcer carries the page TITLE ("E2E Trainer — DanceOS"),
    // which a loose match picks up as a second element the moment a navigation is fresh
    await expect(learner.getByText("E2E Trainer", { exact: true })).toBeVisible();
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
    await learner.getByLabel("Search DanceOS").fill("E2E Trainer");
    await expect(learner.getByText("People")).toBeVisible();
    await learner.getByRole("option", { name: /^E2E Trainer — Artist/ }).click();
    await learner.waitForURL(/\/person\/[0-9a-f-]+$/);

    // the crew's public roster opens its people too, and the trainer's own page
    // says it is theirs rather than offering them a Follow button
    await trainer.goto(`/crew/${crewId}`);
    await trainer.getByRole("link", { name: "Open E2E Trainer's profile" }).click();
    await trainer.waitForURL(/\/person\/[0-9a-f-]+$/);
    await expect(trainer.getByRole("link", { name: /This is you/ })).toBeVisible();
    await expect(trainer.getByRole("button", { name: "Follow" })).toHaveCount(0);
    // and the photo: the file goes from THIS browser straight to Storage with the
    // trainer's own session (the proof covers the rules; only a browser can cover
    // the upload), the row records the path, and the square stops being initials
    await expect(trainer.locator("img")).toHaveCount(0);
    // the control says "Add a photo" until there is one, and "Change your photo" after
    await trainer.getByLabel("Add a photo").setInputFiles({
      name: "face.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"),
    });
    await expect(trainer.locator("img").first()).toBeVisible({ timeout: 20_000 });
    await expect(trainer.getByLabel("Change your photo")).toBeAttached();
    // taking it down puts the initials back
    await trainer.getByRole("button", { name: "Remove the photo" }).click();
    await expect(trainer.locator("img")).toHaveCount(0);
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
    await owner.getByRole("link", { name: "Everything you manage" }).click();
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
    await expect(learner.getByRole("link", { name: "Everything you manage" })).toHaveCount(0);
    await learner.goto("/managed");
    await expect(learner.getByText("Nothing here yet")).toBeVisible();
    await expect(learner.getByRole("link", { name: "Set up a business" })).toBeVisible();
  });
});
