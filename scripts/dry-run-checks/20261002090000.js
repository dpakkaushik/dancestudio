// Checks for 20261002090000_a_follow_list_is_as_public_as_its_count, run inside
// the dry run's rolled-back transaction by scripts/dry-run-migration.js.
// Contract: module.exports = async (client, { check, one }).
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  /* act as a real signed-in person — the functions refuse nobody else */
  const asUser = async (uid, fn) => {
    await c.query("savepoint u");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await c.query("set local role authenticated");
    try {
      return await fn();
    } finally {
      await c.query("rollback to savepoint u");
    }
  };

  const someone = (await q(`select id from public.profiles where deleted_at is null order by created_at limit 1`))[0];
  check(Boolean(someone), "there is a live profile to read as");

  /* 1 · every live listed business: the list is the count */
  const biz = await q(`select id from public.businesses where deleted_at is null and visibility='listed' and type in ('studio','artist_page')`);
  let bizBad = 0;
  for (const b of biz) {
    const n = Number((await q(`select followers from public.follower_counts(array[$1::uuid])`, [b.id]))[0]?.followers ?? 0);
    const rows = await asUser(someone.id, () => q(`select * from public.profile_followers('business', $1)`, [b.id]));
    if (rows.length !== n) bizBad++;
  }
  check(bizBad === 0, `every listed business: followers list == count (${biz.length} checked, ${bizBad} disagree)`);

  /* 2 · every live person: both directions agree with person_follower_counts */
  const people = await q(`select id from public.profiles where deleted_at is null`);
  let pBad = 0;
  for (const p of people) {
    /* ⚠ read the COUNT as a signed-in person too: `person_follower_counts`
       answers a session-less caller for a public artist only (R24), so asking it
       as the superuser compared the list to a zero nobody measured */
    const cnt = (await asUser(someone.id, () => q(`select followers, following from public.person_follower_counts(array[$1::uuid])`, [p.id])))[0] ?? { followers: 0, following: 0 };
    const fr = await asUser(someone.id, () => q(`select * from public.profile_followers('person', $1)`, [p.id]));
    const fg = await asUser(someone.id, () => q(`select * from public.profile_following($1)`, [p.id]));
    if (fr.length !== Number(cnt.followers) || fg.length !== Number(cnt.following)) {
      pBad++;
      if (pBad <= 3) console.log(`       ${p.id}: followers list ${fr.length} vs count ${cnt.followers}; following list ${fg.length} vs count ${cnt.following}`);
    }
  }
  check(pBad === 0, `every person: followers AND following lists == their counts (${people.length} checked, ${pBad} disagree)`);

  /* 3 · every live crew */
  const crews = await q(`select id from public.crews where deleted_at is null`);
  let cBad = 0;
  for (const cr of crews) {
    const n = Number((await q(`select followers from public.crew_follower_counts(array[$1::uuid])`, [cr.id]))[0]?.followers ?? 0);
    const rows = await asUser(someone.id, () => q(`select * from public.profile_followers('crew', $1)`, [cr.id]));
    if (rows.length !== n) cBad++;
  }
  check(cBad === 0, `every crew: followers list == count (${crews.length} checked, ${cBad} disagree)`);

  /* 4 · a stranger gets nothing — refused, not emptied */
  let anonRefused = false;
  await c.query("savepoint a");
  try {
    await c.query("set local role anon");
    await c.query(`select * from public.profile_followers('person', $1)`, [someone.id]);
  } catch (e) {
    anonRefused = /permission denied/.test(e.message);
  }
  await c.query("rollback to savepoint a");
  check(anonRefused, "anon cannot execute profile_followers");

  /* 5 · a bad kind is refused in words */
  let bad = "";
  await c.query("savepoint k");
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: someone.id, role: "authenticated" })]);
    await c.query(`select * from public.profile_followers('room', $1)`, [someone.id]);
  } catch (e) {
    bad = e.message;
  }
  await c.query("rollback to savepoint k");
  check(/a business's, a person's or a crew's/.test(bad), `an invented kind is refused in words ("${bad}")`);

  /* 6 · nothing else moved */
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);
  const two = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('profile_followers','profile_following')`);
  check(two[0].n === 2, "exactly the two functions, no overloads");
};
