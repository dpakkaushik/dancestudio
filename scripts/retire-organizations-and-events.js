#!/usr/bin/env node
/**
 * RETIRE ORGANIZATIONS AND EVENTS — the production sweep (29 Sep 2026).
 *
 * The user: "Remove Organization and Events completely from the system. all
 * mechanisms , stats , discover everything related to them should be wiped out
 * without hampering the other parts of the system. remove all organization
 * profiles as well."
 *
 * ⚠ THIS TOUCHES PRODUCTION DATA. It is a DRY RUN unless you pass --apply, and
 *   the standing rule in CLAUDE.md is that the KEPT set goes in front of the
 *   user before it ever runs: `--show-kept` prints it.
 *
 * WHAT IT DOES — a SOFT delete throughout (Rule 3). Every row keeps its data
 * and gains a `deleted_at`, so one UPDATE puts any of it back.
 *
 *   organizations   every businesses row of type 'org'
 *   beneath them    their business_members seats, the enquiries sent to them,
 *                   the follows of them, their live subscriptions
 *   events          every events row, and its entry tiers, ticket tiers and
 *                   bookings
 *   organization_members   every seat on an organization
 *
 * WHAT IT DELIBERATELY DOES **NOT** TOUCH, and why:
 *
 *   ⚠ THE MONEY. `orders` naming an event, and the `payments` against them, are
 *     left exactly as they are — 4 orders, 4 captured payments. A ledger does
 *     not forget money, and the invoice screens still print those rows.
 *
 *   ⚠ THE NOTIFICATIONS. 162 rows of kind 'event' stay. A notification is a
 *     record of something that HAPPENED; deleting them would rewrite somebody's
 *     history, and nothing can raise a new one now.
 *
 *   ⚠ THE AUTH ACCOUNTS. Nobody's login is touched. The organizations are
 *     businesses that PEOPLE own (since 26 Sep 2026), and those people keep
 *     their accounts, their studios and their artist pages.
 *
 *   ⚠ THE STORAGE OBJECTS. An organization's pictures are left in the bucket,
 *     orphaned and unreadable. Purging them is a separate, irreversible act.
 *
 * Usage:
 *   node scripts/retire-organizations-and-events.js              # dry run
 *   node scripts/retire-organizations-and-events.js --show-kept  # + what stays
 *   node scripts/retire-organizations-and-events.js --apply      # do it
 */
"use strict";

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const SHOW_KEPT = process.argv.includes("--show-kept");

