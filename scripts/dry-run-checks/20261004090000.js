// Checks for 20261004090000_a_room_in_use_stays, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. A real studio's
// rooms, removed as the real owner through the same UPDATE PostgREST sends.
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
  const asService = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
  };
  /* an expected refusal gets its own savepoint, or the first raise aborts the rest */
  const refused = async (sql, args) => {
    await q("savepoint dos_try");
    try {
      await q(sql, args);
      await q("release savepoint dos_try");
      return null;
    } catch (e) {
      await q("rollback to savepoint dos_try");
      return e.message;
    }
  };
  /* a plant's status flip, past the CLASS triggers (publish needs a teacher's yes) —
     ⚠ replica mode silences every trigger, so it is switched off again at once and
     never wraps a statement on `rooms`, which is what this run is testing */
  const setStatus = async (cls, status) => {
    await asNobody();
    await q("set local session_replication_role = replica");
    await q(`update public.classes set status = $2 where id = $1`, [cls, status]);
    await q("set local session_replication_role = origin");
  };
  const remove = (id) => `update public.rooms set deleted_at = now() where id = '${id}' and deleted_at is null returning id`;
  const live = async (id) => (await q(`select deleted_at is null live from public.rooms where id = $1`, [id]))[0]?.live;

  /* ── the catalog ── */
  await asNobody();
  const fn = await q(`select prosecdef, array(select a::text from unnest(coalesce(proacl,'{}')) a order by 1) acl
                        from pg_proc where pronamespace='public'::regnamespace and proname = 'guard_room_removal'`);
  check(fn.length === 1 && fn[0].prosecdef, `guard_room_removal exists once, security definer (${fn.length})`);
  check(!fn[0].acl.some((a) => /^(anon|authenticated|=)/.test(a)), `no client role may execute it (${fn[0].acl})`);
  const trg = await q(`select tgname from pg_trigger where tgrelid = 'public.rooms'::regclass and not tgisinternal and tgname = 'rooms_guard_removal'`);
  check(trg.length === 1, `the trigger is bound on rooms (${trg.length})`);
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast: a live studio and its owner ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  check(!!biz, `set-up: a live studio with an owner (${biz?.id})`);
  await asNobody();
  const mk = async (name) => (await q(`insert into public.rooms (business_id, name, capacity, amenities, created_by, updated_by)
     values ($1, $2, 20, '{}', $3, $3) returning id`, [biz.id, name, biz.owner_id]))[0].id;
  // take the studio down to exactly the rooms this run plants
  await q(`update public.rooms set deleted_at = now() where business_id = $1 and deleted_at is null`, [biz.id]);
  const a = await mk("Dry Room A");
  const b = await mk("Dry Room B");

  /* 1 · a free room goes when another remains */
  await as(biz.owner_id);
  const e1 = await refused(remove(b));
  check(e1 === null, `the owner removes a free room while another remains (${e1})`);
  check((await live(b)) === false, `…and it is gone`);

  /* 2 · the last room is refused in words */
  const e2 = await refused(remove(a));
  check(/at least one room/.test(e2 ?? ""), `⚠ the studio's LAST room is refused (${e2})`);
  check((await live(a)) === true, `…and it is still there`);

  /* 3 · a room holding a published class still to run is refused */
  await asNobody();
  const c2 = await mk("Dry Room C");
  const cls = (await q(`insert into public.classes (business_id, title, style, level, room, room_id, price_inr, capacity, status, created_by, updated_by)
      values ($1, 'Hip-Hop · All levels', 'Hip-Hop', 'all', 'Dry Room C', $2, 0, 10, 'draft', $3, $3) returning id`, [biz.id, c2, biz.owner_id]))[0].id;
  await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() + interval '3 days', now() + interval '3 days 1 hour', $3, $3)`, [cls, biz.id, biz.owner_id]);
  await setStatus(cls, "published");
  await as(biz.owner_id);
  const e3 = await refused(remove(c2));
  check(/1 published class still to run/.test(e3 ?? ""), `⚠ a room holding a published class still to run is refused (${e3})`);
  check((await live(c2)) === true, `…and it is still there`);

  /* 4 · a DRAFT holds no room */
  await setStatus(cls, "draft");
  await as(biz.owner_id);
  const e4 = await refused(remove(c2));
  check(e4 === null, `a room holding only a draft may go (${e4})`);

  /* 5 · a published class whose session has ENDED holds no room either */
  await asNobody();
  const d = await mk("Dry Room D");
  const old = (await q(`insert into public.classes (business_id, title, style, level, room, room_id, price_inr, capacity, status, created_by, updated_by)
      values ($1, 'Kathak · All levels', 'Kathak', 'all', 'Dry Room D', $2, 0, 10, 'draft', $3, $3) returning id`, [biz.id, d, biz.owner_id]))[0].id;
  await asService();
  await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', $3, $3)`, [old, biz.id, biz.owner_id]);
  await setStatus(old, "published");
  await as(biz.owner_id);
  const e5 = await refused(remove(d));
  check(e5 === null, `a room whose published class is over may go — history keeps the room's name (${e5})`);

  /* 6 · the service role is exempt, and so is a session-less connection */
  await asService();
  const e6 = await refused(remove(a));
  check(e6 === null, `the service role may remove even the last room (${e6})`);
  await asNobody();
  await q(`update public.rooms set deleted_at = null where id = $1`, [a]);
  const e6b = await refused(remove(a));
  check(e6b === null, `a session-less connection (a migration, a sweep) is exempt (${e6b})`);

  /* 7 · a deleted studio takes its rooms with it, even as the owner */
  await q(`update public.rooms set deleted_at = null where id = $1`, [a]);
  await q(`update public.businesses set deleted_at = now() where id = $1`, [biz.id]);
  await as(biz.owner_id);
  const e7 = await refused(remove(a));
  // RLS may hide a deleted studio's room from its owner; either way the trigger must not be what refuses
  check(!/at least one room|still to run/.test(e7 ?? ""), `a deleted studio's last room is not held by the guard (${e7 ?? "allowed"})`);

  /* 8 · an edit that is not a removal is untouched */
  await asNobody();
  await q(`update public.businesses set deleted_at = null where id = $1`, [biz.id]);
  await q(`update public.rooms set deleted_at = null where id = $1`, [a]);
  await q(`update public.rooms set deleted_at = now() where business_id = $1 and id <> $2 and deleted_at is null`, [biz.id, a]);
  await as(biz.owner_id);
  const e8 = await refused(`update public.rooms set capacity = 25 where id = '${a}' returning id`);
  check(e8 === null, `renaming or resizing the last room still works (${e8})`);
  await asNobody();
};
