#!/usr/bin/env node
/**
 * READ BACK 20260929090000 OFF THE LIVE CATALOG (29 Sep 2026).
 *
 * Run this AFTER the apply. It does two things, and the second is the one that
 * gets forgotten:
 *
 *   1. It asserts what the migration claimed, against the catalog itself rather
 *      than against the apply's own output. An apply that printed no error is
 *      not the same fact as a database that holds what you meant.
 *
 *   2. It reloads PostgREST's SCHEMA CACHE. An apply does NOT do this (19 Sep
 *      2026, and it cost a whole suite run): the API keeps answering from a
 *      cache that still names functions the migration has dropped, and the
 *      failures read like anything but a stale cache.
 *
 * Usage:  node scripts/readback-removal.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

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

let Client;
try { ({ Client } = require("pg")); }
catch { console.error("This script needs the `pg` client:  npm i -D pg"); process.exit(1); }

const DROPPED = [
  "save_event","publish_event","book_event","cancel_event_booking","check_in_event_booking",
  "add_event_walk_in","delete_event","set_event_status","set_event_poster","event_counts",
  "event_blockers","create_event_payment_order","event_host_cards","event_host_name",
  "why_no_event","respond_to_partner_ask","can_run_events","public_host_ids",
  "guard_event_needs_gstin","events_fill_share_slug","generate_event_slug",
  "notify_event_booking","notify_organization_member",
  "ask_organization_member","respond_to_organization_ask","withdraw_organization_ask",
  "remove_organization_member","set_organization_member_role","org_seat_follows_label",
  "public_organization","public_organization_team","my_followed_organizations","my_org_stats",
  "verify_business_gstin","clear_business_gstin",
];
// ⚠ The five that LOOK droppable and are not — live code stands on each.
const KEPT = [
  "org_is_public","why_no_organization","event_host_is_public","gstin_shape","guard_gstin",
  "create_business_with_owner","send_enquiry","set_follow","business_header_photos",
  "admin_grant_subscription","search_dance_os","dance_chart_all",
  "apply_captured_payment_classes_and_events",
];

let ok = 0, bad = 0;
const check = (label, pass, detail = "") => {
  pass ? ok++ : bad++;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

(async () => {
  const c = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const one = async (sql, args = []) => Object.values((await c.query(sql, args)).rows[0])[0];
    const fnCount = (n) => one(
      `select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
       where ns.nspname='public' and p.proname=$1`, [n]);

    console.log("=== the migration is recorded ===");
    check("20260929090000 is in supabase_migrations", (await one(
      `select count(*)::int from supabase_migrations.schema_migrations where version='20260929090000'`)) === 1);

    console.log("\n=== the doors are shut ===");
    const left = [];
    for (const f of DROPPED) if ((await fnCount(f)) !== 0) left.push(f);
    check(`all ${DROPPED.length} doors gone`, left.length === 0, left.join(", "));

    console.log("\n=== ⚠ the survivors still stand ===");
    const gone = [];
    for (const f of KEPT) if ((await fnCount(f)) === 0) gone.push(f);
    check(`all ${KEPT.length} kept functions present`, gone.length === 0, gone.join(", "));
    check("create_business_with_owner still resolves why_no_organization()", (await one(
      `select pg_get_functiondef(p.oid) ilike '%why_no_organization%'
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='create_business_with_owner'`)) === true);
    check("gstin_shape still answers (two CHECKs stand on it)",
      (await one(`select gstin_shape('ABC12345')`)) === true);

    console.log("\n=== the reads ===");
    check("search returns no event rows",
      (await one(`select count(*)::int from search_dance_os('a', 10) where kind='event'`)) === 0);
    check("search still returns the other kinds",
      (await one(`select count(*)::int from search_dance_os('a', 10)`)) > 0);
    check("no crew scores an event entry any more",
      (await one(`select count(*)::int from dance_chart_all('crew',null,null,50) where conducted <> 0`)) === 0);

    console.log("\n=== the tombstones, and the money ===");
    for (const t of ["events","event_entry_tiers","event_ticket_tiers","event_bookings","organization_members"]) {
      check(`${t} still exists`, (await one(
        `select count(*)::int from information_schema.tables
         where table_schema='public' and table_name=$1`, [t])) === 1);
      check(`  ${t} carries its TOMBSTONE comment`, String(await one(
        `select coalesce(obj_description(($1)::regclass,'pg_class'),'')`, [`public.${t}`])).includes("TOMBSTONE"));
    }
    check("4 orders still name an event",
      (await one(`select count(*)::int from orders where event_id is not null`)) === 4);
    check("4 captured payments still hang off them", (await one(
      `select count(*)::int from payments p join orders o on o.id=p.order_id
       where o.event_id is not null and p.status='captured'`)) === 4);

    console.log("\n=== the privilege surface ===");
    const anon = await one(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')`);
    const pub = await one(`select count(*)::int from pg_policies where schemaname='public'`);
    const st  = await one(`select count(*)::int from pg_policies where schemaname='storage'`);
    const fns = await one(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`);
    check(`anon-executable functions = 39`, anon === 39, String(anon));
    check(`public policies = 103`, pub === 103, String(pub));
    check(`storage policies = 21 (unchanged)`, st === 21, String(st));
    check(`public functions = 256`, fns === 256, String(fns));

    // ⚠ THE STEP AN APPLY DOES NOT TAKE.
    console.log("\n=== reloading PostgREST's schema cache ===");
    await c.query(`notify pgrst, 'reload schema'`);
    console.log("  sent: notify pgrst, 'reload schema'");

    console.log(`\n${ok} ok, ${bad} failed`);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error("\nREAD-BACK FAILED:", e.message);
    process.exit(1);
  } finally { await c.end(); }
})();
