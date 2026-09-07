import { test, expect } from "@playwright/test";

/**
 * /auth/confirm, the route every emailed link lands on.
 *
 * THE REGRESSION THIS PINS (7 Sep 2026). The route read only `token_hash`,
 * which arrives only from a customised `{{ .TokenHash }}` email template. The
 * hosted project sends the stock `{{ .ConfirmationURL }}`, so real links
 * arrived carrying a PKCE `code` instead, matched nothing, and fell through to
 * the "invalid or expired" bounce. Every email path was dead — no signup could
 * be completed and no password could be reset — while the account was left
 * confirmed but sessionless, so the person saw "link expired" followed by
 * "Invalid login credentials" and neither named the cause.
 *
 * password-auth.spec.ts cannot catch this: it builds accounts with the admin
 * API and `email_confirm: true`, which never touches this route. These tests
 * assert on the BRANCH TAKEN rather than on a successful sign-in, because a
 * real code exchange needs a code_verifier cookie that only the browser which
 * requested the link holds. A bogus code proves the exchange was attempted;
 * that is precisely what the bug got wrong.
 */

const EXPIRED = /invalid or has expired/i;
const NOT_HERE = /could not be opened here/i;

/** AuthShell's toast. Next.js injects its own empty `role="alert"` route
 *  announcer (#__next-route-announcer__), so a bare getByRole("alert") matches
 *  two nodes and trips strict mode. */
const toast = (page: import("@playwright/test").Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe("/auth/confirm accepts both email-link shapes", () => {
  test("a PKCE `code` is exchanged, not dismissed as malformed", async ({ page }) => {
    await page.goto("/auth/confirm?code=bogus-code-for-test");

    /* The heart of it: reaching the exchange at all. The old route never did,
       and answered with the generic expired-link text instead. */
    await expect(page).toHaveURL(/\/login\/email/);
    const error = toast(page);
    await expect(error).toHaveText(NOT_HERE);
    await expect(error).not.toHaveText(EXPIRED);
  });

  test("a recovery `code` still lands on reset, not Home", async ({ page }) => {
    /* The PKCE shape carries no `type`, so `flow` is the only thing keeping a
       reset link off Home — where the person would be signed in and still
       unable to remember their password. */
    await page.goto("/auth/confirm?flow=recovery&code=bogus-code-for-test");

    await expect(page).toHaveURL(/\/login\/reset/);
    await expect(toast(page)).toHaveText(NOT_HERE);
  });

  test("a customised token_hash template keeps working", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus-hash&type=signup");
    await expect(page).toHaveURL(/\/login\/email/);
    await expect(toast(page)).toHaveText(EXPIRED);
  });

  test("a token_hash recovery link lands on reset", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus-hash&type=recovery");
    await expect(page).toHaveURL(/\/login\/reset/);
    await expect(toast(page)).toHaveText(EXPIRED);
  });

  test("a link with no credentials at all is refused", async ({ page }) => {
    await page.goto("/auth/confirm");
    await expect(page).toHaveURL(/\/login\/email/);
    await expect(toast(page)).toHaveText(EXPIRED);
  });

  test("Supabase's own refusal is shown rather than replaced", async ({ page }) => {
    /* When /auth/v1/verify rejects a link itself it appends its reason here.
       Overwriting it with our generic text would throw away the only accurate
       description of what happened. */
    await page.goto(
      "/auth/confirm?error=access_denied&error_description=Email+link+is+invalid+or+has+expired"
    );
    await expect(page).toHaveURL(/\/login\/email/);
    await expect(toast(page)).toHaveText(/Email link is invalid or has expired/i);
  });
});
