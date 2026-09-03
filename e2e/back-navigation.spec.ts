import { test, expect, devices, type Page } from "@playwright/test";

/**
 * The system back gesture belongs to the sheet that is open.
 *
 * This is the prototype's own rule (DanceOSApp.jsx:19039-19064, "system back /
 * edge-swipe pops one screen") and it is what `lib/hooks/useCloseOnBack.ts`
 * implements for the app's ~30 bottom sheets. It is tested because the Android
 * wrapper makes it load-bearing: back is a system gesture there, not a button in
 * browser chrome, so without this a person who opens a sheet and swipes back
 * loses the whole screen underneath — and the work in it.
 *
 * The subject is Discover's filter sheet, chosen because it is the one sheet a
 * signed-OUT visitor can reach, so this spec needs no account, no seeded world
 * and no cleanup — unlike happy-path.spec.ts it is independent of the story.
 *
 * The second check is the one that is easy to get wrong: closing a sheet with
 * its own button must SPEND the history entry that opening it pushed. Miss that
 * and every sheet a person opened and dismissed leaves a dead entry behind, so
 * later back presses appear to do nothing until they have all been used up.
 */

test.use({ ...devices["Pixel 7"] });

const FILTERS = '[aria-label="All filters"]';
const DIALOG = '[role="dialog"]';

/** Discover reads Supabase through the PostGIS `nearby_tenants` RPC, which can
 *  transiently fetch-fail; a retry keeps a network blip from reading as a
 *  regression in back navigation, which is what this spec is actually about. */
async function openDiscover(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto("/discover", { waitUntil: "domcontentloaded" });
    if (await page.locator(FILTERS).count()) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("/discover never rendered its filter control");
}

const sheetState = (page: Page) =>
  page.evaluate(() => (window.history.state as Record<string, unknown> | null)?.dosSheet ?? null);

test.describe.serial("system back and the sheets", () => {
  test("back closes the open sheet and leaves the page underneath alone", async ({ page }) => {
    /* a page before this one, so "back" has somewhere it COULD go — the point of
       the check is that it does not go there while a sheet is open */
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.locator(FILTERS).click();
    await expect(page.locator(DIALOG).first()).toBeVisible();
    /* opening armed one entry of our own — Next merges its router state into the
       same object, so this asserts our marker rides along rather than replacing it */
    expect(await sheetState(page)).toBe(true);

    await page.goBack();

    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(page.url()).toContain("/discover");
  });

  test("closing by button leaves the entry; back is a no-op once, then leaves", async ({ page }) => {
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.locator(FILTERS).click();
    await expect(page.locator(DIALOG).first()).toBeVisible();

    await page.locator("text=/Show results/i").first().click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    /* the entry stays — never spent programmatically (see the header): the hook
       has let go of it, and it reads as one inert same-URL step in history */
    expect(await sheetState(page)).toBe(true);

    await page.goBack(); // consumes the inert entry: same URL, sheet stays closed
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(page.url()).toContain("/discover");

    await page.goBack(); // and THIS one leaves
    await expect(page).toHaveURL(/\/classes/);
  });

  test("ordinary route back is untouched", async ({ page }) => {
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/classes/);
  });
});
