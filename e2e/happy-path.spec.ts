import { test, expect, type Page } from "@playwright/test";

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

test("signup → onboard studio → create class → share link → enroll", async ({ browser }) => {
  test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local or env)");

  const stamp = Date.now().toString(36);
  const studioName = `E2E Studio ${stamp}`;
  const classTitle = `E2E Bollywood ${stamp}`;

  let ownerId: string | null = null;
  let learnerId: string | null = null;
  let trainerId: string | null = null;
  let tenantId: string | null = null;

  const ownerContext = await browser.newContext();
  const learnerContext = await browser.newContext();
  const trainerContext = await browser.newContext();

  try {
    // ---- studio owner: signup → onboarding -------------------------------
    const owner = await ownerContext.newPage();
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
    const trainer = await trainerContext.newPage();
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
    const registerTile = owner.locator(`[aria-label="Open ${classTitle}"]`);
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

    // ---- the class detail page + its booking link (Step 8) ----------------
    await owner.goto(`/business/${tenantId}/classes`);
    await registerTile.click();
    await owner.waitForURL(/\/c\/[a-z0-9-]+$/);
    const shareSlug = owner.url().match(/\/c\/([a-z0-9-]+)$/)?.[1] ?? "";
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
    const learner = await learnerContext.newPage();
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

    // ---- Step 15: the studio's public page — found on Discover, followed, and
    // its schedule opened. The follower figure is counted, not stored.
    await learner.goto("/discover?city=Pune&tab=studios");
    await learner.getByRole("link", { name: `Open ${studioName}` }).click();
    await learner.waitForURL(/\/studio\/[0-9a-f-]+$/);
    const studioUrl = learner.url();
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

    // a stranger — no account at all — reads the same page and is offered Follow
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.goto(studioUrl);
      await expect(guest.getByText(studioName).first()).toBeVisible();
      await expect(guest.getByRole("link", { name: "Follow" })).toBeVisible();
      await expect(guest.getByTestId("followers-count")).toHaveText("1");
    } finally {
      await guestContext.close();
    }
  } finally {
    // tenant delete cascades classes → sessions → enrollments; user delete
    // cascades the profiles. Cleanup failures surface but don't mask the test.
    if (tenantId) {
      await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
    }
    if (ownerId) await deleteUser(ownerId);
    if (learnerId) await deleteUser(learnerId);
    if (trainerId) await deleteUser(trainerId);
    await ownerContext.close();
    await learnerContext.close();
    await trainerContext.close();
  }
});
