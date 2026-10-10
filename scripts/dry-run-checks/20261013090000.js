// Checks for 20261013090000_a_class_repeats_weekly, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. Every door is called
// as the real role (the owner, a stranger), against a real studio, with classes
// planted where a past session is needed.
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
  /* an expected refusal gets its own savepoint, or the first raise aborts the rest */
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
  const slug = () => `dry-series-${Math.random().toString(36).slice(2, 10)}`;
  const ist = (days) => (new Date(Date.now() + 5.5 * 3600000 + days * 86400000)).toISOString().slice(0, 10);

  /* ── the catalog ── */
  await asNobody();
  for (const f of ["add_weekly_sessions(uuid, date)", "cancel_class_session(uuid, text)",
    "create_class_series(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, date)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n,
                              (select prosecdef from pg_proc where oid = $1::regprocedure) d`, [`public.${f}`]);
    check(g[0].a && !g[0].n && g[0].d, `${f.split("(")[0]} — definer, signed-in yes, anon no`);
  }
  for (const f of ["update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean)", "cancel_class_bookings_for_class(uuid, text)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} keeps its grants`);
  }
  const ar = await q(`select has_function_privilege('authenticated', 'public.assert_room_ok(uuid)'::regprocedure, 'execute') a`);
  check(!ar[0].a, "assert_room_ok stays executable by no client role");
  const helper = await q(`select 1 from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`);
  check(helper.length === 0, "the anchor helper is gone");
  const tables = await q(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='class_sessions'`);
  check(tables[0].n === 10, `class_sessions gained no column (${tables[0].n})`);

  /* ── the cast ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  check(!!biz, `set-up: a live studio with an owner (${biz?.id})`);
  const people = await q(`
    select p.id from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id = $1 and m.deleted_at is null)
     order by p.created_at limit 3`, [biz.id]);
  const [a, b2, stranger] = people.map((p) => p.id);
  check(people.length === 3, "set-up: three people off the team");

  const sessionsOf = async (cls) => q(`select id, starts_at, ends_at from public.class_sessions where class_id = $1 and deleted_at is null order by starts_at`, [cls]);
  const startIn = (h) => new Date(Date.now() + h * 3600000).toISOString();

  /* ── 1 · a series is made in one act ── */
  await as(biz.owner_id);
  const sArgs = (until, title = "Hip-Hop · All levels") => [biz.id, title, "Hip-Hop", "all", null, 0, 10, "draft", startIn(26), startIn(27), null, null, null, null, null, null, until];
  const CREATE = `select (public.create_class_series($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)).id as id`;
  const made = await tryq(CREATE, sArgs(ist(1 + 7 * 7)));
  check(!made.err, `the owner makes a weekly series to a date seven weeks out (${made.err ?? "ok"})`);
  const series = made.rows?.[0]?.id;
  const ss = series ? await sessionsOf(series) : [];
  check(ss.length === 8, `…eight sessions: the first and seven weeks after it (${ss.length})`);
  const gaps = ss.slice(1).map((s, i) => (new Date(s.starts_at) - new Date(ss[i].starts_at)) / 3600000);
  check(gaps.every((g) => g === 168), `…each exactly a week after the last (${[...new Set(gaps)].join(",")} h)`);
  check(ss.every((s) => new Date(s.ends_at) - new Date(s.starts_at) === 3600000), "…each the first one's length");

  const before = (await q(`select count(*)::int n from public.classes where business_id = $1`, [biz.id]))[0].n;
  const tooLong = await tryq(CREATE, sArgs(ist(7 * 30)));
  check(/at most 26 weeks/.test(tooLong.err ?? ""), `a series past 26 weeks is refused in words (${tooLong.err})`);
  const after = (await q(`select count(*)::int n from public.classes where business_id = $1`, [biz.id]))[0].n;
  check(after === before, "⚠ …and no half-made class is left behind — one transaction");
  const tooShort = await tryq(CREATE, sArgs(ist(3)));
  check(/at least a week after/.test(tooShort.err ?? ""), `an end date inside the first week is refused (${tooShort.err})`);

  await as(stranger);
  const notYours = await tryq(`select public.add_weekly_sessions($1, $2)`, [series, ist(80)]);
  check(/Only the owner/.test(notYours.err ?? ""), `a stranger cannot repeat somebody's class (${notYours.err})`);
  await as(biz.owner_id);
  const extend = await tryq(`select public.add_weekly_sessions($1, $2) n`, [series, ist(1 + 7 * 9)]);
  check(!extend.err && extend.rows[0].n === 2, `the owner can run it longer later — two more weeks (${extend.err ?? extend.rows[0].n})`);

  /* ── 2 · editing moves this and later sessions, never a past one ── */
  /* plant a PAST session on the same class (replica mode: the start-ahead trigger) */
  await asNobody();
  await q("set local session_replication_role = replica");
  const past = (await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() - interval '7 days', now() - interval '7 days' + interval '1 hour', $3, $3) returning id, starts_at`, [series, biz.id, biz.owner_id]))[0];
  await q("set local session_replication_role = origin");
  const futureBefore = await sessionsOf(series);
  const anchor = futureBefore.find((s) => new Date(s.ends_at) > new Date());
  await as(biz.owner_id);
  const newStart = new Date(new Date(anchor.starts_at).getTime() + 2 * 3600000);
  const newEnd = new Date(newStart.getTime() + 90 * 60000);
  const UPD = `select public.update_class_with_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`;
  const ed = await tryq(UPD, [series, "Hip-Hop · All levels", "Hip-Hop", "all", null, 0, 10, newStart.toISOString(), newEnd.toISOString(), null, null, null, null, null, null, true, false]);
  check(!ed.err, `the owner edits the series' time (${ed.err ?? "ok"})`);
  const afterEdit = await sessionsOf(series);
  const pastNow = afterEdit.find((s) => s.id === past.id);
  check(new Date(pastNow.starts_at).getTime() === new Date(past.starts_at).getTime(), "⚠ the week that already ran did not move");
  const moved = afterEdit.filter((s) => s.id !== past.id);
  const okShift = moved.every((s) => {
    const was = futureBefore.find((x) => x.id === s.id);
    return new Date(s.starts_at) - new Date(was.starts_at) === 2 * 3600000 && new Date(s.ends_at) - new Date(s.starts_at) === 90 * 60000;
  });
  check(okShift && moved.length === 10, `every session still to come moved two hours and runs ninety minutes (${moved.length})`);

  /* a one-session class edits exactly as before */
  const single = (await q(`select (public.create_class_with_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)).id id`, [biz.id, "Kathak · All levels", "Kathak", "all", null, 0, 10, "draft", startIn(50), startIn(51)]))[0].id;
  const s1 = new Date(Date.now() + 70 * 3600000); s1.setSeconds(0, 0);
  const e1 = new Date(s1.getTime() + 3600000);
  await q(UPD, [single, "Kathak · All levels", "Kathak", "all", null, 0, 10, s1.toISOString(), e1.toISOString(), null, null, null, null, null, null, true, false]);
  const one = (await sessionsOf(single))[0];
  check(new Date(one.starts_at).getTime() === s1.getTime() && new Date(one.ends_at).getTime() === e1.getTime(), "a one-session class's edit lands exactly where it always did");

  /* ── 3 · the capacity floor counts the fullest session ── */
  const fut = moved.slice(0, 2);
  await asNobody();
  for (const [ses, who] of [[fut[0].id, a], [fut[0].id, b2], [fut[1].id, a], [fut[1].id, b2], [fut[1].id, stranger]]) {
    await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
        values ($1, $2, $3, $4, 'enrolled', $4, $4)`, [ses, series, biz.id, who]);
  }
  await as(biz.owner_id);
  const capArgs = (cap) => [series, "Hip-Hop · All levels", "Hip-Hop", "all", null, 0, cap, newStart.toISOString(), newEnd.toISOString(), null, null, null, null, null, null, true, false];
  const cap3 = await tryq(UPD, capArgs(3));
  check(!cap3.err, `five seats across two weeks, three on the fullest — capacity 3 is allowed (${cap3.err ?? "ok"})`);
  const cap2 = await tryq(UPD, capArgs(2));
  check(/3 already hold a seat/.test(cap2.err ?? ""), `…and 2 is refused, naming the fullest session's 3 (${cap2.err})`);

  /* ── 4 · one session called off ── */
  /* a published series with a PAID seat on its second week */
  await asNobody();
  await q("set local session_replication_role = replica");
  const pub = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
      values ($1, 'Salsa · All levels', 'Salsa', 'all', 300, 10, 'published', $2, $2, $3) returning id`, [biz.id, biz.owner_id, slug()]))[0].id;
  const w = [];
  for (const d of [3, 10, 17]) {
    w.push((await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
        values ($1, $2, now() + $3::interval, now() + $3::interval + interval '1 hour', $4, $4) returning id`, [pub, biz.id, `${d} days`, biz.owner_id]))[0].id);
  }
  const seat = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
      values ($1, $2, $3, $4, 'enrolled', $4, $4) returning id`, [w[1], pub, biz.id, a]))[0].id;
  const other = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
      values ($1, $2, $3, $4, 'enrolled', $4, $4) returning id`, [w[2], pub, biz.id, a]))[0].id;
  const order = (await q(`insert into public.orders (business_id, user_id, amount_inr, class_id, session_id, class_booking_id, status, provider, provider_order_id, created_by, updated_by)
      values ($1, $2, 300, $3, $4, $5, 'paid', 'cashfree', $6, $2, $2) returning id`, [biz.id, a, pub, w[1], seat, `dos_dryrun_${seat}`]))[0].id;
  await q(`insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
      values ($1, $2, $3, 300, 'captured', 'upi', $4, 'cashfree', $2, $2)`, [order, a, `dryrun_${order}`, biz.id]);
  await q("set local session_replication_role = origin");

  await as(stranger);
  const strangerOff = await tryq(`select public.cancel_class_session($1, 'x')`, [w[1]]);
  check(/Only the owner/.test(strangerOff.err ?? ""), `a stranger cannot call a session off (${strangerOff.err})`);

  await as(biz.owner_id);
  const offed = await tryq(`select public.cancel_class_session($1, 'The studio is closed that day') r`, [w[1]]);
  check(!offed.err && offed.rows[0].r.seats === 1 && offed.rows[0].r.refunds === 1 && offed.rows[0].r.amount_inr === 300, `the owner calls off week two: 1 seat, 1 refund, ₹300 (${offed.err ?? JSON.stringify(offed.rows[0].r)})`);
  await asNobody();
  const seatNow = (await q(`select status from public.class_bookings where id = $1`, [seat]))[0];
  check(seatNow.status === "cancelled", "…the seat on it is cancelled");
  const ref = await q(`select user_id, created_by, status, amount_inr from public.refunds where order_id = $1`, [order]);
  check(ref.length === 1 && ref[0].user_id === a && ref[0].created_by === biz.owner_id && ref[0].status === "pending", "⚠ …the refund is filed against the PAYER, by the owner, pending — automatic, as a call-off is");
  const sesNow = (await q(`select deleted_at from public.class_sessions where id = $1`, [w[1]]))[0];
  check(sesNow.deleted_at !== null, "…the session is soft-deleted");
  const otherNow = (await q(`select status from public.class_bookings where id = $1`, [other]))[0];
  check(otherNow.status === "enrolled", "⚠ …and the same person's seat on week three is untouched");
  const told = await q(`select title from public.notifications where user_id = $1 and title like 'Salsa · All levels on %was called off' and deleted_at is null`, [a]);
  check(told.length === 1, `…and they are told, naming the day (${told[0]?.title})`);

  await as(biz.owner_id);
  const second = await tryq(`select public.cancel_class_session($1, 'x')`, [w[0]]);
  check(!second.err, "another week can be called off while one is still to come");
  const lastOne = await tryq(`select public.cancel_class_session($1, 'x')`, [w[2]]);
  check(/last session still to come/.test(lastOne.err ?? ""), `⚠ the LAST session still to come is refused — that is the class's own Delete (${lastOne.err})`);
  const pastOff = await tryq(`select public.cancel_class_session($1, 'x')`, [past.id]);
  check(/session is over/.test(pastOff.err ?? ""), `a session that is over cannot be called off (${pastOff.err})`);

  /* ── 5 · calling a class off skips the weeks that ran ── */
  await asNobody();
  await q("set local session_replication_role = replica");
  const ranSeat = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
      values ($1, $2, $3, $4, 'enrolled', $4, $4) returning id`, [past.id, series, biz.id, stranger]))[0].id;
  await q("set local session_replication_role = origin");
  await as(biz.owner_id);
  const whole = await tryq(`select public.cancel_class_bookings_for_class($1, 'x') r`, [series]);
  check(!whole.err && whole.rows[0].r.seats === 5, `⚠ calling the series off goes through with a seat on a week that ran — the five seats to come closed (${whole.err ?? whole.rows[0].r.seats})`);
  await asNobody();
  const ranNow = (await q(`select status from public.class_bookings where id = $1`, [ranSeat]))[0];
  check(ranNow.status === "enrolled", "…and the seat on the week that ran stays as the record it is");
};
