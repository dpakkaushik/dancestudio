// Checks for 20261004190000_a_class_refunds_until_twelve_hours_before, run inside
// the dry run's rolled-back transaction by scripts/dry-run-migration.js. Paid
// seats are planted at a real studio on classes 13 hours, 11 hours and 3 days
// out; each is cancelled through the RPC the app calls, as the learner, and the
// refund row it files is read back.
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
  const slug = () => `dry-twelve-${Math.random().toString(36).slice(2, 10)}`;

  /* ── the catalog ── */
  await asNobody();
  const core = await body("public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)");
  check(/interval '12 hours'/.test(core) && !/48 hours/.test(core), "the seat core's automatic-refund window is 12 hours, and 48 is gone");
  check(/This class is over/.test(core) && /p_called_off/.test(core) && /v_refund/.test(core), "…and it still refuses an ended class, keeps the call-off flag and files its refund");
  const helper = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`);
  check(helper.length === 0, "the anchor helper is gone");
  const coreG = await q(`select has_function_privilege('authenticated', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') a,
                                has_function_privilege('anon', 'public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure, 'execute') n`);
  check(!coreG[0].a && !coreG[0].n, "the core stays executable by NO client role");
  for (const f of ["cancel_class_booking_with_reason(uuid, text)", "cancel_class_booking(uuid)", "cancel_class_bookings_for_class(uuid, text)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a,
                              has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} keeps its grants — signed-in yes, anon no`);
  }
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const before = await q(`select status, count(*)::int n from public.refunds group by status order by status`);
  check(true, `refunds on record, untouched by the apply: ${before.map((r) => `${r.status} ${r.n}`).join(", ") || "none"}`);

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
  const refundOf = async (order) => (await q(`select status, amount_inr, user_id from public.refunds where order_id = $1`, [order]))[0];

  /* 1 · 13 hours out — OUTSIDE the new window: automatic now (it was 'requested') */
  const p13 = await plant("Dry Twelve 13h", "13 hours");
  await as(a.id);
  const r1 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [p13.seat]);
  check(r1.err === null, `cancelling 13 hours ahead goes through (${r1.err})`);
  await asNobody();
  const f1 = await refundOf(p13.order);
  check(f1?.status === "pending" && f1.amount_inr === 300 && f1.user_id === a.id, `⚠ 13 hours ahead the refund is AUTOMATIC — 'pending', ₹300, against the payer (${f1?.status})`);

  /* 2 · 11 hours out — INSIDE the window: the studio decides */
  const p11 = await plant("Dry Twelve 11h", "11 hours");
  await as(a.id);
  const r2 = await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [p11.seat]);
  check(r2.err === null, `cancelling 11 hours ahead goes through (${r2.err})`);
  await asNobody();
  const f2 = await refundOf(p11.order);
  check(f2?.status === "requested", `⚠ 11 hours ahead the refund is a REQUEST the studio decides (${f2?.status})`);

  /* 3 · three days out — automatic, as it always was */
  const p3d = await plant("Dry Twelve 3d", "3 days");
  await as(a.id);
  await tryq(`select public.cancel_class_booking_with_reason($1, 'dry run') j`, [p3d.seat]);
  await asNobody();
  check((await refundOf(p3d.order))?.status === "pending", "three days ahead the refund is automatic, as before");

  /* 4 · a studio calling off a class 2 hours out still refunds automatically */
  const p2 = await plant("Dry Twelve call-off", "2 hours");
  await as(biz.owner_id);
  const r4 = await tryq(`select public.cancel_class_bookings_for_class($1, 'dry run') j`, [p2.cls]);
  check(r4.err === null, `the owner calls off a class 2 hours out (${r4.err})`);
  await asNobody();
  check((await refundOf(p2.order))?.status === "pending", "⚠ …and the refund is AUTOMATIC whatever the clock says, as before");

  /* 5 · nothing on record was rewritten */
  const after = await q(`select status, count(*)::int n from public.refunds where order_id not in ($1, $2, $3, $4) group by status order by status`, [p13.order, p11.order, p3d.order, p2.order]);
  check(JSON.stringify(after) === JSON.stringify(before), "no refund already on record changed its status");
};
