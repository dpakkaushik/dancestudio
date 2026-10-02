// Checks for 20261002130000_a_check_in_tells_the_person, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js.
// Contract: module.exports = async (client, { check }).
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;

  const trg = await q(`select tgname from pg_trigger where tgrelid='public.attendance'::regclass and not tgisinternal and tgname='attendance_notify_checked_in'`);
  check(trg.length === 1, "the trigger is bound on attendance");
  const fn = (await q(`select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_checked_in'`))[0];
  check(Boolean(fn), "the trigger function exists");
  const exec = await q(`select has_function_privilege('anon',$1::oid,'execute') a, has_function_privilege('authenticated',$1::oid,'execute') u`, [fn.oid]);
  check(!exec[0].a && !exec[0].u, "no client role may execute it");
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);

  /* behaviour: a real enrolled seat with no live attendance, checked in by the superuser */
  await q(`select set_config('request.jwt.claims', '{}', true)`);
  const seat = (await q(`
    select b.id, b.session_id, b.class_id, b.business_id, b.user_id
      from public.class_bookings b
      join public.profiles p on p.id = b.user_id and p.deleted_at is null
     where b.status='enrolled' and b.deleted_at is null and b.user_id is not null
       and not exists (select 1 from public.attendance a where a.class_booking_id=b.id and a.deleted_at is null)
     limit 1`))[0];
  if (!seat) {
    check(true, "no unattended seat on production to plant — behaviour not exercised");
    return;
  }
  const before = (await q(`select count(*)::int n from public.notifications where user_id=$1`, [seat.user_id]))[0].n;
  await q(`insert into public.attendance (class_booking_id, session_id, class_id, business_id, user_id, created_by, updated_by)
           values ($1,$2,$3,$4,$5,$5,$5)`, [seat.id, seat.session_id, seat.class_id, seat.business_id, seat.user_id]);
  const rows = await q(`select title, body, href, kind from public.notifications where user_id=$1 order by created_at desc limit 1`, [seat.user_id]);
  const after = (await q(`select count(*)::int n from public.notifications where user_id=$1`, [seat.user_id]))[0].n;
  check(after === before + 1, `the person was told once (${before} -> ${after})`);
  check(rows[0] && rows[0].title === "You are checked in" && rows[0].kind === "class", `it says so: "${rows[0] && rows[0].title}" / ${rows[0] && rows[0].kind}`);
  check(rows[0] && /^\/c\//.test(rows[0].href || ""), `and opens the class (${rows[0] && rows[0].href})`);

  /* a check-out (soft delete) says nothing more */
  await q(`update public.attendance set deleted_at=now() where class_booking_id=$1 and deleted_at is null`, [seat.id]);
  const out = (await q(`select count(*)::int n from public.notifications where user_id=$1`, [seat.user_id]))[0].n;
  check(out === after, "checking out raises nothing");
};
