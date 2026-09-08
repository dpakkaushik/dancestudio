import { test, expect } from "@playwright/test";

/**
 * The check-your-inbox screen (app/login/check-email) — 8 Sep 2026.
 *
 * Everything here is a RENDER check: the screen is reached with a query string,
 * so no account and no email are involved, and nothing below ever presses
 * "Resend link" — a real resend spends the project's shared email quota
 * (CLAUDE.md Rule 15), and the timer that gates it is driven with Playwright's
 * clock instead of waited out.
 */

const ADDRESS = "someone@example.com";

test.describe("check your email", () => {
  test("verify mode names the address and says what happens after the link", async ({
    page,
  }) => {
    await page.goto(`/login/check-email?email=${encodeURIComponent(ADDRESS)}&mode=verify`);

    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    await expect(page.getByText(ADDRESS, { exact: true })).toBeVisible();

    /* the three steps, in order — the last one is the answer to "and then?" */
    const steps = page.getByRole("list", { name: "What happens next" }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Open the email from DanceOS");
    await expect(steps.nth(1)).toContainText("Tap the link");
    await expect(steps.nth(2)).toContainText("Set up your profile");
    await expect(steps.nth(2)).toContainText(/dancer, a trainer or a studio/);

    await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/login/signup");
    await expect(page.getByRole("link", { name: "Use a different email" })).toHaveAttribute(
      "href",
      "/login/signup"
    );
  });

  test("the resend control counts down before it can be pressed", async ({ page }) => {
    await page.clock.install();
    await page.goto(`/login/check-email?email=${encodeURIComponent(ADDRESS)}&mode=verify`);

    /* while the timer runs there is no button — text, not a disabled control */
    await expect(page.getByRole("status")).toContainText(/Resend in 0:\d\d/);
    await expect(page.getByRole("button", { name: "Resend link" })).toHaveCount(0);

    await page.clock.runFor(31_000);
    await expect(page.getByRole("button", { name: "Resend link" })).toBeVisible();
    /* and it is NOT pressed here — see the file comment */
  });

  test("reset mode is the same screen on the other errand", async ({ page }) => {
    await page.goto(`/login/check-email?email=${encodeURIComponent(ADDRESS)}&mode=reset`);

    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    const steps = page.getByRole("list", { name: "What happens next" }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(2)).toContainText("Choose a new password");

    await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/login/forgot");
    await expect(page.getByRole("link", { name: "Send it somewhere else" })).toHaveAttribute(
      "href",
      "/login/forgot"
    );
  });

  test("an address the forms would refuse is not shown a screen for it", async ({ page }) => {
    await page.goto("/login/check-email?email=nope");
    await expect(page).toHaveURL(/\/login\/email/);
  });
});
