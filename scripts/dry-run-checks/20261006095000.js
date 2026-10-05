// Checks for 20261006095000_a_rejected_studio_gets_its_first_month_back, run
// inside the dry run's rolled-back transaction by scripts/dry-run-migration.js.
// A studio subscription with a captured authorisation payment is planted, and the
// refund is recorded the way the verification desk records it — as an admin.
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
  const FN = "public.admin_record_first_period_refund";

  /* ── the catalog ── */
  await asNobody();
  const g = await q(`select has_function_privilege('authenticated', '${FN}(uuid,text,text)'::regprocedure, 'execute') a,
                            has_function_privilege('anon', '${FN}(uuid,text,text)'::regprocedure, 'execute') n`);
  check(g[0].a && !g[0].n, "the record door is signed-in only — anon cannot call it");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast ── */
  const admin = (await q(`select user_id from public.platform_admins where deleted_at is null limit 1`))[0];
  const biz = (await q(`
    select b.id, b.name, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' and m.user_id not in (select user_id from public.platform_admins where deleted_at is null)
       and not exists (select 1 from public.subscriptions s where s.business_id = b.id and s.deleted_at is null)
     limit 1`))[0];
  check(!!admin && !!biz, "set-up: an admin and a studio with an owner");

  await asNobody();
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: biz.owner_id })]);
  await q("set local session_replication_role = replica");
  const sub = (await q(`insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status, granted, cancel_at_period_end, provider, provider_subscription_id)
      values ('studio', $1, $2, 'studio_monthly', 1200, 'monthly', 'active', false, false, 'cashfree', 'dos_sub_dryrun_x') returning id`, [biz.owner_id, biz.id]))[0].id;
  const pay = (await q(`insert into public.payments (kind, subscription_id, user_id, business_id, provider, provider_payment_id, amount_inr, status, method)
      values ('subscription_auth', $1, $2, null, 'cashfree', 'sub_auth_dryrun_x', 1200, 'captured', 'upi') returning id`, [sub, biz.owner_id]))[0].id;
  await q(`insert into public.payments (kind, subscription_id, user_id, business_id, provider, provider_payment_id, amount_inr, status, method)
      values ('subscription_charge', $1, $2, null, 'cashfree', 'charge_dryrun_x', 1200, 'captured', 'upi')`, [sub, biz.owner_id]);
  const comp = (await q(`insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status, granted, cancel_at_period_end)
      values ('studio', $1, $2, 'studio_monthly', 0, 'monthly', 'expired', true, true) returning id`, [biz.owner_id, biz.id]))[0].id;
  await q("set local session_replication_role = origin");

  /* 1 · not an admin — the owner themselves is refused */
  await as(biz.owner_id);
  const r0 = await tryq(`select ${FN}($1, 'cf_ref_1', 'Studio not approved') j`, [sub]);
  check(/not a platform admin/.test(r0.err ?? ""), `⚠ somebody who is not an admin is refused (${r0.err})`);

  /* 2 · the admin records it */
  await as(admin.user_id);
  const r1 = await tryq(`select ${FN}($1, 'cf_ref_1', 'Studio not approved — no floor in the photos') j`, [sub]);
  check(!r1.err && r1.rows[0].j.amount_inr === 1200 && r1.rows[0].j.payment_id === pay, `the admin records the first period's refund (${r1.err ?? JSON.stringify(r1.rows[0].j)})`);
  await asNobody();
  const st = (await q(`select status from public.payments where id = $1`, [pay]))[0].status;
  check(st === "refunded", "the AUTHORISATION payment reads refunded");
  const ch = (await q(`select status from public.payments where subscription_id = $1 and kind = 'subscription_charge'`, [sub]))[0].status;
  check(ch === "captured", "⚠ a renewal charge is NOT touched — only the first period was never usable");
  const n = await q(`select title, href from public.notifications where user_id = $1 and title like '%coming back%' order by created_at desc limit 1`, [biz.owner_id]);
  check(n.length === 1 && n[0].title.includes("1,200") && n[0].title.includes(biz.name) && n[0].href === "/invoices", `the payer is told, with the amount (${JSON.stringify(n[0])})`);
  const a = await q(`select subject_kind, subject_id, detail from public.admin_audit where action = 'subscription.refund' and (detail->>'subscription_id') = $1`, [sub]);
  check(a.length === 1 && a[0].subject_kind === "business" && a[0].subject_id === biz.id && a[0].detail.provider_refund_id === "cf_ref_1" && Number(a[0].detail.amount_inr) === 1200,
    "the audit log carries subscription.refund, the amount and Cashfree's refund id");

  /* 3 · never twice */
  await as(admin.user_id);
  const r2 = await tryq(`select ${FN}($1, 'cf_ref_2', 'again') j`, [sub]);
  check(/already refunded/.test(r2.err ?? ""), `a second refund is refused (${r2.err})`);

  /* 4 · a comped plan has nothing to give back */
  const r3 = await tryq(`select ${FN}($1, 'cf_ref_3', 'Studio not approved') j`, [comp]);
  check(/nothing was paid for the first period/.test(r3.err ?? ""), `a comped plan is refused in words (${r3.err})`);

  /* 5 · the reason and the rail id are required */
  const r4 = await tryq(`select ${FN}($1, 'cf_ref_4', 'x') j`, [sub]);
  check(/say why/.test(r4.err ?? ""), "a reason is required");
  const r5 = await tryq(`select ${FN}($1, '', 'Studio not approved') j`, [sub]);
  check(/rail's own refund id/.test(r5.err ?? ""), "the rail's refund id is required");
  await asNobody();

  /* 6 · the service role (no session) is not an admin */
  const r6 = await tryq(`select ${FN}($1, 'cf_ref_6', 'Studio not approved') j`, [sub]);
  check(/not a platform admin/.test(r6.err ?? ""), "a session-less call is refused");
};
