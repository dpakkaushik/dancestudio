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

/** Discover reads Supabase through the PostGIS `nearby_businesses` RPC, which can
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
    /* opening pushed one entry of our own, marked with the sheet's token — Next
       merges its router state into the same object, so this asserts our marker
       rides along rather than replacing it */
    expect(typeof (await sheetState(page))).toBe("number");

    await page.goBack();

    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(page.url()).toContain("/discover");
  });

  test("Show results turns the sheet's entry into the results page; back from there is the unfiltered list, then leaves", async ({ page }) => {
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.locator(FILTERS).click();
    await expect(page.locator(DIALOG).first()).toBeVisible();

    /* a filter that CHANGES the address — with nothing changed the router has
       nothing to replace, and the entry is an orphan the next test covers */
    await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Cheapest" }).click();
    await page.locator("text=/Show results/i").first().click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await page.waitForURL(/sort=price/);
    /* the filter sheet closes with `spend: false` and REPLACES the URL in the
       same tick, so the replace lands on the sheet's own entry: the marker is
       gone and the entry is the filtered list — an address, not an inert step */
    await expect.poll(() => sheetState(page)).toBeNull();

    await page.goBack(); // the unfiltered list, the entry before the sheet
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect(page).toHaveURL(/\/discover(?!.*sort=price)/);

    await page.goBack(); // and THIS one leaves
    await expect(page).toHaveURL(/\/classes/);
  });

  test("an entry a scrim-close leaves behind is skipped: one back leaves the page", async ({ page }) => {
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.locator(FILTERS).click();
    await expect(page.locator(DIALOG).first()).toBeVisible();
    /* this sheet closes with `spend: false` (its Show results navigates), so a
       scrim-close leaves its entry standing — and the hook skips an orphaned
       entry on the next back press, so the person still moves exactly once */
    await page.mouse.click(10, 10);
    await expect(page.locator(DIALOG)).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/classes/);
  });

  test("ordinary route back is untouched", async ({ page }) => {
    await page.goto("/classes", { waitUntil: "domcontentloaded" });
    await openDiscover(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/classes/);
  });
});
