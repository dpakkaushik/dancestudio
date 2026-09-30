/* Snapshot the LIVE bodies of the functions 20260930130000 re-creates, so the
   dry run can diff what it applied against what was there and print every
   line that moved (the 28 Sep lesson: five of six re-typed bodies were wrong). */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const url = `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

const NAMES = ["why_no_membership", "buy_membership", "business_memberships", "public_memberships", "apply_membership_payment"];

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const out = {};
  for (const n of NAMES) {
    const r = await c.query(
      `select pg_get_functiondef(p.oid) def, pg_get_function_identity_arguments(p.oid) args,
              (select array_agg(r order by r) from unnest(array['anon','authenticated','service_role']) r where has_function_privilege(r, p.oid, 'execute')) grants
         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = $1`,
      [n]
    );
    out[n] = r.rows.map((x) => ({ args: x.args, def: x.def, grants: x.grants }));
  }
  const counts = await c.query(`
    select (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public') fns,
           (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and has_function_privilege('anon', p.oid, 'execute')) anon,
           (select count(*)::int from pg_policies where schemaname='public') pols,
           (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relname='class_sessions' and not t.tgisinternal) sess_triggers`);
  out.__counts = counts.rows[0];
  fs.writeFileSync(path.join(__dirname, "before.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.__counts), Object.fromEntries(NAMES.map((n) => [n, out[n].length])));
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
