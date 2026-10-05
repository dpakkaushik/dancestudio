// Checks for 20261006090000_a_started_class_is_final_for_its_seat, run inside the
// dry run's rolled-back transaction by scripts/dry-run-migration.js. Paid seats
// are planted at a real studio on a class that started 10 minutes ago, one 3 days
// out and one that ended an hour ago; each is cancelled through the RPC the app
// calls, as the learner — and a started class is called off by its owner.
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
  const body = async (sig) => (await q(`select pg_get_functiondef($1::regprocedure) d`, [sig]))[0].d;
  const slug = () => `dry-start-${Math.random().toString(36).slice(2, 10)}`;

  /* ── the catalog ── */
  await asNobody();
  const core = await body("public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)");
  check(/This class has started — it can no longer be cancelled/.test(core) && /not p_called_off/.test(core), "the seat core refuses a STARTED session unless the class is being called off");
  check(/This class is over/.test(core) && /interval '12 hours'/.test(core) && /v_refund/.test(core), "…and keeps the over rule, the 12-hour window and its refund");
  check((await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`)).length === 0, "the anchor helper is gone");
  const coreG = await q(`select has_function_privilege('authenticated', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') a,
                                has_function_privilege('anon', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') n`);
  check(!coreG[0].a && !coreG[0].n, "the core stays executable by NO client role");
  for (const f of ["cancel_class_booking_with_reason(uuid, text)", "cancel_class_booking(uuid)", "cancel_class_bookings_for_class(uuid, text)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} keeps its grants — signed-in yes, anon no`);
  }
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast ── */
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

  const plant = async (title, startOffset) => {
    await asNobody();
    await q("set local session_replication_role = replica");
    const cls = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
        values ($1, $2, 'Hip-Hop', 'all', 300, 10, 'published', $3, $3, $4) returning id`, [biz.id, title, biz.owner_id, slug()]))[0].id;
    const ses = (await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
        values ($1, $2, now() + $3::interval, now() + $3::interval + interval '1 hour', $4, $4) returning id`, [cls, biz.id, startOffset, biz.owner_id]))[0].id;
    const seat = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
        values ($1, $2, $3, $4, 'enrolled', $4, $4) returning id`, [ses, cls, biz.id, a.id]))[0].id;
    const order = (await q(`insert into public.orders (business_id, user_id, amount_inr, class_id, session_id, class_booking_id, status, provider, provider_order_id, created_by, updated_by)
        values ($1, $2, 300, $3, $4, $5, 'paid', 'cashfree', $6, $2, $2) returning id`, [biz.id, a.id, cls, ses, seat, `dos_dryrun_${seat}`]))[0].id;
    await q(`insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
        values ($1, $2, $4, 300, 'captured', 'upi', $3, 'cashfree', $2, $2)`, [order, a.id, biz.id, `dryrun_${order}`]);
    await q("set local session_replication_role = origin");
    return { cls, seat, order };
  };
  const seatOf = async (id) => (await q(`select status from public.class_bookings where id = $1`, [id]))[0]?.status;
  const refundOf = async (order) => (await q(`select status from public.refunds where order_id = $1`, [order]))[0];

  /* 1 · started ten minutes ago — the learner is refused, nothing moves */
  const live = await plant("Dry Started", "-10 minutes");
  await as(a.id);
  const r1 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [live.seat]);
  check(/This class has started — it can no longer be cancelled/.test(r1.err ?? ""), `⚠ a learner cancelling a STARTED class is refused in words (${r1.err})`);
  const r1b = await tryq(`select public.cancel_class_booking($1) j`, [live.seat]);
  check(/has started/.test(r1b.err ?? ""), "…and through the free wrapper too");
  await asNobody();
  check((await seatOf(live.seat)) === "enrolled" && !(await refundOf(live.order)), "…the seat stays enrolled and no refund row is written");

  /* 2 · three days out — cancels and refunds automatically, as before */
  const ahead = await plant("Dry Ahead", "3 days");
  await as(a.id);
  const r2 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [ahead.seat]);
  check(r2.err === null, `a class three days out still cancels (${r2.err})`);
  await asNobody();
  check((await refundOf(ahead.order))?.status === "pending", "…with its automatic refund");

  /* 3 · ended an hour ago — the over rule still answers first */
  const over = await plant("Dry Over", "-2 hours");
  await as(a.id);
  const r3 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [over.seat]);
  check(/This class is over/.test(r3.err ?? ""), `an ENDED class is still refused with the over sentence (${r3.err})`);

  /* 4 · the studio calls a STARTED class off — still allowed, still refunded */
  const live2 = await plant("Dry Started Call-off", "-10 minutes");
  await as(biz.owner_id);
  const r4 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [live2.cls]);
  check(r4.err === null, `⚠ the owner may still call off a class that has started (${r4.err})`);
  await asNobody();
  check((await seatOf(live2.seat)) === "cancelled" && (await refundOf(live2.order))?.status === "pending", "…the seat is cancelled and the refund is automatic");
};
