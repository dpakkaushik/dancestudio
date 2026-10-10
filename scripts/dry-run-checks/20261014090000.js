// Checks for 20261014090000_weekly_classes_are_gone, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  await q("reset role");
  await q(`select set_config('request.jwt.claims', '{}', true)`);

  /* ── the three doors are gone, and only they ── */
  for (const name of ["add_weekly_sessions", "create_class_series", "cancel_class_session"]) {
    const r = await q(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname = $1`, [name]);
    check(r[0].n === 0, `${name} is dropped`);
  }

  /* ── the three bodies the weekly migration edited are still there, with their grants ── */
  for (const f of [
    "update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean)",
    "cancel_class_bookings_for_class(uuid, text)",
    "create_class_with_session(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text)",
  ]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} still there — signed-in yes, anon no`);
  }
  const ar = await q(`select has_function_privilege('authenticated', 'public.assert_room_ok(uuid)'::regprocedure, 'execute') a`);
  check(!ar[0].a, "assert_room_ok still there and executable by no client role");

  /* ── nothing on record depended on them ── */
  const multi = await q(`
    select count(*)::int n from (
      select s.class_id from public.class_sessions s
        join public.classes c on c.id = s.class_id and c.deleted_at is null
       where s.deleted_at is null
       group by s.class_id having count(*) > 1) t`);
  check(multi[0].n === 0, `no live class has more than one live session (${multi[0].n})`);
  const alone = await q(`
    select count(*)::int n from public.class_sessions s
      join public.classes c on c.id = s.class_id and c.deleted_at is null
     where s.deleted_at is not null`);
  check(alone[0].n === 0, `no session of a live class was called off on its own (${alone[0].n})`);

  /* ── nothing else moved ── */
  const anon = await q(`
    select count(*)::int n from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, `public policies unchanged (${pol[0].n})`);
};
