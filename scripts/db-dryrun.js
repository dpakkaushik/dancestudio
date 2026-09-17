// Run a migration file against the HOSTED database inside BEGIN … ROLLBACK,
// print every NOTICE / WARNING it raises, and dump every `public` function
// before and after — so a catalog-driven rewrite can be READ before anything is
// committed. It never commits: the real apply goes through scripts/db-push.ps1
// so that supabase_migrations records it.
//
// Written for the 16 Sep 2026 rename, where it caught, before the apply, a
// re-created definer RPC coming back executable by anon (a dropped function
// returns with the DATABASE's default grants, not the ones it had). Use it for
// any migration that touches many functions or policies.
//
//   NODE_PATH=<a folder with `pg` installed>/node_modules node scripts/db-dryrun.js supabase/migrations/<file>.sql
//
// `pg` is not one of this app's dependencies (the app never opens a raw
// connection); `npm i pg` in a scratch folder and point NODE_PATH at it, the way
// scripts/shots/*.js borrow Playwright. Dumps land in scripts/shots/shots/
// (gitignored): functions-before.sql, functions-after.sql, shape-{before,after}.txt.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const repo = path.resolve(__dirname, "..");
const outDir = path.join(repo, "scripts", "shots", "shots");
fs.mkdirSync(outDir, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(path.join(repo, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const client = new Client({
  host: "aws-0-ap-south-1.pooler.supabase.com",
  port: 5432, // the SESSION pooler: one connection, one transaction, DO blocks allowed
  user: `postgres.${ref}`,
  password: env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

const DUMP_SQL = `
  select p.proname, pg_get_functiondef(p.oid) as def, obj_description(p.oid, 'pg_proc') as comment, p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
   order by p.proname`;

const SHAPE_SQL = `
  select 'table' as kind, c.relname as name, null as extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'column', c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod)
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  union all
  select 'policy', tablename || ': ' || policyname, cmd || ' to ' || array_to_string(roles, ',') from pg_policies where schemaname in ('public','storage')
  union all
  select 'constraint', conrelid::regclass::text || ': ' || conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index', c.relname, pg_get_indexdef(c.oid) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='i'
  union all
  select 'trigger', t.tgrelid::regclass::text || ': ' || t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
  order by 1, 2`;

const writeDump = (file, rows) =>
  fs.writeFileSync(file, rows.map((r) => `-- ═══ ${r.proname}  acl=${r.acl}\n-- comment: ${r.comment ?? ""}\n${r.def}\n`).join("\n"), "utf8");
const writeShape = (file, rows) =>
  fs.writeFileSync(file, rows.map((r) => `${r.kind}\t${r.name}\t${r.extra ?? ""}`).join("\n"), "utf8");

// the multiset of function ACLs must be identical before and after any
// migration that only renames: a rename moves no grant. Entry ORDER inside an
// ACL follows grant order, so entries are sorted first.
const aclHistogram = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = r.acl ? "{" + r.acl.slice(1, -1).split(",").sort().join(",") + "}" : "<default>";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/db-dryrun.js <migration.sql>"); process.exit(2); }
  const sql = fs.readFileSync(path.resolve(repo, file), "utf8");

  client.on("notice", (n) => console.log(`[${n.severity}] ${n.message}`));
  await client.connect();

  const before = await client.query(DUMP_SQL);
  writeDump(path.join(outDir, "functions-before.sql"), before.rows);
  writeShape(path.join(outDir, "shape-before.txt"), (await client.query(SHAPE_SQL)).rows);
  console.log(`before: ${before.rows.length} functions`);

  await client.query("begin");
  let ok = false;
  try {
    await client.query(sql);
    ok = true;
    const after = await client.query(DUMP_SQL);
    writeDump(path.join(outDir, "functions-after.sql"), after.rows);
    writeShape(path.join(outDir, "shape-after.txt"), (await client.query(SHAPE_SQL)).rows);
    console.log(`after:  ${after.rows.length} functions`);
    const same = JSON.stringify(aclHistogram(before.rows)) === JSON.stringify(aclHistogram(after.rows));
    console.log(`function ACL multiset identical before/after: ${same}`);
    if (!same) {
      console.log("  before:", JSON.stringify(aclHistogram(before.rows)));
      console.log("  after: ", JSON.stringify(aclHistogram(after.rows)));
    }
    console.log(`functions with a comment before/after: ${before.rows.filter((r) => r.comment).length} / ${after.rows.filter((r) => r.comment).length}`);
    const pub = await client.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind='f'
         and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
       order by 1`);
    console.log(`functions executable by PUBLIC after: ${pub.rows.length}`);
  } catch (e) {
    console.error("MIGRATION FAILED:", e.message);
    if (e.where) console.error("where:", e.where);
    if (e.detail) console.error("detail:", e.detail);
    if (e.hint) console.error("hint:", e.hint);
  } finally {
    await client.query("rollback");
    console.log("ROLLED BACK — nothing was committed");
  }
  await client.end();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
