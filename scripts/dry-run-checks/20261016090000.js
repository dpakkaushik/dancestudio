// Checks for 20261016090000_classes_made_simpler, run inside the dry run's
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
  const uuid = async () => (await q("select gen_random_uuid() u"))[0].u;
  const ts = (h) => new Date(Date.now() + h * 3600e3).toISOString();

  /* ── plant a world as the service role: a studio, its owner, a manager, a teacher, a learner ── */
  await asNobody();
  const owner = await uuid(), manager = await uuid(), teacher = await uuid(), learner = await uuid(), stranger = await uuid();
  for (const [id, name] of [[owner, "Dry Owner"], [manager, "Dry Manager"], [teacher, "Dry Teacher"], [learner, "Dry Learner"], [stranger, "Dry Stranger"]]) {
    await q(`insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now())`,
      [id, `${name.toLowerCase().replace(" ", ".")}.${id.slice(0, 6)}@example.com`]);
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, name]);
  }
  await as(owner, "service_role");
  const [{ id: studio }] = await q(`insert into public.businesses (name, type, city, visibility, created_by, updated_by) values ('Dry Studio', 'studio', 'Pune', 'listed', $1, $1) returning id`, [owner]);
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2), ($1, $3, 'manager', $2, $2)`, [studio, owner, manager]);
  const [{ id: room }] = await q(`insert into public.rooms (business_id, name, capacity, created_by, updated_by) values ($1, 'Hall', 20, $2, $2) returning id`, [studio, owner]);

  /* ── 1 · the columns and the CHECK ── */
  const cols = await q(`select column_name from information_schema.columns where table_schema='public' and
    ((table_name='classes' and column_name='auto_publish') or (table_name='business_members' and column_name='pay_per_session_inr') or (table_name='businesses' and column_name='refund_window_hours'))`);
  check(cols.length === 2 && !cols.some((c) => c.column_name === "auto_publish"), `the two columns exist and there is no auto_publish (${cols.length})`);
  await as(owner, "service_role");
  const long = await refused(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
    select c.id, c.business_id, now() + interval '2 days', now() + interval '2 days 6 hours', $1, $1 from public.classes c where c.deleted_at is null limit 1`, [owner], "class_sessions_length_check");
  check(long === true, `⚠ a six-hour session is refused by the row (${long})`);

  /* ── 5 · a manager creates a class, names a teacher, and the ask is born ── */
  await as(manager);
  const made = await allowed(`select public.create_class_with_session($1, 'Dry · All levels', 'Hip-Hop', 'all', 'Hall', 0, 10, 'draft', $2, $3, $4)`,
    [studio, ts(48), ts(49), room]);
  check(made === 1, `⚠ a MANAGER creates a class (${made})`);
  const [cls] = await q(`select c.id, c.status, c.share_slug from public.classes c where c.business_id = $1 and c.title = 'Dry · All levels'`, [studio]);
  check(cls && cls.status === "draft", `born a draft (${cls?.status})`);
  const askRes = await allowed(`select public.ask_class_person($1, $2, 'artist')`, [cls.id, teacher]);
  check(askRes === 1, `⚠ a manager names the teacher (${askRes})`);
  const powers = await refused(`select public.set_class_person_powers((select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null), true, true)`, [cls.id, teacher], "owner");
  check(powers === true, `…but powers stay the owner's (${powers})`);

  /* ── 6 · the seat's rate rides the ask ── */
  await as(owner, "service_role");
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'trainer', $3, $3)`, [studio, teacher, owner]);
  await as(owner);
  const rate = await allowed(`select public.set_member_pay($1, $2, 700)`, [studio, teacher]);
  check(rate === 1, `the owner sets a team member's rate (${rate})`);
  await as(manager);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [cls.id, teacher]);
  const [ask] = await q(`select id, pay_per_session_inr, status from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [cls.id, teacher]);
  check(ask.pay_per_session_inr === 700, `⚠ an ask with no rate takes the seat's (${ask.pay_per_session_inr})`);
  await as(manager);
  const payByManager = await refused(`select public.set_member_pay($1, $2, 1)`, [studio, teacher], "only the owner");
  check(payByManager === true, `a manager cannot set the rate (${payByManager})`);

  /* ── 1 · the yes does NOT publish it (no auto-publish); a manager publishes ── */
  await as(stranger);
  const notYours = await refused(`select public.respond_to_class_ask($1, true)`, [ask.id], "not yours to answer");
  check(notYours === true, `only the person asked answers (${notYours})`);
  await as(teacher);
  const yes = await allowed(`select public.respond_to_class_ask($1, true)`, [ask.id]);
  check(yes === 1, `the teacher says yes (${yes})`);
  await asNobody();
  const [after] = await q(`select status from public.classes where id = $1`, [cls.id]);
  check(after.status === "draft", `⚠ the yes leaves it a draft — nothing publishes by itself (${after.status})`);
  await as(manager);
  const pub = await allowed(`update public.classes set status = 'published' where id = $1`, [cls.id]);
  check(pub === 1, `⚠ a MANAGER publishes it by hand (${pub})`);
  await asNobody();
  const [pubd] = await q(`select status from public.classes where id = $1`, [cls.id]);
  check(pubd.status === "published", `…and it is published (${pubd.status})`);
  await as(teacher);
  const twice = await refused(`select public.respond_to_class_ask($1, false)`, [ask.id], "already been answered");
  check(twice === true, `an answered ask cannot be answered again (${twice})`);

  /* ── 2 · a no is closed; a late yes is refused ── */
  await as(manager);
  const made2 = await allowed(`select public.create_class_with_session($1, 'Dry Two · All levels', 'Hip-Hop', 'all', 'Hall', 300, 10, 'draft', $2, $3, $4)`,
    [studio, ts(72), ts(73), room]);
  check(made2 === 1, `a second class (${made2})`);
  const [cls2] = await q(`select id from public.classes where business_id = $1 and title = 'Dry Two · All levels'`, [studio]);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [cls2.id, teacher]);
  const [ask2] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [cls2.id, teacher]);
  await as(teacher);
  await q(`select public.respond_to_class_ask($1, false)`, [ask2.id]);
  await asNobody();
  const [no] = await q(`select status, deleted_at from public.class_people where id = $1`, [ask2.id]);
  check(no.status === "rejected" && no.deleted_at !== null, `⚠ a no is rejected AND closed (${no.status}, ${no.deleted_at !== null})`);
  const noVf = await q(`select count(*)::int n from public.business_members where business_id = $1 and user_id = $2 and member_role = 'visiting_faculty'`, [studio, teacher]);
  check(noVf[0].n === 0, `no visiting_faculty seat was made on the yes (${noVf[0].n})`);
  await as(manager);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [cls2.id, teacher]);
  const [ask3] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [cls2.id, teacher]);
  await as(teacher);
  const yes2 = await allowed(`select public.respond_to_class_ask($1, true)`, [ask3.id]);
  check(yes2 === 1, `a fresh ask is answered (${yes2})`);
  // a late yes: a draft whose session is in the past (planted by the service role)
  await as(manager);
  const made3 = await allowed(`select public.create_class_with_session($1, 'Dry Three · All levels', 'Hip-Hop', 'all', 'Hall', 0, 10, 'draft', $2, $3, $4)`, [studio, ts(96), ts(97), room]);
  check(made3 === 1, `a third class (${made3})`);
  const [cls3] = await q(`select id from public.classes where business_id = $1 and title = 'Dry Three · All levels'`, [studio]);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [cls3.id, teacher]);
  const [ask4] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [cls3.id, teacher]);
  await as(owner, "service_role");
  await q(`update public.class_sessions set starts_at = now() - interval '8 days', ends_at = now() - interval '8 days' + interval '1 hour' where class_id = $1`, [cls3.id]);
  await as(teacher);
  const late = await refused(`select public.respond_to_class_ask($1, true)`, [ask4.id], "the request is closed");
  check(late === true, `⚠ a late yes is refused (${late})`);
  await asNobody();
  const swept = await q(`select public.close_stale_drafts() n`);
  const [c3] = await q(`select deleted_at from public.classes where id = $1`, [cls3.id]);
  check(c3.deleted_at !== null && swept[0].n >= 1, `⚠ the draft-clock closed the stale draft (${swept[0].n} swept)`);
  const [a4] = await q(`select deleted_at from public.class_people where id = $1`, [ask4.id]);
  check(a4.deleted_at !== null, `…and its ask closed with it`);
  const cron = await q(`select count(*)::int n from cron.job where jobname = 'draft-clock'`);
  check(cron[0].n === 1, `draft-clock is scheduled (${cron[0].n})`);

  /* ── 3 · the small fixes ── */
  await as(owner);
  const venue = await refused(`update public.classes set venue_status = 'accepted' where id = $1`, [cls.id], "only the studio answers");
  check(venue === true, `⚠ venue_status cannot be set to accepted by hand (${venue})`);
  const [sess] = await q(`select id from public.class_sessions where class_id = $1`, [cls.id]);
  const own = await refused(`select public.book_class_session($1)`, [sess.id], "not yours to book");
  check(own === true, `⚠ the owner cannot book their own class (${own})`);
  await as(teacher);
  const own2 = await refused(`select public.book_class_session($1)`, [sess.id], "not yours to book");
  check(own2 === true, `…nor the confirmed teacher (${own2})`);
  await as(learner);
  const booked = await allowed(`select public.book_class_session($1)`, [sess.id]);
  check(booked === 1, `a learner books through the one door (${booked})`);
  await as(owner, "service_role");
  const [{ id: order }] = await q(`insert into public.orders (business_id, user_id, class_id, session_id, amount_inr, status, created_by, updated_by) values ($1, $2, $3, $4, 300, 'paid', $2, $2) returning id`, [studio, learner, cls.id, sess.id]);
  await q(`insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id, amount_inr, status, method, kind, created_by, updated_by) values ($1, $2, $3, 'cashfree', $4, 300, 'captured', 'upi', 'order', $3, $3)`, [order, studio, learner, `dry_${order.slice(0, 8)}`]);
  await as(manager);
  const mgrReads = await q(`select count(*)::int n from public.payments where order_id = $1`, [order]);
  check(mgrReads[0].n === 1, `⚠ a manager reads the business's money (${mgrReads[0].n})`);
  await as(teacher);
  const trainerReads = await q(`select count(*)::int n from public.payments where order_id = $1`, [order]);
  check(trainerReads[0].n === 0, `⚠⚠ a trainer with no refunds job reads NONE (${trainerReads[0].n})`);
  await as(owner);
  await q(`select public.set_class_person_powers($1, true, true)`, [ask.id]);
  await as(teacher);
  const jobReads = await q(`select count(*)::int n from public.payments where order_id = $1`, [order]);
  check(jobReads[0].n === 1, `…and ONE once they hold the refunds job on the class (${jobReads[0].n})`);

  /* ── 4 · the register from the class row alone ── */
  await as(owner, "service_role");
  await q(`update public.business_members set deleted_at = now() where business_id = $1 and user_id = $2`, [studio, teacher]);
  await as(teacher);
  const reg = await q(`select public.can_run_register_for_class($1) ok`, [cls.id]);
  check(reg[0].ok === true, `⚠ a confirmed teacher with attendance runs the register with NO seat (${reg[0].ok})`);

  /* ── 8 · the studio's own window ── */
  await as(owner);
  const win = await allowed(`select public.set_refund_window($1, 72)`, [studio]);
  check(win === 1, `the owner sets a 72-hour window (${win})`);
  const bad = await refused(`select public.set_refund_window($1, 500)`, [studio], "between 0 and 168");
  check(bad === true, `…within bounds (${bad})`);
  await as(learner);
  const [{ id: bk }] = await q(`select id from public.class_bookings where session_id = $1 and user_id = $2 and status = 'enrolled'`, [sess.id, learner]);
  await as(owner, "service_role");
  await q(`update public.orders set class_booking_id = $1 where id = $2`, [bk, order]);
  await as(learner);
  const cancel = await q(`select public.cancel_class_booking_with_reason($1, 'Travelling') r`, [bk]);
  check(cancel[0].r.refund && cancel[0].r.refund.status === "requested", `⚠ 48 hours ahead under a 72-hour window is the studio's to decide (${cancel[0].r.refund?.status})`);

  /* ── 7 · the door's one action ── */
  await as(owner, "service_role");
  await q(`update public.class_sessions set starts_at = now() + interval '10 minutes', ends_at = now() + interval '70 minutes' where id = $1`, [sess.id]);
  await as(manager);
  const door1 = await allowed(`select public.book_at_the_door($1, null, 'Walk In')`, [sess.id]);
  check(door1 === 1, `book_at_the_door takes a name (${door1})`);
  const door2 = await allowed(`select public.book_at_the_door($1, $2, null)`, [sess.id, stranger]);
  check(door2 === 1, `…and a person (${door2})`);
  const door3 = await refused(`select public.book_at_the_door($1, null, null)`, [sess.id], "scan a code or type a name");
  check(door3 === true, `…and nothing is refused in words (${door3})`);

  /* ── nothing else moved ── */
  await asNobody();
  for (const f of ["close_stale_drafts()", "guard_venue_answer()", "guard_not_own_class()"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(!g[0].a && !g[0].n, `${f} is executable by no client role`);
  }
  const anon = await q(`select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, `public policies unchanged in number (${pol[0].n})`);
  const old1 = await q(`select count(*)::int n from pg_proc where proname = 'book_class_session' and pronamespace = 'public'::regnamespace`);
  check(old1[0].n === 1, `one book_class_session, not two (${old1[0].n})`);
};