// --- connection, built the way scripts/db-push.ps1 builds it -----------------
function env() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
function dbUrl() {
  const e = env();
  const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
  return `postgresql://postgres.${ref}:${encodeURIComponent(e.SUPABASE_DB_PASSWORD)}` +
         `@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
}

// `pg` is a dev-time dependency of the migration tooling rather than of the
// app. Resolve it from wherever it is installed and say so plainly if absent.
let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("This script needs the `pg` client:  npm i -D pg");
  process.exit(1);
}

// Each step is one soft-delete, in an order that reads top-down: the things
// hanging off an organization or an event first, then the thing itself.
const STEPS = [
  ["event_bookings", `
     update event_bookings set deleted_at = now()
     where deleted_at is null`],
  ["event_entry_tiers", `
     update event_entry_tiers set deleted_at = now()
     where deleted_at is null`],
  ["event_ticket_tiers", `
     update event_ticket_tiers set deleted_at = now()
     where deleted_at is null`],
  ["events", `
     update events set deleted_at = now()
     where deleted_at is null`],
  ["organization_members", `
     update organization_members set deleted_at = now()
     where deleted_at is null`],
  ["enquiries sent to an organization", `
     update enquiries set deleted_at = now()
     where deleted_at is null
       and business_id in (select id from businesses where type = 'org')`],
  ["enquiry_quotes on those enquiries", `
     update enquiry_quotes set deleted_at = now()
     where deleted_at is null
       and business_id in (select id from businesses where type = 'org')`],
  ["follows of an organization", `
     update follows set deleted_at = now()
     where deleted_at is null
       and business_id in (select id from businesses where type = 'org')`],
  ["business_members seats on an organization", `
     update business_members set deleted_at = now()
     where deleted_at is null
       and business_id in (select id from businesses where type = 'org')`],
  ["subscriptions on an organization", `
     update subscriptions set deleted_at = now(), status = 'expired'
     where deleted_at is null
       and (kind = 'org'
            or business_id in (select id from businesses where type = 'org'))`],
  ["the organizations themselves", `
     update businesses set deleted_at = now()
     where deleted_at is null and type = 'org'`],
];

(async () => {
  const c = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (nothing is written) ===\n");

    // The organizations by name, so the user sees WHAT goes rather than a count.
    const orgs = await c.query(`
      select b.name, b.city, p.full_name as owner,
             exists(select 1 from subscriptions s
                    where s.business_id = b.id and s.status = 'active') as paying
      from businesses b
      left join business_members m
        on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
      left join profiles p on p.id = m.user_id
      where b.type = 'org' and b.deleted_at is null
      order by (p.full_name is null), b.name`);
    console.log(`THE ${orgs.rows.length} LIVE ORGANIZATIONS THAT WOULD GO:\n`);
    for (const o of orgs.rows) {
      const tag = o.owner ? `owner: ${o.owner}${o.paying ? " · PAYING" : ""}` : "no owner — a proof/test leftover";
      console.log(`   ${o.name.padEnd(26)} ${String(o.city).padEnd(11)} ${tag}`);
    }

    await c.query("begin");
    console.log("\nROWS SOFT-DELETED:\n");
    let total = 0;
    for (const [label, sql] of STEPS) {
      const r = await c.query(sql);
      total += r.rowCount;
      console.log(`   ${String(r.rowCount).padStart(6)}  ${label}`);
    }
    console.log(`   ${String(total).padStart(6)}  TOTAL`);

    // What is deliberately left alone, measured INSIDE the transaction so the
    // claim is about the world this sweep would actually leave behind.
    const kept = await c.query(`
      select
        (select count(*) from orders where event_id is not null)                       as event_orders,
        (select count(*) from payments p join orders o on o.id = p.order_id
          where o.event_id is not null)                                               as event_payments,
        (select count(*) from notifications where kind = 'event')                      as event_notifications,
        (select count(*) from profiles where deleted_at is null)                       as live_people,
        (select count(*) from businesses where type = 'studio' and deleted_at is null) as live_studios,
        (select count(*) from businesses where type = 'artist_page' and deleted_at is null) as live_artist_pages,
        (select count(*) from classes where deleted_at is null)                        as live_classes,
        (select count(*) from crews where deleted_at is null)                          as live_crews,
        (select count(*) from memberships where deleted_at is null)                    as live_memberships`);
    const k = kept.rows[0];
    console.log("\n⚠ LEFT ALONE ON PURPOSE:\n");
    console.log(`   ${String(k.event_orders).padStart(6)}  orders naming an event   (the money — a ledger does not forget)`);
    console.log(`   ${String(k.event_payments).padStart(6)}  payments against them`);
    console.log(`   ${String(k.event_notifications).padStart(6)}  notifications of kind 'event'  (a record of what happened)`);

    if (SHOW_KEPT) {
      console.log("\nWHAT THE APP STILL HAS AFTERWARDS:\n");
      console.log(`   ${String(k.live_people).padStart(6)}  people`);
      console.log(`   ${String(k.live_studios).padStart(6)}  studios`);
      console.log(`   ${String(k.live_artist_pages).padStart(6)}  artist pages`);
      console.log(`   ${String(k.live_classes).padStart(6)}  classes`);
      console.log(`   ${String(k.live_crews).padStart(6)}  crews`);
      console.log(`   ${String(k.live_memberships).padStart(6)}  memberships`);

      const people = await c.query(`
        select p.full_name, p.city,
               (select count(*) from business_members m join businesses b on b.id = m.business_id
                 where m.user_id = p.id and m.member_role = 'owner'
                   and m.deleted_at is null and b.deleted_at is null and b.type = 'studio') as studios
        from profiles p where p.deleted_at is null order by p.full_name limit 60`);
      console.log(`\n   the ${people.rows.length} live accounts (first 60), none of them touched:`);
      for (const p of people.rows) {
        console.log(`     ${String(p.full_name).padEnd(28)} ${String(p.city ?? "").padEnd(12)} ${p.studios > 0 ? p.studios + " studio(s)" : ""}`);
      }
    }

    if (APPLY) {
      await c.query("commit");
      console.log("\n=== APPLIED. Every row above carries a deleted_at; one UPDATE puts it back. ===");
    } else {
      await c.query("rollback");
      console.log("\n=== DRY RUN — rolled back, nothing written. Pass --apply to do it. ===");
    }
  } catch (e) {
    try { await c.query("rollback"); } catch {}
    console.error("\nFAILED (nothing written):", e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
