// Checks for 20261018090000_a_practice_is_a_notice, run inside the dry run's
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
  const refused = async (sql, args, fragment) => {
    await q("savepoint t");
    try {
      await q(sql, args);
      await q("release savepoint t");
      return "went through";
    } catch (e) {
      await q("rollback to savepoint t");
      return fragment === null || e.message.includes(fragment) ? true : e.message;
    }
  };
  const uuid = async () => (await q("select gen_random_uuid() u"))[0].u;
  const ts = (h) => new Date(Date.now() + h * 3600e3).toISOString();
  const notes = async (user, extra = "true", args = []) => {
    await asNobody();
    return (await q(`select count(*)::int n from public.notifications where user_id = $1 and deleted_at is null and ${extra}`, [user, ...args]))[0].n;
  };

  /* ── the world: a crew of a leader, two members, one still asked, a stranger ── */
  await asNobody();
  const ids = {};
  for (const n of ["leader", "m1", "m2", "pending", "stranger"]) {
    const id = await uuid();
    ids[n] = id;
    await q(`insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now())`,
      [id, `dry.prac.${n}.${id.slice(0, 6)}@example.com`]);
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, `Dry ${n}`]);
  }
  const { leader, m1, m2, pending, stranger } = ids;
  await as(leader, "service_role");
  const [{ id: crew }] = await q(`insert into public.crews (name, city, style, leader_id, created_by, updated_by) values ('Dry Practice Crew', 'Pune', 'Hip-Hop', $1, $1, $1) returning id`, [leader]);
  await q(`insert into public.crew_members (crew_id, user_id, role, status, created_by, updated_by) values
           ($1, $2, 'leader', 'confirmed', $2, $2), ($1, $3, 'member', 'confirmed', $2, $2), ($1, $4, 'member', 'confirmed', $2, $2), ($1, $5, 'member', 'asked', $2, $2)`,
    [crew, leader, m1, m2, pending]);

  /* 1 · creating a practice asks nobody and tells every confirmed member */
  const pendingAskNotes = await notes(pending);
  await as(leader);
  const [{ id: practice }] = await q(`select (public.save_crew_practice($1, $2, $3, 'Hall', 'bring water')).id`, [crew, ts(24), ts(26)]);
  await asNobody();
  const asked = await q(`select count(*)::int n from public.crew_practice_people where practice_id = $1`, [practice]);
  check(asked[0].n === 0, "creating a practice writes no ask rows", asked[0].n);
  check(await notes(m1, "title = 'Dry Practice Crew has a practice'") === 1, "member 1 is told");
  check(await notes(m2, "title = 'Dry Practice Crew has a practice' and href = '/practice'") === 1, "member 2 is told, opening /practice");
  check(await notes(leader, "title ilike '%has a practice%'") === 0, "the leader is not told about their own practice");
  check(await notes(pending) === pendingAskNotes, "somebody only ASKED onto the crew is not told");
  check(await notes(stranger) === 0, "a stranger is told nothing");

  /* 2 · my_crew_practices */
  await as(m1);
  const [mine] = await q(`select * from public.my_crew_practices() where practice_id = $1`, [practice]);
  check(mine && mine.my_status === "member" && mine.i_lead === false, "a member reads it as 'member'", mine);
  check(mine && mine.going === 0 && mine.asked === 3, "going 0 of a roster of 3 (leader + 2 confirmed)", mine);
  await as(leader);
  const [lead] = await q(`select * from public.my_crew_practices() where practice_id = $1`, [practice]);
  check(lead && lead.my_status === "leader" && lead.i_lead === true, "the leader reads it as 'leader'", lead);
  await as(pending);
  check((await q(`select * from public.my_crew_practices() where practice_id = $1`, [practice])).length === 0, "an asked-only person does not see it");

  /* 3 · the register is the crew, and check-in needs no answer */
  await as(leader);
  const reg = await q(`select * from public.practice_people($1)`, [practice]);
  check(reg.length === 3, "the register lists the leader and the two confirmed members", reg.map((r) => r.full_name));
  check(reg[0].is_leader === true && reg[0].status === "leader", "the leader is first");
  check(!reg.some((r) => r.user_id === pending), "the asked-only person is not on the register");
  check(await refused(`select public.check_in_practice($1, $2)`, [practice, m1], null) === "went through", "the leader checks a member in without any answer");
  await as(m1);
  const [after] = await q(`select * from public.my_crew_practices() where practice_id = $1`, [practice]);
  check(after.going === 1, "going counts the check-in", after.going);
  const reg2 = await q(`select * from public.practice_people($1)`, [practice]);
  check(reg2.find((r) => r.user_id === m1)?.present === true, "the register shows them present");
  await as(stranger);
  check((await q(`select * from public.practice_people($1)`, [practice])).length === 0, "a stranger reads no register");
  check(await refused(`select public.save_crew_practice($1, $2, $3, 'X')`, [crew, ts(30), ts(31)], "only the person who leads") === true, "a non-leader cannot arrange one");

  /* 4 · a member who leaves after being checked in stays on the register */
  await as(leader, "service_role");
  await q(`update public.crew_members set deleted_at = now() where crew_id = $1 and user_id = $2`, [crew, m1]);
  await as(leader);
  const reg3 = await q(`select * from public.practice_people($1)`, [practice]);
  check(reg3.some((r) => r.user_id === m1 && r.present), "a checked-in leaver stays on the register");
  check(reg3.length === 3, "no duplicate rows", reg3.length);

  /* 5 · moving it tells the confirmed members */
  await as(leader);
  await q(`select public.save_crew_practice($1, $2, $3, 'Hall B', null, $4)`, [crew, ts(48), ts(50), practice]);
  check(await notes(m2, "title = 'Dry Practice Crew moved a practice' and href = '/practice'") === 1, "a move tells a confirmed member");
  check(await notes(leader, "title ilike '%moved a practice%'") === 0, "a move does not tell the leader");

  /* 6 · a crew ask points to the Crews tab */
  await as(leader, "service_role");
  await q(`insert into public.crew_members (crew_id, user_id, role, status, created_by, updated_by) values ($1, $2, 'member', 'asked', $3, $3)`, [crew, stranger, leader]);
  check(await notes(stranger, "href = '/crews?show=in' and title ilike '%wants you on the roster%'") === 1, "a crew ask opens /crews?show=in");

  /* 7 · nothing else moved */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, "anon's executable set is still 40", anon[0].n);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, "public policies still 107", pol[0].n);
  const acl = await q(`select p.proname, p.proacl::text a from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('save_crew_practice','my_crew_practices','practice_people')`);
  check(acl.every((r) => r.a.includes("authenticated=X") && !r.a.includes("anon=X")), "the three doors keep authenticated, not anon", acl);
};
