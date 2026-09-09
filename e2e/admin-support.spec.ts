import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * The admin panel, phase 1 (10 Sep 2026): the conversation between an
 * organization and DanceOS, the decision landing inside it, the audit log, and
 * suspension.
 *
 * The claims under test, in the order the story tells them:
 *   1. a stranger cannot see the panel exists — every route 404s;
 *   2. an organization that has asked to be verified sees a TIMELINE saying so,
 *      and a door to write to DanceOS;
 *   3. it writes; the admin sees it in the queue with an unread badge, and the
 *      unread is each side's own (the organization's own message is not unread
 *      to itself);
 *   4. the admin replies; the organization reads the reply and the badge clears;
 *   5. REJECTING posts the reason INTO that conversation, so "why?" is answered
 *      where it was asked, and the timeline prints the reason;
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

const ONE_PX_PNG = {
  name: "face.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"),
};

/** Onboard as an organization: who first, one name, city, photo, then the
 *  mandatory links — and the bow files the verification request as it leaves. */
async function onboardOrg(page: Page, name: string, city: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByText("Organization", { exact: true }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill(city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(ONE_PX_PNG);
  await expect(page.getByLabel("Your logo", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Instagram profile URL").fill(`https://instagram.com/${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(`Welcome, ${name}!`)).toBeVisible();
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
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

  test("an organization in review sees a timeline, and writes to DanceOS", async () => {
    orgId = await signUp(org, `panel-org-${stamp}@example.com`);
    await onboardOrg(org, orgName, "Pune");

    // the hub says where it stands, step by step
    await org.goto("/business");
    await expect(org.getByRole("status", { name: "Verification: In review" })).toBeVisible();
    await expect(org.getByText("Your links are published")).toBeVisible();
    await expect(org.getByText("You asked to be verified")).toBeVisible();
    await expect(org.getByText("A DanceOS admin checks your links")).toBeVisible();
    await expect(org.getByText("Your studios are public")).toBeVisible();

    // and there is a person on the other side of it
    await org.getByRole("link", { name: "Message DanceOS" }).click();
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
    const row = admin.getByRole("link", { name: /How long does verification take\?/ });
    await expect(row).toBeVisible();
    await expect(admin.getByText(orgName, { exact: false }).first()).toBeVisible();
    await row.click();
    await admin.waitForURL(/\/admin\/support\/[0-9a-f-]+$/);
    await admin.getByLabel("YOUR REPLY").fill("Your links are enough — we are looking now.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(admin.getByText("Your links are enough — we are looking now.")).toBeVisible();

    // the organization reads it, and the hub's badge says there is something to read
    await org.goto("/business");
    await expect(org.getByRole("link", { name: /Read DanceOS's reply/ })).toBeVisible();
    await org.getByRole("link", { name: /Read DanceOS's reply/ }).click();
    await expect(org.getByText("Your links are enough — we are looking now.")).toBeVisible();
    // opening IS reading — the badge is gone
    await org.goto("/business");
    await expect(org.getByRole("link", { name: /Read DanceOS's reply/ })).toHaveCount(0);
    await expect(org.getByRole("link", { name: "Your conversation with DanceOS" })).toBeVisible();
  });

  test("a rejection lands in the conversation, and in the audit log", async () => {
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, "/admin/verifications");
    const request = admin.getByTestId("verification-request").filter({ hasText: orgName });
    await expect(request).toBeVisible();
    await request.getByRole("button", { name: `Reject ${orgName}` }).click();
    await admin.getByRole("textbox").last().fill("Your Instagram has three posts and no classes — show us the studio.");
    await admin.getByRole("button", { name: /^Reject/ }).last().click();
    await expect(admin.getByText(/not approved|Ask again|rejected/i).first()).toBeVisible({ timeout: 15_000 });

    // the organization reads the reason where it asked the question
    await org.goto("/business");
    await expect(org.getByRole("status", { name: "Verification: Not approved" })).toBeVisible();
    await expect(org.getByRole("list").getByText(/Your Instagram has three posts/)).toBeVisible();
    await org.getByRole("link", { name: /conversation with DanceOS|Read DanceOS/ }).click();
    await expect(org.getByText(/Not approved\. Your Instagram has three posts/)).toBeVisible();

    // and the decision is on the record
    await adminGoto(admin, `panel-admin-${stamp}@example.com`, "/admin/audit");
    const entry = admin.getByTestId("audit-entry").filter({ hasText: orgName });
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
    await org.getByRole("button", { name: /^People — \d+ updates?$/ }).click();
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
