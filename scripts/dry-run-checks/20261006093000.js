// Checks for 20261006093000_an_artist_is_counted_when_shown, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js. An artist shelf
// is recorded the way the server records one (the service role, no session), and
// read back through the new admin read as an admin, as a stranger and as nobody.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const tryq = async (sql, args) => {
    await q("savepoint dos_try");
    try {
      const rows = await q(sql, args);
      await q("release savepoint dos_try");
      return { rows, err: null };
    } catch (e) {
      await q("rollback to savepoint dos_try");
      return { rows: null, err: e.message };
    }
  };

  /* ── the catalog ── */
  await asNobody();
  const ck = (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.impressions'::regclass and conname='impressions_kind_shape'`))[0];
  check(!!ck && /'person'/.test(ck.d) && /'business'/.test(ck.d) && /'class'/.test(ck.d) && /'crew'/.test(ck.d), "the kind CHECK admits person beside the three it had");
  const g = await q(`select has_function_privilege('authenticated', 'public.impressions_for_person(uuid,integer)'::regprocedure, 'execute') a,
                            has_function_privilege('anon', 'public.impressions_for_person(uuid,integer)'::regprocedure, 'execute') n`);
  check(g[0].a && !g[0].n, "impressions_for_person is signed-in only — anon cannot call it");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const ipol = await q(`select count(*)::int n from pg_policies where schemaname='public' and tablename='impressions'`);
  check(ipol[0].n === 0, "impressions still carries no policy at all");
  const tg = await q(`select has_table_privilege('authenticated','public.impressions','select') s, has_table_privilege('anon','public.impressions','insert') i`);
  check(!tg[0].s && !tg[0].i, "no client role reads or writes the table");

  /* ── the cast ── */
  const admin = (await q(`select user_id from public.platform_admins where deleted_at is null limit 1`))[0];
  check(!!admin, "set-up: a live platform admin");
  const people = await q(`select id from public.profiles where deleted_at is null and full_name is not null order by created_at limit 3`);
  const [artist, other, stranger] = people;
  check(people.length === 3, "set-up: three people");

  /* the server's write, as the service role writes it — no session */
  await asNobody();
  const w = await tryq(`insert into public.impressions (viewer_id, surface, city, subject_kind, subject_ids)
                        values (null, 'discover', 'Pune', 'person', array[$1::uuid, $2::uuid])`, [other.id, artist.id]);
  check(!w.err, `a Discover Artists shelf is recorded as kind person (${w.err ?? "ok"})`);
  await q(`insert into public.impressions (viewer_id, surface, city, subject_kind, subject_ids)
           values (null, 'discover', 'Pune', 'person', array[$1::uuid])`, [artist.id]);
  const bad = await tryq(`insert into public.impressions (viewer_id, surface, city, subject_kind, subject_ids)
                          values (null, 'discover', 'Pune', 'studio', array[$1::uuid])`, [artist.id]);
  check(/impressions_kind_shape/.test(bad.err ?? ""), "an invented kind is still refused by the CHECK");
  const biz = await tryq(`insert into public.impressions (viewer_id, surface, city, subject_kind, subject_ids)
                          values (null, 'discover', 'Pune', 'business', array[$1::uuid])`, [artist.id]);
  check(!biz.err, "a business shelf still records as it did");

  /* the admin reads the artist's two shelves: shown 2, median place 1.5 */
  await as(admin.user_id);
  const r = await q(`select surface, shown::int shown, median_position::float m from public.impressions_for_person($1, 30)`, [artist.id]);
  check(r.length === 1 && r[0].surface === "discover" && r[0].shown === 2, `the admin reads the artist shown twice on Discover (${JSON.stringify(r)})`);
  check(r[0] && Math.abs(r[0].m - 1.5) < 1e-9, `…with the median place in the shelf (${r[0]?.m})`);
  const rb = await q(`select count(*)::int n from public.impressions_for_business($1, 30)`, [artist.id]);
  check(rb[0].n === 1, "the business read keeps its own kind — a person's id is not counted as a business twice");

  /* a stranger and the service role read nothing */
  await as(stranger.id);
  const rs = await q(`select count(*)::int n from public.impressions_for_person($1, 30)`, [artist.id]);
  check(rs[0].n === 0, "a signed-in stranger reads nothing");
  await asNobody();
  const rn = await q(`select count(*)::int n from public.impressions_for_person($1, 30)`, [artist.id]);
  check(rn[0].n === 0, "the service role (no session) reads nothing — the 10 Sep rule, kept");
};
