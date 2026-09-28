#!/usr/bin/env node
/**
 * END THE SUBSCRIPTIONS THAT POINT AT A DELETED BUSINESS (29 Sep 2026).
 *
 * Found while checking what was left after the organization/event removal:
 * **118 subscriptions are `active`, and 118 of them name a business that is
 * soft-deleted.** Two shapes, and they need different treatment:
 *
 *   ⚠ TWO REAL MANDATES — `jishnu.nanda@gmail.com`'s two studios (7ft Down,
 *     Dance Hall, both soft-deleted on 26 Sep by the organization-login
 *     retirement) at ₹1,200/mo each, `granted = false`, each with a live
 *     `provider_subscription_id`. **Cashfree does not know we deleted the
 *     studio.** Marking the row ended in our database would stop nothing —
 *     the mandate is Cashfree's, so it is cancelled THERE first and the row
 *     is only then brought into line. (This project is on CASHFREE_ENV=sandbox,
 *     so these are test mandates; the order of operations is the same either
 *     way, and getting it wrong on the day the keys go live is how money keeps
 *     leaving an account nobody is watching.)
 *
 *   THE REST — `₹0 granted` comps on proof studios, with NO provider
 *     subscription id. Nothing charges them; they are simply untrue. They are
 *     marked expired, with no Cashfree call to make.
 *
 * ⚠ WHY NOT `admin_end_subscription`: that door is gated on
 *   `is_platform_admin()`, which answers the service role with EMPTINESS rather
 *   than an error (10 Sep 2026), and it would raise a notification per row —
 *   a hundred-odd notices to a test account about studios that do not exist.
 *   This is a data correction, and it says so.
 *
 * Usage:
 *   node scripts/end-subscriptions-on-deleted-businesses.js           # dry run
 *   node scripts/end-subscriptions-on-deleted-businesses.js --apply
 */
"use strict";

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

function env() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
function dbUrl(e) {
  const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
  return `postgresql://postgres.${ref}:${encodeURIComponent(e.SUPABASE_DB_PASSWORD)}` +
         `@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
}

let Client;
try { ({ Client } = require("pg")); }
catch { console.error("This script needs the `pg` client:  npm i -D pg"); process.exit(1); }

async function cancelAtCashfree(e, providerSubscriptionId) {
  const base = (e.CASHFREE_ENV === "production")
    ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  const r = await fetch(`${base}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/manage`, {
    method: "POST",
    headers: {
      "x-client-id": e.CASHFREE_APP_ID,
      "x-client-secret": e.CASHFREE_SECRET_KEY,
      "x-api-version": "2025-01-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscription_id: providerSubscriptionId, action: "CANCEL" }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body: body.slice(0, 220) };
}

(async () => {
  const e = env();
  const c = new Client({ connectionString: dbUrl(e), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`
      select s.id, s.kind, s.plan_key, s.price_inr, s.granted,
             s.provider_subscription_id, s.current_period_end,
             b.name as business, u.email as owner
      from subscriptions s
      join businesses b on b.id = s.business_id
      left join auth.users u on u.id = s.user_id
      where s.status = 'active' and s.deleted_at is null and b.deleted_at is not null
      order by (s.provider_subscription_id is null), s.price_inr desc`);

    const real = rows.filter((r) => r.provider_subscription_id);
    const comps = rows.filter((r) => !r.provider_subscription_id);

    console.log(APPLY ? `=== APPLYING (Cashfree mode: ${e.CASHFREE_ENV}) ===\n`
                      : `=== DRY RUN (nothing written; Cashfree mode: ${e.CASHFREE_ENV}) ===\n`);
    console.log(`active subscriptions on a soft-deleted business: ${rows.length}`);
    console.log(`  ⚠ with a LIVE Cashfree mandate (cancel THERE first): ${real.length}`);
    console.log(`    ₹0 comps, no mandate (a data correction only)     : ${comps.length}\n`);

    for (const r of real) {
      console.log(`  ⚠ ₹${r.price_inr}/mo  "${r.business}"  <${r.owner}>`);
      console.log(`      mandate ${r.provider_subscription_id}   period ends ` +
        `${r.current_period_end ? new Date(r.current_period_end).toISOString().slice(0, 10) : "—"}`);
    }

    if (!APPLY) {
      console.log(`\n=== DRY RUN — nothing written. Pass --apply. ===`);
      return;
    }

    // ---- 1. Cashfree FIRST, one at a time, reporting each.
    let cancelled = 0, refused = 0;
    for (const r of real) {
      const res = await cancelAtCashfree(e, r.provider_subscription_id);
      if (res.ok) { cancelled++; console.log(`  cancelled at Cashfree: ${r.provider_subscription_id}`); }
      else {
        refused++;
        console.log(`  ⚠ Cashfree refused ${r.provider_subscription_id} (${res.status}) ${res.body}`);
      }
      // ⚠ The row is brought into line either way: a mandate Cashfree says is
      //   already gone is still a subscription of ours that must stop claiming
      //   to be active. A refusal is REPORTED rather than swallowed.
      await c.query(
        `update subscriptions
            set status = 'canceled', cancel_at_period_end = true, updated_at = now()
          where id = $1`, [r.id]);
    }

    // ---- 2. The comps: no mandate, so a straight correction.
    const compIds = comps.map((r) => r.id);
    let compRows = 0;
    if (compIds.length) {
      const u = await c.query(
        `update subscriptions
            set status = 'expired', deleted_at = now(), updated_at = now()
          where id = any($1::uuid[]) and deleted_at is null`, [compIds]);
      compRows = u.rowCount;
    }

    console.log(`\nCashfree: ${cancelled} cancelled, ${refused} refused`);
    console.log(`rows: ${real.length} real subscriptions marked canceled, ${compRows} comps expired`);

    const left = await c.query(`
      select count(*)::int n from subscriptions s
      join businesses b on b.id = s.business_id
      where s.status='active' and s.deleted_at is null and b.deleted_at is not null`);
    console.log(`active subscriptions still on a deleted business: ${left.rows[0].n}`);
  } catch (err) {
    console.error("\nFAILED:", err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
