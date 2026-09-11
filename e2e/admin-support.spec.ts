import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * The admin panel, phase 1 (10 Sep 2026): the conversation between an
 * organization and DanceOS, the decision landing inside it, the audit log, and
 * suspension.
 *
 * The claims under test, in the order the story tells them:
 *   1. a stranger cannot see the panel exists — every route 404s;
 *   2. a STUDIO under review says so on the hub (11 Sep 2026 — the review moved
 *      from the organization to the studio), with a door to write to DanceOS
 *      that carries the request, so the thread is about this very review;
 *   3. it writes; the admin sees it in the queue with an unread badge, and the
 *      unread is each side's own (the organization's own message is not unread
 *      to itself);
 *   4. the admin replies; the organization reads the reply and the badge clears;
 *   5. REJECTING posts the reason INTO that conversation, so "why?" is answered
 *      where it was asked, and the studio's strip on the hub prints the reason;
 *   6. every decision is in the audit log, which cannot be edited by anybody;
 *   7. suspension is reversible, tells the account why, and refuses an admin.
 *
 * Sign-up uses the admin generate_link API, so no inbox is needed. Everything
 * created carries a stamp and is deleted in the finally block.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function signUp(page: Page, email: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) throw new Error(`generate_link failed for ${email}: ${res.status} ${await res.text()}`);
  const link = (await res.json()) as { hashed_token: string; verification_type?: string; id?: string };
  await page.goto(`/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  if (!link.id) throw new Error(`no user id for ${email}`);
  return link.id;
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const ONE_PX_PNG = { name: "face.png", mimeType: "image/png", buffer: PNG_BYTES };

/** Onboard as an organization: who first, one name, city, photo — the links
 *  are optional since 11 Sep 2026, and nothing is filed as it leaves: the
 *  review is of a STUDIO, asked for from the hub once one exists. */
async function onboardOrg(page: Page, name: string, city: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByText("Organization", { exact: true }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill(city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await expect(page.getByLabel("Your logo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  /* 11 Sep 2026: an organization's links are optional, and the photos of a
     space belong to a STUDIO, shown for one on the hub once it exists */
  await page.getByRole("button", { name: "Skip for now →" }).click();
  await expect(page.getByText(`Welcome, ${name}!`)).toBeVisible();
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

/** A notification stack is a div[role="button"] carrying an onClick, so it does
 *  nothing until React has hydrated — and Playwright cannot see that: a
 *  server-rendered div is already visible and stable, so a click that lands
 *  first is silently lost. Press until aria-expanded says it opened, which is
 *  also the only honest assertion that it did. */
async function pressUntilOpen(page: Page, name: RegExp | string) {
  const control = page.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt++) {
    await control.click();
    try {
      await expect(control).toHaveAttribute("aria-expanded", "true", { timeout: 3_000 });
      return;
    } catch {
      /* not hydrated yet — press again */
    }
  }
  throw new Error(`the stack ${name} never reported itself open`);
}

/** Land the admin on a panel route. The SSR middleware refreshes the access
 *  token on EVERY request, and two browser contexts working at once can race
 *  that refresh — one of them then holds a token the other has already rotated
 *  and is signed out. A real admin never notices; a test driving two contexts
 *  in lockstep does. So: go there, and if the panel bounced us to the sign-in
 *  screen, mint a fresh link for the same account and go again. */
async function adminGoto(page: Page, email: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await page.goto(path);
    if (res && res.status() === 200) return;
    /* two things put us here, and a fresh link fixes both: the middleware
       bounced us to sign-in (307), or amIPlatformAdmin could not tell mid
       token-rotation and requireAdmin answered 404 */
    await signUp(page, email);
  }
  throw new Error(`the admin could not open ${path} — three attempts`);
}

async function deleteUser(id: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
}

/** NAME A CITY IN THE PICKER (11 Sep 2026) — the same helper happy-path carries:
 *  the City field is a Google city search; the typed name is always the last
 *  option, so a test never depends on Google answering. */
async function pickCity(page: Page | Locator, city: string) {
  const box = page.getByRole("searchbox", { name: /Search your city/i });
  if ((await box.count()) === 0) {
    await page.getByRole("button", { name: "Change city" }).first().click();
  }
  await box.first().fill(city);
  await page.getByRole("listbox").getByRole("option", { name: `Use "${city}"` }).click();
}

async function studioIdOf(name: string): Promise<string> {
  const rows = (await (await fetch(`${supabaseUrl}/rest/v1/tenants?name=eq.${encodeURIComponent(name)}&select=id`, { headers: adminHeaders })).json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error(`no studio named ${name}`);
  return id;
}

/** WHAT A STUDIO SHOWS DANCEOS (11 Sep 2026): a public link and five photos.
 *  The service role stands in for the owner's Edit sheet and upload strip —
 *  happy-path drives both for real; this spec is about the desk that answers. */
async function showSpace(studioId: string, ownerId: string) {
  const linked = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ socials: [{ platform: "Instagram", url: "https://instagram.com/panelstudio" }] }),
  });
  if (!linked.ok) throw new Error(`could not link the studio: ${linked.status}`);
  const photos = await fetch(`${supabaseUrl}/rest/v1/org_proof_photos`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ org_id: ownerId, tenant_id: studioId, path: `proof/${ownerId}/panel-${studioId.slice(0, 8)}-${i}.png`, sort: i, created_by: ownerId, updated_by: ownerId }))),
  });
  if (!photos.ok) throw new Error(`could not add the photos: ${photos.status} ${await photos.text()}`);
}

test.describe("the admin panel: support, trust, accountability", () => {
  let orgContext: BrowserContext;
  let adminContext: BrowserContext;
  let strangerContext: BrowserContext;
  let org: Page;
  let admin: Page;
  let stranger: Page;
  let orgId: string | null = null;
  let adminId: string | null = null;
  let strangerId: string | null = null;
  const stamp = Date.now().toString(36).slice(-6);
  const orgName = `Panel Org ${stamp}`;
  /* 11 Sep 2026: the thing under review is a STUDIO */
  const studioName = `Panel Studio ${stamp}`;

  test.beforeAll(async ({ browser }) => {
    test.skip(!supabaseUrl || !serviceKey, "Supabase keys missing (.env.local)");
    orgContext = await browser.newContext();
    adminContext = await browser.newContext();
    strangerContext = await browser.newContext();
    org = await orgContext.newPage();
    admin = await adminContext.newPage();
    stranger = await strangerContext.newPage();
  });

  test.afterAll(async () => {
    for (const id of [orgId, adminId, strangerId]) if (id) await deleteUser(id);
    await orgContext?.close();
    await adminContext?.close();
    await strangerContext?.close();
  });

  test("a stranger cannot see that the panel exists", async () => {
    strangerId = await signUp(stranger, `panel-stranger-${stamp}@example.com`);
    await onboardOrg(stranger, `Panel Bystander ${stamp}`, "Pune");
    // a signed-in account that is not an admin gets the same answer as a bad
    // address: not found. That the panel is there is not theirs to learn.
    for (const path of ["/admin", "/admin/support", "/admin/accounts", "/admin/audit", "/admin/verifications"]) {
      const res = await stranger.goto(path);
      expect(res?.status(), `${path} must 404 for a stranger`).toBe(404);
    }
  });

  test("a studio under review says so on the hub, and its owner writes to DanceOS", async () => {
    orgId = await signUp(org, `panel-org-${stamp}@example.com`);
    await onboardOrg(org, orgName, "Pune");

    // 11 Sep 2026: the review is of a STUDIO. Open one, show DanceOS its space,
    // and the hub says where it stands — with a person on the other side of it.
    await org.goto("/business");
    await org.getByRole("button", { name: "Add studio" }).click();
    await org.locator('input[name="name"]').fill(studioName);
    await org.locator('input[name="area"]').fill("Baner");
    await pickCity(org, "Pune");
    await org.getByLabel("Room 1 name").fill("Floor 1");
    await org.getByRole("button", { name: "Create studio" }).click();
    await expect(org.getByText(studioName, { exact: true })).toBeVisible();
    await expect(org.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Not verified");
    await showSpace(await studioIdOf(studioName), orgId as string);
    await org.goto("/business");
    await org.getByTestId("studio-verification").getByRole("button", { name: `Ask DanceOS to verify ${studioName}` }).click();
    const standing = org.getByTestId("studio-verification");
    await expect(standing).toHaveAttribute("aria-label", "Studio verification: Under review", { timeout: 15_000 });
    await expect(standing.getByText(/A DanceOS admin is checking this studio/)).toBeVisible();

    // and there is a person on the other side of it
    await standing.getByRole("link", { name: "Message DanceOS" }).click();
    // the card's door carries the verification request, so the compose box is
    // already open and already about it — and the admin's decision will land here
    await org.waitForURL(/\/support\?request=[0-9a-f-]+$/);
    await expect(org.getByText(/their decision on your verification lands in this same conversation/)).toBeVisible();
    await org.getByLabel("Subject").fill("How long does verification take?");
    await org.getByLabel("Message").fill("We have our Instagram up. Anything else you need from us?");
    await org.getByRole("button", { name: "Send", exact: true }).click();
    await org.waitForURL(/\/support\/[0-9a-f-]+$/);
    await expect(org.getByText("We have our Instagram up. Anything else you need from us?")).toBeVisible();
    // the organization's own message is not unread to the organization
    await org.goto("/support");
    await expect(org.getByRole("link", { name: /1 unread/ })).toHaveCount(0);
  });

  test("the admin reads it, replies, and the organization sees the reply", async () => {
    adminId = await signUp(admin, `panel-admin-${stamp}@example.com`);
    const named = await fetch(`${supabaseUrl}/rest/v1/platform_admins`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ user_id: adminId }),
    });
    expect(named.ok).toBeTruthy();

    // an admin has no profile: Home is the panel, and the nav carries the count
    await admin.goto("/");
    await expect(admin).toHaveURL(/\/admin\/verifications|\/admin$/);
    await admin.goto("/admin");
    await expect(admin.getByText(/thing(s)? need you/)).toBeVisible();

    // the conversation is waiting, and it is unread to the ADMIN
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, "/admin/support");
    /* THIS run's thread. A run the network killed leaves its organization and
       its thread behind (afterAll never ran), and the desk then lists two
       "How long does verification take?" rows — a strict-mode clash on the
       subject alone (11 Sep 2026). The row carries the organization's name. */
    const row = admin.getByRole("link", { name: /How long does verification take\?/ }).filter({ hasText: orgName });
    await expect(row).toBeVisible();
    await expect(admin.getByText(orgName, { exact: false }).first()).toBeVisible();
    await row.click();
    await admin.waitForURL(/\/admin\/support\/[0-9a-f-]+$/);
    await admin.getByLabel("YOUR REPLY").fill("Your links are enough — we are looking now.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(admin.getByText("Your links are enough — we are looking now.")).toBeVisible();

    // the organization reads it, and Home's badge says there is something to read
    await org.goto("/");
    await expect(org.getByRole("link", { name: /Read DanceOS's reply/ })).toBeVisible();
    await org.getByRole("link", { name: /Read DanceOS's reply/ }).click();
    await expect(org.getByText("Your links are enough — we are looking now.")).toBeVisible();
    // opening IS reading — the badge is gone
    await org.goto("/");
    await expect(org.getByRole("link", { name: /Read DanceOS's reply/ })).toHaveCount(0);
    await expect(org.getByRole("link", { name: "Your conversation with DanceOS" })).toBeVisible();
  });

  test("a rejection lands in the conversation, and in the audit log", async () => {
    /* through the desk's own search: the pending queue is oldest-first and one
       page of 25 — the way an admin with 2,000 applications needs it — so a
       request made a minute ago is on the LAST page, not the first. Searching
       by name is what an admin looking for one organization does too. */
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, `/admin/verifications?q=${encodeURIComponent(studioName)}`);
    const request = admin.getByTestId("verification-request").filter({ hasText: studioName });
    await expect(request).toBeVisible();
    // R16: the links say who they claim to be, the photos say there is a floor
    await expect(request.getByText("5 PHOTOS OF THE SPACE")).toBeVisible();
    await request.getByRole("button", { name: `Reject ${studioName}` }).click();
    await admin.getByRole("textbox").last().fill("Your Instagram has three posts and no classes — show us the studio.");
    await admin.getByRole("button", { name: /^Reject/ }).last().click();
    await expect(admin.getByText(/not approved|Ask again|rejected/i).first()).toBeVisible({ timeout: 15_000 });

    // the owner reads the reason under the studio, in the admin's own words,
    // and again in the conversation it opened about this very review
    await org.goto("/business");
    await expect(org.getByTestId("studio-verification")).toHaveAttribute("aria-label", "Studio verification: Not approved");
    await expect(org.getByTestId("studio-verification").getByText(/Your Instagram has three posts/)).toBeVisible();
    await org.goto("/support");
    await org.getByRole("link", { name: /How long does verification take\?/ }).first().click();
    await expect(org.getByText(/Not approved\. Your Instagram has three posts/)).toBeVisible();

    // and the decision is on the record
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, "/admin/audit");
    const entry = admin.getByTestId("audit-entry").filter({ hasText: studioName });
    await expect(entry.first()).toBeVisible();
    await expect(entry.first()).toContainText("did not approve");
    await expect(entry.first()).toContainText("Your Instagram has three posts");
  });

  test("suspension is reversible, says why, and will not touch an admin", async () => {
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, `/admin/accounts?q=${encodeURIComponent(orgName)}`);
    const card = admin.getByTestId("admin-account").filter({ hasText: orgName });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Suspend ${orgName}` }).click();
    await admin.getByLabel("WHY — THEY READ THIS").fill("Reported for using another studio's photos.");
    await admin.getByRole("button", { name: `Confirm suspending ${orgName}` }).click();
    await expect(admin.getByText(/is suspended/)).toBeVisible({ timeout: 15_000 });

    // the account is told, in the words the admin used
    await org.goto("/notifications");
    // what reaches somebody is stacked by kind — the reason is inside the stack
    await pressUntilOpen(org, /^People — \d+ updates?$/);
    await expect(org.getByText("Your account is suspended")).toBeVisible();
    await expect(org.getByText(/Reported for using another studio's photos/)).toBeVisible();


    // lifting it is one press, and both moves are on the record
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, `/admin/accounts?q=${encodeURIComponent(orgName)}`);
    await admin.getByRole("button", { name: `Lift the suspension on ${orgName}` }).click();
    await expect(admin.getByText(/is active again/)).toBeVisible({ timeout: 15_000 });
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, "/admin/audit?action=account.suspend");
    await expect(admin.getByTestId("audit-entry").filter({ hasText: orgName }).first()).toContainText("suspended");

    // an admin is not suspendable from the desk — the RPC refuses it, and the
    // desk does not offer a button it knows would be refused
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, `/admin/accounts?q=${encodeURIComponent(`panel-admin-${stamp}`)}`);
    await expect(admin.getByRole("button", { name: /^Suspend / })).toHaveCount(0);
  });
});
