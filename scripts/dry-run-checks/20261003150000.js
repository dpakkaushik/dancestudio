// Checks for 20261003150000_a_refund_marks_what_it_covers, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js. Real enquiries,
// real orders and payments applied through the real appliers, as the real roles.
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

  /* ── the catalog ── */
  await asNobody();
  const acl = await q(`select proname, array(select a::text from unnest(coalesce(proacl,'{}')) a order by 1) acl
                         from pg_proc where pronamespace='public'::regnamespace and proname in ('apply_refund_update','settle_refund_offline') order by 1`);
  check(acl.length === 2, `both functions exist once each (${acl.length})`);
  check(JSON.stringify(acl[0].acl) === JSON.stringify(["postgres=X/postgres", "service_role=X/postgres"]), `apply_refund_update still the service role's alone (${acl[0].acl})`);
  check(JSON.stringify(acl[1].acl) === JSON.stringify(["authenticated=X/postgres", "postgres=X/postgres", "service_role=X/postgres"]), `settle_refund_offline still authenticated + service role (${acl[1].acl})`);
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast: a studio, its owner, a sender ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  const sender = (await q(`select p.id from public.profiles p where p.deleted_at is null and p.id <> $2
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null) limit 1`, [biz.id, biz.owner_id]))[0];

  let n = 0;
  /* an enquiry quoted ₹1,000 at 50%, accepted, and its ₹500 advance captured */
  const paidEnquiry = async () => {
    n += 1;
    await asNobody();
    const e = (await q(`insert into public.enquiries (business_id, from_user_id, type_key, fields, dates, message, status, created_by, updated_by)
      values ($1, $2, 'private', '[]', array[current_date + 7], 'Dry run refund label', 'new', $2, $2) returning id`, [biz.id, sender.id]))[0].id;
    await as(biz.owner_id);
    await q(`select public.respond_to_enquiry($1, true)`, [e]);
    const quote = (await q(`select to_jsonb(public.send_enquiry_quote($1, null, 1000, 50)) r`, [e]))[0].r;
    await as(sender.id);
    await q(`select public.answer_enquiry_quote($1, 'accept')`, [quote.id]);
    const order = (await q(`select (public.create_enquiry_payment_order($1)).id id`, [quote.id]))[0].id;
    await asNobody();
    const po = `dos_dry_rl_${n}`, pp = `dry_rl_pay_${n}`;
    await q(`update public.orders set provider_order_id = $2 where id = $1`, [order, po]);
    await q(`select public.apply_captured_payment($1, $2, 50000, 'upi')`, [po, pp]);
    const pay = (await q(`select id, status, amount_inr from public.payments where order_id = $1`, [order]))[0];
    return { e, order, pp, pay };
  };
  const st = async (order) => (await q(`select o.status os, p.status ps from public.orders o join public.payments p on p.order_id = o.id where o.id = $1`, [order]))[0];

  /* 1 · a PARTIAL refund through the rail leaves the payment and the order paid */
  const a = await paidEnquiry();
  check(a.pay && a.pay.status === "captured" && a.pay.amount_inr === 500, `set-up: ₹${a.pay?.amount_inr} captured on the advance (${a.pay?.status})`);
  await as(sender.id);
  const t1 = (await q(`select public.end_enquiry($1, 'Plans changed', 300) r`, [a.e]))[0].r;
  await as(biz.owner_id);
  await q(`select public.answer_enquiry_ending($1, 'accept')`, [t1.ending_id]);
  await asNobody();
  const r1 = (await q(`select id, amount_inr, status from public.refunds where order_id = $1`, [a.order]));
  check(r1.length === 1 && r1[0].amount_inr === 300 && r1[0].status === "pending", `accepting ₹300 back filed one pending refund (${JSON.stringify(r1)})`);
  const out1 = (await q(`select public.apply_refund_update($1, 'cf_dry_rl_1', 30000, true) o`, [a.pp]))[0].o;
  check(out1.outcome === "processed", `the rail's SUCCESS lands it (${JSON.stringify(out1)})`);
  const s1 = await st(a.order);
  check(s1.ps === "captured" && s1.os === "paid", `⚠ ₹300 of ₹500: the payment stays captured and the order paid (${s1.ps} / ${s1.os}) — before this migration both read refunded`);

  /* 2 · a SECOND refund that completes it marks both refunded */
  await q(`insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr, reason, status, created_by, updated_by)
           select p.id, p.order_id, p.business_id, p.user_id, p.provider, 200, 'the rest', 'pending', p.user_id, p.user_id from public.payments p where p.order_id = $1`, [a.order]);
  await q(`select public.apply_refund_update($1, 'cf_dry_rl_1b', 20000, true)`, [a.pp]);
  const s2 = await st(a.order);
  check(s2.ps === "refunded" && s2.os === "refunded", `₹300 + ₹200 = ₹500: now both read refunded (${s2.ps} / ${s2.os})`);

  /* 3 · a replay of the first event changes nothing */
  await q(`select public.apply_refund_update($1, 'cf_dry_rl_1', 30000, true)`, [a.pp]);
  const rr = await q(`select count(*)::int n, sum(amount_inr)::int s from public.refunds where order_id = $1 and status = 'processed'`, [a.order]);
  check(rr[0].n === 2 && rr[0].s === 500, `a replayed event is a no-op (${rr[0].n} refunds, ₹${rr[0].s})`);

  /* 4 · a FULL refund through the rail marks both refunded at once (the class case) */
  const b = await paidEnquiry();
  await as(sender.id);
  const t4 = (await q(`select public.end_enquiry($1, 'Plans changed', 500) r`, [b.e]))[0].r;
  await as(biz.owner_id);
  await q(`select public.answer_enquiry_ending($1, 'accept')`, [t4.ending_id]);
  await asNobody();
  await q(`select public.apply_refund_update($1, 'cf_dry_rl_4', 50000, true)`, [b.pp]);
  const s4 = await st(b.order);
  check(s4.ps === "refunded" && s4.os === "refunded", `a full refund still marks both refunded (${s4.ps} / ${s4.os})`);

  /* 5 · a FAILED rail refund marks nothing */
  const f = await paidEnquiry();
  await q(`insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr, reason, status, created_by, updated_by)
           select p.id, p.order_id, p.business_id, p.user_id, p.provider, 500, 'probe', 'pending', p.user_id, p.user_id from public.payments p where p.order_id = $1`, [f.order]);
  const out5 = (await q(`select public.apply_refund_update($1, 'cf_dry_rl_5', 50000, false) o`, [f.pp]))[0].o;
  const s5 = await st(f.order);
  check(out5.outcome === "failed" && s5.ps === "captured" && s5.os === "paid", `a failed refund leaves both paid (${out5.outcome}: ${s5.ps} / ${s5.os})`);

  /* 6 · at the DESK: a partial settle marks nothing, the settle that completes it marks BOTH */
  const d = await paidEnquiry();
  const plantRefund = async (amt) => (await q(`insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr, reason, status, created_by, updated_by)
           select p.id, p.order_id, p.business_id, p.user_id, p.provider, $2, 'desk', 'pending', p.user_id, p.user_id from public.payments p where p.order_id = $1 returning id`, [d.order, amt]))[0].id;
  const d1 = await plantRefund(200);
  await as(biz.owner_id);
  await q(`select public.settle_refund_offline($1)`, [d1]);
  await asNobody();
  const s6 = await st(d.order);
  check(s6.ps === "captured" && s6.os === "paid", `₹200 of ₹500 handed back at the desk: both stay paid (${s6.ps} / ${s6.os}) — before, the ORDER read refunded`);
  const d2 = await plantRefund(300);
  await as(biz.owner_id);
  await q(`select public.settle_refund_offline($1)`, [d2]);
  await asNobody();
  const s7 = await st(d.order);
  check(s7.ps === "refunded" && s7.os === "refunded", `the settle that completes it marks the PAYMENT too, which it never did (${s7.ps} / ${s7.os})`);

  /* 7 · the old refusals still refuse */
  const e = await paidEnquiry();
  const x = (await q(`insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr, reason, status, created_by, updated_by)
           select p.id, p.order_id, p.business_id, p.user_id, p.provider, 500, 'x', 'pending', p.user_id, p.user_id from public.payments p where p.order_id = $1 returning id`, [e.order]))[0].id;
  await as(sender.id);
  await q("savepoint sp");
  let refused = null;
  try { await q(`select public.settle_refund_offline($1)`, [x]); await q("release savepoint sp"); } catch (err) { refused = err.message; await q("rollback to savepoint sp"); }
  check(refused && /only the owner/.test(refused), `the payer cannot settle their own refund (${refused ?? "ACCEPTED"})`);
  await asNobody();
  const live = await q(`select count(*)::int n from public.payments where status = 'refunded' and deleted_at is null and created_at < now() - interval '1 minute'`);
  check(live[0].n === 0, `no existing payment was relabelled (${live[0].n})`);
};
