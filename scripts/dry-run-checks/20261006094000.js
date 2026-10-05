// Checks for 20261006094000_a_person_can_ask_to_leave, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. One real person with
// nothing anybody depends on is chosen; each refusal is planted on them inside a
// savepoint and rolled back; then they ask for real, and what happened is read
// back — as them, as an admin, and as nobody.
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
  const g = await q(`select has_function_privilege('authenticated', 'public.request_account_deletion(text)'::regprocedure, 'execute') a,
                            has_function_privilege('anon', 'public.request_account_deletion(text)'::regprocedure, 'execute') n`);
  check(g[0].a && !g[0].n, "request_account_deletion is signed-in only — anon cannot call it");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const stl = (await q(`select pg_get_functiondef('public.support_thread_list()'::regprocedure) d, prosecdef s from pg_proc where oid='public.support_thread_list()'::regprocedure`))[0];
  check(/left join public\.profiles/.test(stl.d) && !stl.s, "support_thread_list LEFT-joins profiles and is still INVOKER");

  /* ── the person: live, owning no studio, leading no crew, paying no renewal,
        holding no seat or teaching on anything still to run ── */
  const me = (await q(`
    select p.id, p.full_name from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and exists (select 1 from auth.users u where u.id = p.id and u.email is not null)
       and not exists (select 1 from public.platform_admins a where a.user_id = p.id and a.deleted_at is null)
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null)
       and not exists (select 1 from public.crews c where c.leader_id = p.id and c.deleted_at is null)
       and not exists (select 1 from public.subscriptions s where s.user_id = p.id and s.deleted_at is null and s.status in ('active','past_due','pending_auth') and not s.granted and not s.cancel_at_period_end)
       and not exists (select 1 from public.class_bookings e join public.class_sessions s on s.id = e.session_id where e.user_id = p.id and e.status = 'enrolled' and e.deleted_at is null and s.ends_at > now())
       and not exists (select 1 from public.class_people k join public.classes cl on cl.id = k.class_id and cl.deleted_at is null and cl.status = 'published'
                        where k.user_id = p.id and k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
                          and exists (select 1 from public.class_sessions s where s.class_id = cl.id and s.deleted_at is null and s.ends_at > now()))
     order by p.created_at limit 1`))[0];
  check(!!me, "set-up: a live person nobody depends on");
  const admin = (await q(`select a.user_id from public.platform_admins a join public.profiles p on p.id = a.user_id and p.deleted_at is null where a.deleted_at is null limit 1`))[0]
    ?? (await q(`select user_id from public.platform_admins where deleted_at is null limit 1`))[0];
  check(!!admin, "set-up: a live platform admin");
  const studio = (await q(`select b.id from public.businesses b where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  const future = (await q(`
    select s.id session_id, cl.id class_id, cl.business_id from public.class_sessions s
      join public.classes cl on cl.id = s.class_id and cl.deleted_at is null and cl.status = 'published'
     where s.deleted_at is null and s.starts_at > now() + interval '1 day' order by s.starts_at limit 1`))[0];
  check(!!studio && !!future, "set-up: a live studio and a published class still to come");

  /* each refusal, planted in a savepoint and rolled back */
  const refused = async (label, plant, re) => {
    await asNobody();
    await q("savepoint dos_scn");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me.id })]);
    await q("set local session_replication_role = replica");
    await plant();
    await q("set local session_replication_role = origin");
    await as(me.id);
    const r = await tryq(`select public.request_account_deletion('testing') j`);
    await asNobody();
    const still = (await q(`select deleted_at from public.profiles where id = $1`, [me.id]))[0].deleted_at;
    await q("rollback to savepoint dos_scn");
    check(re.test(r.err ?? "") && still === null, `${label} (${r.err})`);
  };

  await refused("⚠ the only owner of a live studio is refused, by the studio's name", async () => {
    const b = (await q(`insert into public.businesses (type, name, city, visibility) values ('studio', 'Dry Sole Studio', 'Pune', 'unlisted') returning id`))[0].id;
    await q(`insert into public.business_members (business_id, user_id, member_role) values ($1, $2, 'owner')`, [b, me.id]);
  }, /only owner of Dry Sole Studio/);

  await refused("a crew leader is refused, by the crew's name", async () => {
    await q(`insert into public.crews (name, city, style, leader_id) values ('Dry Lead Crew', 'Pune', 'Hip-Hop', $1)`, [me.id]);
  }, /You lead Dry Lead Crew/);

  await refused("⚠ a renewing subscription is refused — a deleted row stops no charge", async () => {
    await q(`insert into public.subscriptions (kind, user_id, plan_key, price_inr, period, status, granted, cancel_at_period_end)
             values ('artist', $1, 'artist_monthly', 700, 'monthly', 'active', false, false)`, [me.id]);
  }, /Your Artist plan still renews/);

  await refused("a seat on a class still to run is refused", async () => {
    await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status) values ($1, $2, $3, $4, 'enrolled')`,
      [future.session_id, future.class_id, future.business_id, me.id]);
  }, /still hold a seat on classes still to run/);

  await refused("the confirmed artist on a class still to run is refused", async () => {
    await q(`update public.class_people set deleted_at = now() where class_id = $1 and kind = 'artist' and deleted_at is null`, [future.class_id]);
    await q(`insert into public.class_people (class_id, business_id, user_id, kind, status) values ($1, $2, $3, 'artist', 'confirmed')`,
      [future.class_id, future.business_id, me.id]);
  }, /You are taking a class still to run/);

  /* a granted plan and one that has stopped renewing do NOT block */
  await asNobody();
  await q("savepoint dos_scn");
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me.id })]);
  await q("set local session_replication_role = replica");
  await q(`insert into public.subscriptions (kind, user_id, plan_key, price_inr, period, status, granted, cancel_at_period_end)
           values ('artist', $1, 'artist_monthly', 700, 'monthly', 'active', false, true)`, [me.id]);
  await q("set local session_replication_role = origin");
  await as(me.id);
  const ending = await tryq(`select public.request_account_deletion(null) j`);
  await asNobody();
  await q("rollback to savepoint dos_scn");
  check(!ending.err, `a plan that has stopped renewing does not block (${ending.err ?? "ok"})`);

  /* ── the real request, with seats to close ── */
  await asNobody();
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me.id })]);
  await q("set local session_replication_role = replica");
  await q(`insert into public.business_members (business_id, user_id, member_role) values ($1, $2, 'staff')`, [studio.id, me.id]);
  const crew = (await q(`select id from public.crews where deleted_at is null and leader_id <> $1 limit 1`, [me.id]))[0];
  if (crew) await q(`insert into public.crew_members (crew_id, user_id, role, status) values ($1, $2, 'member', 'confirmed')`, [crew.id, me.id]);
  await q("set local session_replication_role = origin");

  await as(me.id);
  const ok = await tryq(`select public.request_account_deletion('Moving away') j`);
  check(!ok.err && ok.rows[0].j.status === "requested" && !!ok.rows[0].j.thread_id, `the request is accepted and names its thread (${ok.err ?? "ok"})`);
  const thread = ok.rows?.[0]?.j?.thread_id;
  await asNobody();

  const prof = (await q(`select deleted_at from public.profiles where id = $1`, [me.id]))[0];
  check(prof.deleted_at !== null, "the profile is soft-deleted — one UPDATE brings it back");
  const seats = (await q(`select count(*)::int n from public.business_members where user_id = $1 and deleted_at is null`, [me.id]))[0].n;
  check(seats === 0, "every team seat is closed");
  const cm = (await q(`select count(*)::int n from public.crew_members where user_id = $1 and deleted_at is null`, [me.id]))[0].n;
  check(cm === 0, "every crew seat is closed");
  const kp = (await q(`select count(*)::int n from public.class_people where user_id = $1 and deleted_at is null`, [me.id]))[0].n;
  check(kp === 0, "every class ask and seat is closed");
  const msg = (await q(`select m.body, t.subject, t.account_id from public.support_messages m join public.support_threads t on t.id = m.thread_id where t.id = $1`, [thread]))[0];
  check(!!msg && msg.subject === "Delete my account" && msg.account_id === me.id, "a 'Delete my account' thread is opened in their name");
  check(!!msg && msg.body.includes(me.full_name) && /Email: \S+@\S+/.test(msg.body) && msg.body.includes(me.id) && /Why: Moving away/.test(msg.body),
    "…carrying their name, their address, their account id and their reason");
  const authStill = (await q(`select count(*)::int n from auth.users where id = $1`, [me.id]))[0].n;
  check(authStill === 1, "⚠ the auth account is NOT deleted — erasing it is an admin's act");

  /* the admin can still SEE the request, though the profile is gone */
  await as(admin.user_id);
  const list = await q(`select account_name from public.support_thread_list() where id = $1`, [thread]);
  check(list.length === 1 && list[0].account_name === "Deleted account", `the admin's support list keeps the thread (${JSON.stringify(list)})`);
  await asNobody();

  /* asking twice */
  await as(me.id);
  const again = await tryq(`select public.request_account_deletion(null) j`);
  check(/no profile to delete/.test(again.err ?? ""), `asking again is refused in words (${again.err})`);
  await asNobody();

  /* nobody */
  const nobody = await tryq(`select public.request_account_deletion(null) j`);
  check(/not authenticated/.test(nobody.err ?? ""), "a session-less call is refused");
};
