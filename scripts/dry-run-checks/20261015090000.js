// Checks for 20261015090000_a_published_class_is_fixed, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (sub, role = "authenticated") => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
    if (role === "authenticated") await q("set local role authenticated");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  /* an expected refusal on its own savepoint, or it aborts every check after it */
  const refused = async (sql, args, fragment) => {
    await q("savepoint t");
    try {
      await q(sql, args);
      await q("release savepoint t");
      return "went through";
    } catch (e) {
      await q("rollback to savepoint t");
      return e.message.includes(fragment) ? true : e.message;
    }
  };
  const allowed = async (sql, args) => {
    await q("savepoint t");
    try {
      const r = await c.query(sql, args);
      await q("release savepoint t");
      return r.rowCount;
    } catch (e) {
      await q("rollback to savepoint t");
      return e.message;
    }
  };
  const SENT = "A published class cannot be edited";

  await asNobody();
  /* ── the backfill ── */
  const left = await q(`select count(*)::int n from public.class_people cp join public.classes c on c.id = cp.class_id
                         where cp.deleted_at is null and c.deleted_at is not null`);
  check(left[0].n === 0, `no live request is left on a deleted class (${left[0].n})`);
  const closedAt = await q(`select count(*)::int n from public.class_people cp join public.classes c on c.id = cp.class_id
                             where c.deleted_at is not null and cp.deleted_at = c.deleted_at`);
  check(closedAt[0].n >= 53, `the 53 were closed at their class's own deletion instant (${closedAt[0].n} rows carry it)`);

  /* ── a published class of a studio, its owner, and its session ── */
  const [pub] = await q(`
    select c.id, c.price_inr, s.id as session_id, s.starts_at, s.ends_at, m.user_id as owner
      from public.classes c
      join public.class_sessions s on s.class_id = c.id and s.deleted_at is null
      join public.business_members m on m.business_id = c.business_id and m.member_role = 'owner' and m.deleted_at is null
     where c.status = 'published' and c.deleted_at is null and s.starts_at > now() + interval '1 day'
     limit 1`);
  check(Boolean(pub), "found a published class ahead, with its owner");
  if (!pub) return;

  await as(pub.owner);
  const r1 = await refused(`update public.classes set price_inr = price_inr + 1 where id = $1`, [pub.id], SENT);
  check(r1 === true, `⚠⚠ the owner cannot change a published class's price (${r1})`);
  const r2 = await refused(`update public.classes set capacity = capacity + 1 where id = $1`, [pub.id], SENT);
  check(r2 === true, `…nor its capacity (${r2})`);
  const r3 = await refused(`update public.class_sessions set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1`, [pub.session_id], SENT);
  check(r3 === true, `…nor move its session (${r3})`);
  const r4 = await allowed(`update public.class_sessions set starts_at = starts_at where id = $1`, [pub.session_id]);
  check(r4 === 1, `…but re-saving the same minute is not a move (${r4})`);
  const r5 = await allowed(`update public.classes set poster = poster where id = $1`, [pub.id]);
  check(r5 === 1, `…and a write that changes none of it still goes through (${r5})`);

  await as(pub.owner, "service_role");
  const r6 = await allowed(`update public.classes set price_inr = price_inr + 1 where id = $1`, [pub.id]);
  check(r6 === 1, `the service role is exempt, as with every guard (${r6})`);

  /* ── a draft is still editable ── */
  await asNobody();
  const [draft] = await q(`
    select c.id, m.user_id as owner from public.classes c
      join public.business_members m on m.business_id = c.business_id and m.member_role = 'owner' and m.deleted_at is null
     where c.status = 'draft' and c.deleted_at is null limit 1`);
  if (draft) {
    await as(draft.owner);
    const r7 = await allowed(`update public.classes set price_inr = price_inr + 1 where id = $1`, [draft.id]);
    check(r7 === 1, `a DRAFT's price still changes (${r7})`);
  } else {
    check(true, "(no live draft on production to test a draft edit against)");
  }

  /* ── deleting a class closes its people ── */
  await asNobody();
  const [withPeople] = await q(`
    select c.id, m.user_id as owner from public.classes c
      join public.business_members m on m.business_id = c.business_id and m.member_role = 'owner' and m.deleted_at is null
     where c.deleted_at is null
       and exists (select 1 from public.class_people cp where cp.class_id = c.id and cp.deleted_at is null)
     limit 1`);
  check(Boolean(withPeople), "found a live class with live people on it");
  if (withPeople) {
    await as(withPeople.owner);
    const r8 = await allowed(`update public.classes set deleted_at = now() where id = $1`, [withPeople.id]);
    check(r8 === 1, `its owner can still delete it, published or not (${r8})`);
    await asNobody();
    const live = await q(`select count(*)::int n from public.class_people where class_id = $1 and deleted_at is null`, [withPeople.id]);
    check(live[0].n === 0, `⚠⚠ …and every request on it closed with it (${live[0].n} live)`);
    const same = await q(`select count(*)::int n from public.class_people cp join public.classes c on c.id = cp.class_id
                           where c.id = $1 and cp.deleted_at <> c.deleted_at`, [withPeople.id]);
    check(same[0].n === 0, `…at the class's own deletion instant (${same[0].n} differ)`);
  }

  /* ── nothing else moved ── */
  await asNobody();
  for (const f of ["guard_published_class_fixed", "guard_published_session_fixed", "close_people_with_class"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}()`]);
    check(!g[0].a && !g[0].n, `${f} is executable by no client role`);
  }
  const anon = await q(`select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, `public policies unchanged (${pol[0].n})`);
};
