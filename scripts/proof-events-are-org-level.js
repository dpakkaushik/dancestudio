/* AN EVENT IS THE ORGANIZATION'S — PROVED AGAINST THE LIVE DATABASE
   (15 Sep 2026, R15; re-cut 26 Sep 2026 for the retired organization login).
 *
 * The screens stopped offering an events door on a studio on 15 Sep. That is a
 * screen decision, and a screen decision is not a rule — so this asks the
 * DATABASE the same question, as a real signed-in PERSON who owns BOTH a studio
 * and an organization business (26 Sep 2026: any account opens a studio, and an
 * organization is a `businesses` row of type `org` a person opens — there is no
 * organization login any more), through every door an event could be created by:
 *
 *   1  save_event with a STUDIO as the host          → refused, in words
 *   2  a direct PostgREST INSERT into `events`       → refused (no insert policy)
 *   3  save_event with the ORGANIZATION business     → accepted
 *   4  the org business is NOT the studio            → they are different businesses
 *   5  the org business is type 'org' and unlisted   → never on Discover (R15)
 *   6  can_run_events on the studio                  → true (so #1 is the TYPE
 *                                                      check refusing, not a
 *                                                      permission check — the
 *                                                      rule is the one we think)
 *
 * Why a script and not a .ps1 like its neighbours: it needs a real user session
 * (the guard reads auth.uid()), and the admin API can mint one with a password
 * in four lines here. Everything it makes, it deletes.
 *
 * Run: node scripts/proof-events-are-org-level.js     (needs .env.local) */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let pass = 0;
let fail = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail && !ok ? `\n        ${detail}` : ""}`);
  ok ? (pass += 1) : (fail += 1);
};

const asUser = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

/** call an RPC and hand back { ok, status, body } rather than throwing — a
 *  refusal IS the result here, so it must be readable, not an exception */
async function rpc(headers, fn, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body, message: (body && body.message) || text };
}

(async () => {
  const stamp = Date.now().toString(36);
  const email = `proof-events-${stamp}@example.com`;
  const password = `Pw-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
  let userId = null;
  let studioId = null;
  let hostId = null;

  try {
    /* ── a real person, signed in ───────────────────────────────────────── */
    const made = await (await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST", headers: admin,
      body: JSON.stringify({ email, password, email_confirm: true }),
    })).json();
    userId = made.id;
    if (!userId) throw new Error(`could not create the account: ${JSON.stringify(made).slice(0, 200)}`);

    const signedIn = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })).json();
    const token = signedIn.access_token;
    if (!token) throw new Error(`could not sign in: ${JSON.stringify(signedIn).slice(0, 200)}`);
    const me = asUser(token);

    /* its profile — a USER (26 Sep 2026: the only kind of login there is) */
    const prof = await fetch(`${URL}/rest/v1/profiles`, {
      method: "POST", headers: { ...me, Prefer: "return=representation" },
      body: JSON.stringify({ id: userId, full_name: `Proof Owner ${stamp}`, role: "user", city: "Pune", styles: ["Hip-Hop"] }),
    });
    if (!prof.ok) throw new Error(`could not create the profile: ${(await prof.text()).slice(0, 200)}`);

    /* a studio of its own, and an ORGANIZATION business of its own — the same
       door for both; then the organization's OWN GST number so the events gate
       is open and nothing below is refused for the wrong reason */
    const studio = await rpc(me, "create_business_with_owner", { p_name: `Proof Studio ${stamp}`, p_type: "studio", p_area: "Kothrud", p_city: "Pune", p_styles: ["Hip-Hop"] });
    studioId = studio.body && studio.body.id;
    if (!studioId) throw new Error(`could not create the studio: ${studio.message.slice(0, 200)}`);
    const org = await rpc(me, "create_business_with_owner", { p_name: `Proof Org ${stamp}`, p_type: "org", p_area: null, p_city: "Pune" });
    hostId = org.body && org.body.id;
    if (!hostId) throw new Error(`could not create the organization: ${org.message.slice(0, 200)}`);
    const gst = await rpc(me, "verify_business_gstin", { p_business_id: hostId, p_gstin: `PRF${String(Date.now() % 100000).padStart(5, "0")}` });
    if (!gst.ok) throw new Error(`could not verify the organization's GST number: ${gst.message.slice(0, 200)}`);

    const payload = (title) => ({
      category: "showcase", title, style: "All styles",
      start_date: "2027-01-10", end_date: "2027-01-10", start_time: "18:00",
      venue: "Proof Hall", city: "Pune", maps_url: "https://maps.google.com/?q=Pune",
      entry_format: "none", tickets_on: true,
    });

    /* ── 1. save_event, hosted by the STUDIO ────────────────────────────── */
    const onStudio = await rpc(me, "save_event", { p_business_id: studioId, p_event_id: null, p_event: payload(`Proof studio-hosted ${stamp}`) });
    check(
      !onStudio.ok && /belongs to the organization/i.test(onStudio.message),
      "save_event refuses a STUDIO as the host, in words — even when the same person owns an organization",
      `got ${onStudio.status}: ${String(onStudio.message).slice(0, 160)}`
    );

    /* ── 2. the other door: a direct insert, past the RPC entirely ───────── */
    const direct = await fetch(`${URL}/rest/v1/events`, {
      method: "POST", headers: { ...me, Prefer: "return=representation" },
      body: JSON.stringify({ business_id: studioId, category: "showcase", title: `Proof direct ${stamp}`, style: "All styles", start_date: "2027-01-10", end_date: "2027-01-10", venue: "Proof Hall", city: "Pune", maps_url: "https://maps.google.com/?q=Pune" }),
    });
    const directBody = await direct.text();
    check(
      !direct.ok,
      "a direct INSERT into events is refused too — the RPC is not the only lock",
      `got ${direct.status}: ${directBody.slice(0, 160)}`
    );

    /* ── 3. and the organization business is accepted ───────────────────── */
    const onHost = await rpc(me, "save_event", { p_business_id: hostId, p_event_id: null, p_event: payload(`Proof org-hosted ${stamp}`) });
    check(onHost.ok && typeof onHost.body === "string", "save_event ACCEPTS the organization business the same person owns", `got ${onHost.status}: ${String(onHost.message).slice(0, 160)}`);

    /* ── 4-5. and that host is a different business, of type org, unlisted ── */
    check(hostId !== studioId, "the events host is NOT the studio");
    const rows = await (await fetch(`${URL}/rest/v1/businesses?id=eq.${hostId}&select=type,visibility`, { headers: admin })).json();
    const hostRow = Array.isArray(rows) ? rows[0] : null;
    check(
      hostRow && hostRow.type === "org" && hostRow.visibility === "unlisted",
      "the org business is type 'org' and unlisted — never on Discover (R15); org_is_public is what opens it",
      `got ${JSON.stringify(hostRow)}`
    );

    /* ── 6. the refusal in #1 is the TYPE check, not a permission check ─── */
    const mayRun = await rpc(me, "can_run_events", { p_business_id: studioId });
    check(
      mayRun.body === true,
      "can_run_events(studio) is TRUE — so #1 is the org rule refusing, not a permission",
      `got ${JSON.stringify(mayRun.body)}`
    );
  } catch (e) {
    console.log("FAILED", String(e).slice(0, 400));
    fail += 1;
  } finally {
    /* everything this made, it removes — the businesses BEFORE the account */
    for (const id of [studioId, hostId]) {
      if (id) await fetch(`${URL}/rest/v1/businesses?id=eq.${id}`, { method: "DELETE", headers: admin }).catch(() => {});
    }
    if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin }).catch(() => {});
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();
