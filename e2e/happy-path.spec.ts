import { test, expect, type Page } from "@playwright/test";

/**
 * The MVP happy path (CLAUDE.md Step 6): signup → onboard studio → create
 * class → enroll. Runs against the dev server + the linked Supabase project.
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

async function deleteUser(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
}

test("signup → onboard studio → create class → enroll", async ({ browser }) => {
  test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local or env)");

  const stamp = Date.now().toString(36);
  const studioName = `E2E Studio ${stamp}`;
  const classTitle = `E2E Bollywood ${stamp}`;

  let ownerId: string | null = null;
  let learnerId: string | null = null;
  let tenantId: string | null = null;

  const ownerContext = await browser.newContext();
  const learnerContext = await browser.newContext();

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

    await owner.getByText("Create class").click();
    await owner.getByText("Bollywood", { exact: true }).click();
    await owner.locator('input[name="title"]').fill(classTitle);
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await owner.locator('input[name="date"]').fill(inThreeDays);
    await owner.getByRole("button", { name: "Publish" }).click();

    // back on the register, the class sits under the Published tab — the tile
    // headlines the STYLE (a class is its style, per the prototype), so the
    // title only appears in the tile's aria-label
    await owner.waitForURL(/\/business\/[0-9a-f-]+\/classes$/);
    await expect(owner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();

    // ---- learner: signup → onboard (Dancer is the default role) → book ----
    const learner = await learnerContext.newPage();
    learnerId = await signUp(learner, `e2e-learner-${stamp}@example.com`);
    await onboard(learner, "E2E", "Learner", null, "Pune");

    await learner.goto("/classes");
    const tile = learner.locator(`[aria-label="Open ${classTitle}"]`);
    await expect(tile).toBeVisible();
    await tile.getByRole("button", { name: "Book a spot" }).click();
    await expect(tile.getByText("Enrolled ✓")).toBeVisible();

    // the booking shows up on the learner's own list too
    await learner.goto("/my-classes");
    await expect(learner.locator(`[aria-label="Open ${classTitle}"]`)).toBeVisible();
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
    await ownerContext.close();
    await learnerContext.close();
  }
});
