// Checks for 20261004170000_a_finished_class_is_final, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. Classes are planted
// at a real studio with sessions in the PAST, NOW and the FUTURE, a real person
// holds a seat on each (one of them PAID), and every cancel goes through the
// same RPC the app calls, as the real role.
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
  /* replica mode skips the slug trigger, so a planted class brings its own */
  const slug = () => `dry-final-${Math.random().toString(36).slice(2, 10)}`;
  const OVER = /This class is over — it can no longer be cancelled or refunded/;

  /* ── the catalog ── */
  await asNobody();
  const core = await body("public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)");
  check(OVER.test(core) && /v_session\.ends_at <= now\(\)/.test(core), "the seat core refuses an ended session, in words");
  check(/v_refund/.test(core) && /48 hours/.test(core) && /p_called_off/.test(core), "…and still files its refund, keeps the 48-hour rule and the call-off flag");
  const off = await body("public.cancel_class_bookings_for_class(uuid, text)");
  check(OVER.test(off) && /Only the owner of this studio can call off its classes/.test(off), "the call-off refuses a finished class, after the owner check");
  check(off.indexOf("Only the owner of this studio") < off.indexOf("This class is over"), "…and the owner check still comes FIRST");
  const helper = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`);
  check(helper.length === 0, "the anchor helper is gone");
  for (const f of ["cancel_class_booking_with_reason(uuid, text)", "cancel_class_bookings_for_class(uuid, text)", "cancel_class_booking(uuid)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} keeps its grants — signed-in yes, anon no`);
  }
  const coreG = await q(`select has_function_privilege('authenticated', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') a,
                                has_function_privilege('anon', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') n`);
  check(!coreG[0].a && !coreG[0].n, "the core stays executable by NO client role (it takes the payer as an argument)");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast: a live studio, its owner, and one person off its team ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  check(!!biz, `set-up: a live studio with an owner (${biz?.id})`);
  const a = (await q(`
    select p.id from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id = $1)
     order by p.created_at limit 1`, [biz.id]))[0];
  check(!!a, "set-up: a person off the team");

  /* a published class with one seat held by `a`, its session where it is asked
     to be. Planted in replica mode: a past start is refused by the form's own
     trigger, and the publish rule wants a teacher — neither is under test. */
  const plant = async (title, price, startOffset, endOffset) => {
    await asNobody();
    await q("set local session_replication_role = replica");
    const cls = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
        values ($1, $2, 'Hip-Hop', 'all', $3, 10, 'published', $4, $4, $5) returning id`, [biz.id, title, price, biz.owner_id, slug()]))[0].id;
    const ses = (await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
        values ($1, $2, now() + $3::interval, now() + $4::interval, $5, $5) returning id`, [cls, biz.id, startOffset, endOffset, biz.owner_id]))[0].id;
    const seat = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
        values ($1, $2, $3, $4, 'enrolled', $4, $4) returning id`, [ses, cls, biz.id, a.id]))[0].id;
    let order = null;
    if (price > 0) {
      order = (await q(`insert into public.orders (business_id, user_id, amount_inr, class_id, session_id, class_booking_id, status, provider, provider_order_id, created_by, updated_by)
          values ($1, $2, $3, $4, $5, $6, 'paid', 'cashfree', $7, $2, $2) returning id`, [biz.id, a.id, price, cls, ses, seat, `dos_dryrun_${seat}`]))[0].id;
      await q(`insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
          values ($1, $2, $5, $3, 'captured', 'upi', $4, 'cashfree', $2, $2)`, [order, a.id, price, biz.id, `dryrun_${order}`]);
    }
    await q("set local session_replication_role = origin");
    return { cls, ses, seat, order };
  };
  const seatStatus = async (id) => (await q(`select status from public.class_bookings where id = $1`, [id]))[0].status;
  const refundsOn = async (classId) =>
    (await q(`select count(*)::int n from public.refunds r join public.orders o on o.id = r.order_id where o.class_id = $1`, [classId]))[0].n;

  /* 1 · a FREE class that ended an hour ago: the learner cannot cancel, either door */
  const pastFree = await plant("Dry Final Past Free", 0, "-2 hours", "-1 hour");
  await as(a.id);
  const r1 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [pastFree.seat]);
  check(OVER.test(r1.err ?? ""), `⚠ cancelling a seat on an ENDED class is refused in words (${r1.err ?? "allowed"})`);
  const r1b = await tryq(`select public.cancel_class_booking($1)`, [pastFree.seat]);
  check(OVER.test(r1b.err ?? ""), `…and the free wrapper refuses it the same way (${r1b.err ?? "allowed"})`);
  await asNobody();
  check((await seatStatus(pastFree.seat)) === "enrolled", "…and the seat is untouched — still enrolled");

  /* 2 · a PAID class that ended: no cancel, and NO REFUND ROW */
  const pastPaid = await plant("Dry Final Past Paid", 300, "-26 hours", "-25 hours");
  await as(a.id);
  const r2 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [pastPaid.seat]);
  check(OVER.test(r2.err ?? ""), `⚠⚠ a PAID seat on an ended class cannot be cancelled for money back (${r2.err ?? "allowed"})`);
  await asNobody();
  check((await refundsOn(pastPaid.cls)) === 0, `⚠⚠ …and not one refund row was filed (${await refundsOn(pastPaid.cls)})`);
  const ord = await q(`select status from public.orders where id = $1`, [pastPaid.order]);
  check(ord[0].status === "paid", `…and the order still reads paid (${ord[0].status})`);

  /* 3 · a class five days out: the learner cancels exactly as before */
  const future = await plant("Dry Final Future", 0, "5 days", "5 days 1 hour");
  await as(a.id);
  const r3 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [future.seat]);
  check(r3.err === null, `a seat on a class still to come cancels as it always has (${r3.err})`);
  await asNobody();
  check((await seatStatus(future.seat)) === "cancelled", "…and the seat is cancelled");

  /* 4 · a class running RIGHT NOW is not "over" — a learner may still cancel */
  const liveNow = await plant("Dry Final Live", 0, "-30 minutes", "30 minutes");
  await as(a.id);
  const r4 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [liveNow.seat]);
  check(r4.err === null, `a class that has started but not ended is not over — the cancel goes through (${r4.err})`);

  /* 5 · the owner cannot call a FINISHED class off — that is the delete's door */
  const pastPaid2 = await plant("Dry Final Past Paid Two", 300, "-3 hours", "-2 hours");
  await as(biz.owner_id);
  const r5 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [pastPaid2.cls]);
  check(OVER.test(r5.err ?? ""), `⚠⚠ the owner cannot call off a finished class — it would refund every paid seat (${r5.err ?? "allowed"})`);
  await asNobody();
  check((await seatStatus(pastPaid2.seat)) === "enrolled" && (await refundsOn(pastPaid2.cls)) === 0, "…seat still enrolled, no refund filed");

  /* 6 · a class with no booking at all that has finished: still refused */
  await asNobody();
  await q("set local session_replication_role = replica");
  const empty = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
      values ($1, 'Dry Final Empty', 'Hip-Hop', 'all', 0, 10, 'published', $2, $2, $3) returning id`, [biz.id, biz.owner_id, slug()]))[0].id;
  await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() - interval '2 hours', now() - interval '1 hour', $3, $3)`, [empty, biz.id, biz.owner_id]);
  await q("set local session_replication_role = origin");
  await as(biz.owner_id);
  const r6 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [empty]);
  check(OVER.test(r6.err ?? ""), `a finished class with nobody on it is refused too — the rule is the clock, not the money (${r6.err ?? "allowed"})`);

  /* 7 · a class still to come is called off exactly as before, refund and all */
  const futurePaid = await plant("Dry Final Future Paid", 300, "6 days", "6 days 1 hour");
  await as(biz.owner_id);
  const r7 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [futurePaid.cls]);
  check(r7.err === null && r7.rows[0].j.seats === 1 && r7.rows[0].j.refunds === 1, `a future class is called off as it always was — 1 seat, 1 refund (${r7.err ?? JSON.stringify(r7.rows[0].j)})`);
  await asNobody();
  const rf = await q(`select r.status, r.user_id from public.refunds r join public.orders o on o.id = r.order_id where o.class_id = $1`, [futurePaid.cls]);
  check(rf.length === 1 && rf[0].status === "pending" && rf[0].user_id === a.id, `…the refund automatic and filed against the learner (${JSON.stringify(rf)})`);

  /* 8 · a stranger is still refused the call-off by the owner check, not the clock */
  await as(a.id);
  const r8 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [pastPaid2.cls]);
  check(/Only the owner of this studio can call off its classes/.test(r8.err ?? ""), `somebody who is not the owner is told whose act it is first (${r8.err ?? "allowed"})`);
};
