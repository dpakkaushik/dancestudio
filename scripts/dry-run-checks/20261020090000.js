// Checks for 20261020090000_artist_team_invites_open_team, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js.
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
  const uuid = async () => (await q("select gen_random_uuid() u"))[0].u;
  const notes = async (user, extra) => {
    await asNobody();
    return (await q(`select count(*)::int n from public.notifications where user_id = $1 and deleted_at is null and ${extra}`, [user]))[0].n;
  };

  /* 0 · the shape and the grants */
  await asNobody();
  const res = await q("select pg_get_function_result(oid) r from pg_proc where proname='my_answered_invites' and pronamespace='public'::regnamespace");
  check(res.length === 1 && /business_type text\)$/.test(res[0].r), "my_answered_invites: one function, business_type last", res.map((r) => r.r).join(" | "));
  const acl = await q("select has_function_privilege('anon', oid, 'execute') a, has_function_privilege('authenticated', oid, 'execute') u, has_function_privilege('service_role', oid, 'execute') s from pg_proc where proname='my_answered_invites' and pronamespace='public'::regnamespace");
  check(acl[0].u && acl[0].s && !acl[0].a, "authenticated + service_role, never anon", JSON.stringify(acl[0]));
  const anon = await q("select count(*)::int n from pg_proc p where pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')");
  check(anon[0].n === 40, "anon executable set still 40", anon[0].n);
  const pol = await q("select count(*)::int n from pg_policies where schemaname='public'");
  check(pol[0].n === 107, "public policies still 107", pol[0].n);
  check((await q("select public.notification_group('people', '/team') g"))[0].g === "team", "/team is the team area");
  check((await q("select public.notification_group('people', '/team?show=x') g"))[0].g === "team", "/team?… is the team area");
  check((await q("select public.notification_group('people', '/teams') g"))[0].g === "danceos", "/teams is not");
  check((await q("select public.notification_group('people', '/business?show=team') g"))[0].g === "team", "the Studios hub's Team column is still team");

  /* 1 · people */
  const ids = {};
  for (const n of ["artist", "studio", "invitee"]) {
    const id = await uuid();
    ids[n] = id;
    await q(`insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now())`,
      [id, `dry.at.${n}.${id.slice(0, 6)}@example.com`]);
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, `Dry ${n}`]);
  }
  const mk = async (owner, name, type) => {
    await asNobody();
    const [{ id }] = await q(`insert into public.businesses (name, type, city, visibility, created_by, updated_by) values ($1, $2, 'Pune', 'unlisted', $3, $3) returning id`, [name, type, owner]);
    await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2)`, [id, owner]);
    return id;
  };
  const page = await mk(ids.artist, "Dry AT Page", "artist_page");
  const studio = await mk(ids.studio, "Dry AT Studio", "studio");

  /* 2 · an artist's invitation opens /team, a studio's the Studios hub */
  await as(ids.artist);
  await q(`select public.invite_person_to_business($1, $2, 'trainer')`, [page, ids.invitee]);
  check(await notes(ids.invitee, "kind = 'team' and href = '/team' and title = 'Dry AT Page wants you on its team'") === 1, "an artist's invitation is told and opens /team");
  await as(ids.studio);
  await q(`select public.invite_person_to_business($1, $2, 'trainer')`, [studio, ids.invitee]);
  check(await notes(ids.invitee, "kind = 'team' and href = '/business?show=team' and title = 'Dry AT Studio wants you on its team'") === 1, "a studio's still opens the Studios hub");

  /* 3 · answered rows carry the type */
  await as(ids.invitee);
  const pend = await q(`select invite_id, business_type from public.my_pending_invites()`);
  check(pend.length === 2 && pend.some((r) => r.business_type === "artist_page") && pend.some((r) => r.business_type === "studio"), "pending: both, typed", JSON.stringify(pend.map((r) => r.business_type)));
  const codes = await (async () => { await asNobody(); return q(`select business_id, code from public.business_invites where business_id in ($1, $2)`, [page, studio]); })();
  await as(ids.invitee);
  for (const r of codes) await q(`select public.decline_business_invite($1)`, [r.code]);
  const ans = await q(`select business_id, business_type, status from public.my_answered_invites()`);
  check(ans.find((r) => r.business_id === page)?.business_type === "artist_page", "answered: the artist's typed artist_page", JSON.stringify(ans));
  check(ans.find((r) => r.business_id === studio)?.business_type === "studio", "answered: the studio's typed studio");

  /* 4 · a stranger reads nothing of somebody else's */
  await as(ids.studio);
  const theirs = await q(`select business_id from public.my_answered_invites() where business_id = $1`, [page]);
  check(theirs.length === 0, "somebody else reads none of the invitee's answers", theirs.length);

  /* 5 · a withdrawal of an artist's invitation opens /team */
  await as(ids.artist);
  const inv2 = await uuid();
  await asNobody();
  await q(`insert into public.business_invites (id, business_id, user_id, name, member_role, code, status, created_by, updated_by)
           values ($1, $2, $3, 'Dry invitee', 'staff', $4, 'pending', $5, $5)`, [inv2, page, ids.invitee, `dryat${inv2.slice(0, 8)}`, ids.artist]);
  await q(`update public.business_invites set status = 'revoked' where id = $1`, [inv2]);
  check(await notes(ids.invitee, "href = '/team' and title = 'Dry AT Page withdrew its invitation'") === 1, "a withdrawal of an artist's invitation opens /team");
};
