import { test, expect, type Page } from "@playwright/test";

/**
 * Auth is email + password as of 7 Sep 2026 (CLAUDE.md "Deliberate deviations
 * from the prototype"). This covers the paths that do not need an inbox:
 *
 *  - the welcome screen's two buttons go to DIFFERENT places (the regression
 *    that prompted the change — in the prototype and in the port before it,
 *    both went to the same screen)
 *  - a confirmed account signs in with its password and lands on the right
 *    screen for whether onboarding ever finished
 *  - a wrong password is refused WITHOUT revealing whether the account exists
 *  - a recovery link lands on /login/reset rather than Home, because being
 *    signed in is not the same as knowing your password
 *
 * The account is made with the admin API and `email_confirm: true` — the same
 * technique as scripts/demo-data.js — so no email has to be delivered. Signup's
 * own verification email is the one path this cannot reach; that is covered by
 * the form's server-side validation tests and by hand.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const PASSWORD = "e2e-Passw0rd!";

/** A confirmed account with a known password, and no profiles row yet. */
async function createConfirmedUser(email: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`admin create failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const user = (await res.json()) as { id?: string };
  if (!user.id) {
    throw new Error(`admin create returned no id for ${email}`);
  }
  return user.id;
}

async function deleteUser(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
}

async function fillSignIn(page: Page, email: string, password: string) {
  await page.goto("/login/email");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("email + password auth", () => {
  test("the welcome screen's two buttons go to different screens", async ({ page }) => {
    await page.goto("/login");

    /* The whole point of the change: these were the same destination before. */
    await expect(page.getByRole("link", { name: "Start dancing" })).toHaveAttribute(
      "href",
      "/login/signup"
    );
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login/email"
    );

    /* And the mobile channel is gone, not hidden (Step 26 is unbuilt again). */
    await expect(page.getByText("Mobile", { exact: true })).toHaveCount(0);
  });

  test("a confirmed account signs in with its password", async ({ page }) => {
    const email = `e2e-pw-${Date.now()}@example.com`;
    const userId = await createConfirmedUser(email);
    try {
      await fillSignIn(page, email, PASSWORD);

      /* No profiles row was made, so onboarding is the correct landing — the
         same fork /auth/confirm makes. Reaching it proves the password was
         accepted and the session cookie was set. */
      await expect(page).toHaveURL(/\/onboarding/);
    } finally {
      await deleteUser(userId);
    }
  });

  test("a wrong password is refused without saying whether the account exists", async ({
    page,
  }) => {
    const email = `e2e-pw-bad-${Date.now()}@example.com`;
    const userId = await createConfirmedUser(email);
    try {
      await fillSignIn(page, email, "not-the-right-password");

      /* Asserted by TEXT, not by getByRole("alert"): the Next.js dev overlay
         injects its own empty role=alert into the page, so matching the role
         alone is ambiguous in dev and picks up the wrong one. */
      await expect(page.getByText("Invalid login credentials")).toBeVisible();

      /* Supabase's deliberately vague wording. If this ever becomes specific,
         the sign-in form has turned into a way to check who has an account. */
      await expect(page.getByText(/not found|no such user|no user with/i)).toHaveCount(0);

      await expect(page).toHaveURL(/\/login\/email/);
    } finally {
      await deleteUser(userId);
    }
  });

  test("an unknown address is refused the same way as a wrong password", async ({ page }) => {
    await fillSignIn(page, `e2e-pw-nobody-${Date.now()}@example.com`, PASSWORD);

    /* Same string as the wrong-password case above — that identity IS the test:
       an attacker must not be able to tell the two cases apart. */
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
  });

  test("a recovery link lands on set-a-new-password, not Home", async ({ page }) => {
    const email = `e2e-pw-recover-${Date.now()}@example.com`;
    const userId = await createConfirmedUser(email);
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ type: "recovery", email }),
      });
      expect(res.ok).toBe(true);
      const link = (await res.json()) as { hashed_token: string };

      await page.goto(`/auth/confirm?token_hash=${link.hashed_token}&type=recovery`);

      /* Redeeming recovery creates a session but does NOT change the password,
         so Home would leave this person locked out at the next sign-in. */
      await expect(page).toHaveURL(/\/login\/reset/);
      await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    } finally {
      await deleteUser(userId);
    }
  });

  test("the sign-up form will not submit a mismatched pair", async ({ page }) => {
    await page.goto("/login/signup");
    await page.getByLabel("Email address").fill(`e2e-pw-mismatch-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(`${PASSWORD}-different`);
    await page.getByLabel("Confirm password").blur();

    await expect(page.getByText("Those two passwords don't match")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  test("the sign-up form will not submit a password under the minimum", async ({ page }) => {
    await page.goto("/login/signup");
    await page.getByLabel("Email address").fill(`e2e-pw-short-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Password", { exact: true }).blur();

    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  });
});
