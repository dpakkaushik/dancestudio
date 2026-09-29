/** ⚠⚠ A DRY RUN THAT CANNOT SILENTLY COMMIT (29 Sep 2026).
 *
 *  Every migration since 16 Sep has been applied inside `BEGIN … ROLLBACK`
 *  against production first, through a throwaway script in the scratchpad. On
 *  29 Sep one of those scripts COMMITTED, and the reason is the one thing none
 *  of them ever checked:
 *
 *      THE MIGRATION FILE OPENS `begin;` AND CLOSES `commit;`.
 *
 *  Postgres does not nest transactions. Inside an already-open transaction the
 *  file's `begin` is a WARNING ("there is already a transaction in progress")
 *  and its `commit` **ends the outer transaction** — so everything the script
 *  had done up to that line was committed, the migration went live unapproved,
 *  and the script's own `rollback` at the end had nothing left to undo and said
 *  nothing about it. It printed "ROLLED BACK, nothing persisted", which was a
 *  lie the harness could not detect.
 *
 *  What it cost: a real account (a demo-world profile the dry run had
 *  soft-deleted as its planted case) stayed deleted on production, and a
 *  migration the user had not yet seen was live. Both were repaired within the
 *  hour, and only because a later measurement disagreed with the function body
 *  the catalog printed — nothing in the run itself flagged it.
 *
 *  ⚠ THE FIX IS TO ASSERT THE TRANSACTION IS STILL OPEN, not to strip the
 *  file's `begin`/`commit`: stripping edits the thing under test, and a
 *  migration that behaves differently in the dry run from the way it will
 *  behave in `db push` is not a dry run either. `txid_current_if_assigned()`
 *  and `pg_current_xact_id_if_assigned()` do not answer this; the honest probe
 *  is a SAVEPOINT, which errors with 25P01 outside a transaction block.
 *
 *  ⚠⚠ AND THE REAL FIX IS UPSTREAM: DO NOT WRITE `begin;`/`commit;` IN A
 *  MIGRATION. `supabase db push` wraps each file in a transaction already, so
 *  they buy nothing and are the whole of this trap. Counted the day this was
 *  written: **9 of 121 files carry them, and eight are from the last three
 *  days** — it is a habit that crept in, not the house style. The nine that
 *  exist stay as they are (Rule 4: never edit an applied migration).
 *
 *  USE:  node scripts/dry-run-migration.js <migration file> [checks module]
 *
 *  The optional checks module exports `async (client, helpers) => void` and is
 *  run after the file applies, inside the same transaction. `helpers` carries
 *  `check(cond, label, extra)` and `one(sql, args)`.
 *
 *  ⚠ `pg` IS NOT A DEPENDENCY OF THIS REPO (`npm i -D pg` has failed here with
 *  ERESOLVE more than once), so every dry run to date has lived in the session
 *  scratchpad where it was installed. This script looks for it there too:
 *  set `NODE_PATH` to that `node_modules`, the way the shoot scripts are run.
 */

const fs = require("fs");
const path = require("path");

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error(
    "\nThis needs the `pg` client, which is not a dependency of this repo.\n" +
      "Install it in the session scratchpad and point NODE_PATH at it:\n" +
      "  cd <scratchpad> && npm i pg\n" +
      '  $env:NODE_PATH="<scratchpad>\\node_modules"; node scripts/dry-run-migration.js <file>\n'
  );
  process.exit(2);
}

const [, , FILE_ARG, CHECKS_ARG] = process.argv;
if (!FILE_ARG) {
  console.error("usage: node scripts/dry-run-migration.js <migration.sql> [checks.js]");
  process.exit(2);
}

const root = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const pw = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
const url = `postgresql://postgres.${ref}:${pw}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

let ok = 0;
let bad = 0;
const check = (cond, label, extra) => {
  if (cond) {
    ok++;
    console.log(`  ok   ${label}`);
  } else {
    bad++;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

/** Are we still inside the transaction we opened? A SAVEPOINT outside a
 *  transaction block raises 25P01, which is exactly the question. */
async function stillInTransaction(c) {
  try {
    await c.query("savepoint dos_probe");
    await c.query("release savepoint dos_probe");
    return true;
  } catch (e) {
    if (e.code === "25P01") return false;
    throw e;
  }
}

(async () => {
  const sql = fs.readFileSync(path.resolve(root, FILE_ARG), "utf8");

  /* ⚠ SAID BEFORE IT RUNS, so nobody reads a green tally and assumes safety */
  const owns = /^\s*begin\s*;/im.test(sql);
  if (owns) {
    console.log(
      "\n⚠ THIS FILE OPENS ITS OWN TRANSACTION. Its `commit` will end the dry run's\n" +
        "  outer transaction and everything up to that point becomes PERMANENT.\n" +
        "  The run below asserts that afterwards and REFUSES to report success if it\n" +
        "  happened — but plant nothing destructive before the apply, whatever it says.\n"
    );
  }

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin");

  let committed = false;
  try {
    await c.query(sql);
    console.log("  (migration applied inside the transaction)\n");

    committed = !(await stillInTransaction(c));
    check(!committed, "0  THE RUN IS STILL A DRY RUN — the file did not commit the outer transaction");

    if (CHECKS_ARG) {
      const mod = require(path.resolve(root, CHECKS_ARG));
      const run = typeof mod === "function" ? mod : mod.default;
      await run(c, { check, one: async (q, a = []) => (await c.query(q, a)).rows[0] });
    }
  } catch (e) {
    bad++;
    console.log(`  FAIL (threw) — ${e.message}`);
  } finally {
    try {
      await c.query("rollback");
    } catch {
      /* already out of the transaction — the 25P01 case, reported above */
    }
    await c.end();
  }

  if (committed) {
    console.log(
      `\n⚠⚠ ${ok} ok, ${bad} failed — AND THE TRANSACTION WAS COMMITTED BY THE FILE.\n` +
        "   THIS WAS NOT A DRY RUN. The migration is live and anything this script\n" +
        "   planted before the apply is live with it. Read the catalog back, undo\n" +
        "   what was planted, and tell the user before doing anything else."
    );
    process.exit(1);
  }
  console.log(`\n${ok} ok, ${bad} failed — ROLLED BACK, nothing persisted`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error("FAILED", e.message);
  process.exit(1);
});
