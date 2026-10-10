// Checks for 20261012090000_near_me_without_geography, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. The new haversine
// answer is compared, row by row, with the OLD PostGIS answer computed inline
// as the same reader — so "nothing a person sees changes" is measured, not said.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })]);
    await q(uid ? "set local role authenticated" : "set local role anon");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };

  /* ── the catalog ── */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 107, `public policies unchanged (${pol[0].n})`);
  const sig = "public.nearby_businesses(double precision,double precision,double precision,text,integer,integer)";
  const fn = (await q(`select pg_get_functiondef($1::regprocedure) d, p.prosecdef sd, p.provolatile v from pg_proc p where p.oid = $1::regprocedure`, [sig]))[0];
  check(!/geography|st_dwithin|st_distance|st_makepoint|st_setsrid/i.test(fn.d) && fn.d.includes("6371.0088"), "the body is haversine, with no PostGIS left in it");
  check(fn.sd === false && fn.v === "s", "still SECURITY INVOKER and STABLE");
  for (const role of ["anon", "authenticated", "service_role"]) {
    const x = (await q(`select has_function_privilege($1, $2::regprocedure, 'execute') x`, [role, sig]))[0].x;
    check(x, `${role} may still call it`);
  }
  const overloads = await q(`select count(*)::int n from pg_proc where proname = 'nearby_businesses'`);
  check(overloads[0].n === 1, "exactly one nearby_businesses (no overload)");

  /* ── the answer, old against new, as a stranger and as a signed-in person ── */
  const OLD = `
    select t.id, round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography) / 1000.0)::numeric, 1)::float8 km
    from public.businesses t
    where t.deleted_at is null and t.lat is not null and t.lng is not null and ($4::text is null or t.type = $4)
      and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography, $3 * 1000.0)
    order by km, t.name limit 200`;
  const NEW = `select id, distance_km km from public.nearby_businesses($1, $2, $3, $4, 200, 0)`;
  const centres = [
    ["Pune", 18.5204, 73.8567, 25],
    ["Gurugram", 28.4595, 77.0266, 25],
    ["New Delhi", 28.6139, 77.209, 25],
    ["Bengaluru", 12.9716, 77.5946, 50],
    ["India, nationwide", 22.5, 79.0, 3000],
  ];
  const someone = (await q(`select id from public.profiles where deleted_at is null order by created_at limit 1`))[0].id;
  for (const who of [null, someone]) {
    await as(who);
    for (const [name, lat, lng, r] of centres) {
      for (const type of ["studio", null]) {
        const a = await q(OLD, [lat, lng, r, type]);
        const b = await q(NEW, [lat, lng, r, type]);
        const ids = (rows) => rows.map((x) => x.id).sort().join(",");
        const worst = b.reduce((m, x) => {
          const o = a.find((y) => y.id === x.id);
          return o ? Math.max(m, Math.abs(o.km - x.km) - Math.max(0.15, o.km * 0.006)) : m;
        }, -1);
        check(ids(a) === ids(b) && worst <= 0, `${who ? "signed in" : "stranger"} · ${name} ${r} km · ${type ?? "any"}: same ${b.length} businesses, distances within 0.6 %${ids(a) === ids(b) ? "" : ` — old ${a.length} vs new ${b.length}`}`);
      }
    }
  }
  /* the page past the first still pages */
  await as(someone);
  const p1 = await q(`select id from public.nearby_businesses(22.5, 79.0, 3000, null, 2, 0)`);
  const p2 = await q(`select id from public.nearby_businesses(22.5, 79.0, 3000, null, 2, 2)`);
  check(p1.length <= 2 && p2.every((x) => !p1.some((y) => y.id === x.id)), `limit and offset still page (${p1.length} then ${p2.length}, no overlap)`);
  await asNobody();
};
