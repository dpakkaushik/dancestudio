// Checks for 20261004160000_no_waitlist, run inside the dry run's rolled-back
// transaction by scripts/dry-run-migration.js. A class planted at a real studio
// with ONE seat, booked by two real people through the same RPC the app calls.
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
  const body = async (sig) => (await q(`select pg_get_functiondef($1::regprocedure) d`, [sig]))[0].d;

  /* ── the catalog ── */
  await asNobody();
  const wl = await q(`select count(*)::int n from public.class_bookings where status = 'waitlisted'`);
  check(wl[0].n === 0, `no waitlisted row is left, live or deleted (${wl[0].n})`);
  const con = await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'class_bookings_status_check'`);
  check(con.length === 1 && /enrolled/.test(con[0].d) && /cancelled/.test(con[0].d) && !/waitlisted/.test(con[0].d),
    `the CHECK admits enrolled and cancelled only (${con[0]?.d})`);
  const gone = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('give_spot','remove_from_waitlist','_dos_swap')`);
  check(gone.length === 0, `give_spot, remove_from_waitlist and the helper are gone (${gone.map((r) => r.proname)})`);

  const sigs = [
    "public.book_class_session(uuid)",
    "public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)",
    "public.book_with_membership(uuid, uuid)",
    "public.create_payment_order(uuid)",
    "public.book_class_session_for_person(uuid, uuid)",
    "public.notify_class_booking()",
  ];
  for (const s of sigs) {
    const d = await body(s);
    check(!/'waitlisted'/.test(d) && !/join the waitlist/.test(d) && !/joined the waitlist/.test(d),
      `${s.replace("public.", "").split("(")[0]} names no waitlist any more`);
  }
  const promo = await body("public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)");
  check(/v_refund/.test(promo) && /48 hours/.test(promo), `the cancel core still files its refund and keeps the 48-hour rule`);
  for (const f of ["book_class_session(uuid)", "book_with_membership(uuid, uuid)", "create_payment_order(uuid)", "book_class_session_for_person(uuid, uuid)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} keeps its grants — signed-in yes, anon no`);
  }
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast: a live studio, its owner, and two people off its team ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  check(!!biz, `set-up: a live studio with an owner (${biz?.id})`);
  const people = await q(`
    select p.id, p.full_name from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id = $1)
     order by p.created_at limit 2`, [biz.id]);
  check(people.length === 2, `set-up: two people off the team (${people.length})`);
  const [a, b] = people;

  const plant = async (title, price) => {
    await asNobody();
    const cls = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by)
        values ($1, $2, 'Hip-Hop', 'all', $3, 1, 'draft', $4, $4) returning id`, [biz.id, title, price, biz.owner_id]))[0].id;
    const ses = (await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
        values ($1, $2, now() + interval '5 days', now() + interval '5 days 1 hour', $3, $3) returning id`, [cls, biz.id, biz.owner_id]))[0].id;
    // past the publish rule (a teacher's yes) — replica mode, switched off at once
    await q("set local session_replication_role = replica");
    await q(`update public.classes set status = 'published' where id = $1`, [cls]);
    await q("set local session_replication_role = origin");
    return { cls, ses };
  };

  /* 1 · a free one-seat class: the first person books, the second is refused */
  const free = await plant("Dry NoWaitlist Free", 0);
  await as(a.id);
  const r1 = await tryq(`select * from public.book_class_session($1)`, [free.ses]);
  check(r1.err === null && r1.rows[0].status === "enrolled", `the first person books the one seat (${r1.err ?? r1.rows[0].status})`);
  await as(b.id);
  const r2 = await tryq(`select * from public.book_class_session($1)`, [free.ses]);
  check(/this class is full/.test(r2.err ?? ""), `⚠ the second is refused in words, not filed on a waitlist (${r2.err ?? "allowed"})`);
  await asNobody();
  const rows2 = await q(`select count(*)::int n from public.class_bookings where session_id = $1 and user_id = $2`, [free.ses, b.id]);
  check(rows2[0].n === 0, `…and no row of any kind was written for them (${rows2[0].n})`);

  /* 2 · a cancel frees the seat and promotes nobody */
  await as(a.id);
  const r3 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [r1.rows[0].id]);
  check(r3.err === null, `the first person cancels (${r3.err})`);
  await asNobody();
  const live = await q(`select count(*)::int n from public.class_bookings where session_id = $1 and status = 'enrolled' and deleted_at is null`, [free.ses]);
  check(live[0].n === 0, `nobody was promoted into the freed seat (${live[0].n})`);
  await as(b.id);
  const r4 = await tryq(`select * from public.book_class_session($1)`, [free.ses]);
  check(r4.err === null && r4.rows[0].status === "enrolled", `the seat is back on sale and the second person books it (${r4.err ?? r4.rows[0].status})`);

  /* 3 · the studio is told "booked" */
  await asNobody();
  const told = await q(`select title from public.notifications where user_id = $1 and title like '%Dry NoWaitlist Free%'`, [biz.owner_id]);
  check(told.length >= 1 && told.every((t) => / booked /.test(t.title)), `the owner is told somebody BOOKED (${told.map((t) => t.title).join(" | ")})`);

  /* 4 · a priced class is the class page's, whether or not it is full */
  const paid = await plant("Dry NoWaitlist Paid", 300);
  await as(a.id);
  const r5 = await tryq(`select * from public.book_class_session($1)`, [paid.ses]);
  check(/takes payment/.test(r5.err ?? ""), `a priced class with a free seat is sent to its class page (${r5.err ?? "allowed"})`);
  await asNobody();
  await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
             values ($1, $2, $3, $4, 'enrolled', $4, $4)`, [paid.ses, paid.cls, biz.id, b.id]);
  await as(a.id);
  const r6 = await tryq(`select * from public.book_class_session($1)`, [paid.ses]);
  check(/this class is full/.test(r6.err ?? ""), `⚠ a priced FULL class is refused — the free path onto its waitlist is closed (${r6.err ?? "allowed"})`);
  const r7 = await tryq(`select public.create_payment_order($1)`, [paid.ses]);
  check(/this class is full/.test(r7.err ?? "") && !/waitlist/.test(r7.err ?? ""), `checkout on a full class says it is full and nothing else (${r7.err ?? "allowed"})`);

  /* 5 · the database refuses the word itself */
  await asNobody();
  const r8 = await tryq(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
             values ($1, $2, $3, $4, 'waitlisted', $4, $4)`, [free.ses, free.cls, biz.id, a.id]);
  check(/class_bookings_status_check/.test(r8.err ?? ""), `a 'waitlisted' row is refused by the CHECK (${r8.err ?? "allowed"})`);
};
