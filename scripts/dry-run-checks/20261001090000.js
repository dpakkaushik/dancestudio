// Checks for 20261001090000_an_artist_has_one_profile, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
// Contract: module.exports = async (client, { check, one }).
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const def = (await q(`select pg_get_functiondef(p.oid) d, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='why_no_class'`))[0];
  check(def && def.d.includes("Teaching your own classes needs a live Artist plan"), "why_no_class says the new sentence");
  check(def && !/artist page/i.test(def.d.replace(/An organization does not run classes[^']*'/, "")), "…and no longer names an artist page to an artist");
  check(def && def.d.includes("An organization does not run classes"), "…and nothing else in the body moved (the dead organization line is still there)");
  check(def && def.acl === "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", `…with the same grants (${def && def.acl})`);
  const n = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='why_no_class'`);
  check(n[0].n === 1, "replaced, not overloaded");
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  /* the sentence actually comes back for a lapsed artist page, if production has one */
  const lapsed = await q(`select b.id from public.businesses b where b.type='artist_page' and b.deleted_at is null and not public.artist_plan_active(public.business_owner(b.id)) limit 1`);
  if (lapsed.length) {
    const r = await q(`select public.why_no_class($1) s`, [lapsed[0].id]);
    check(r[0].s && r[0].s.startsWith("Teaching your own classes"), `a lapsed artist reads it: "${r[0].s}"`);
  }
  const live = await q(`select b.id from public.businesses b where b.type='studio' and b.deleted_at is null limit 1`);
  if (live.length) {
    const r = await q(`select public.why_no_class($1) s`, [live[0].id]);
    check(r[0].s === null, "a studio still gets null — nothing stands in its way");
  }
};
