// Checks for 20261006091000_a_pass_can_go_back_within_a_week, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js. A membership is
// planted at a real studio with paid and free passes in every state that matters,
// and each is returned through the RPC the app calls, as its holder.
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
  const g = await q(`select has_function_privilege('authenticated', 'public.return_membership_pass(uuid)'::regprocedure, 'execute') a,
                            has_function_privilege('anon', 'public.return_membership_pass(uuid)'::regprocedure, 'execute') n`);
  check(g[0].a && !g[0].n, "return_membership_pass is signed-in only — anon cannot call it");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const nr = (await q(`select pg_get_functiondef('public.notify_refund()'::regprocedure) d`))[0].d;
  check(/v_membership/.test(nr) && /returned unused within 7 days/.test(nr) && /cancelled outside the policy window/.test(nr), "notify_refund names a returned membership and keeps a class's words");
  check((await q(`select tgname from pg_trigger where tgrelid='public.refunds'::regclass and tgname='notify_refund'`)).length === 1, "…and is still bound to refunds");
  check((await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`)).length === 0, "the anchor helper is gone");

  /* ── the cast ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  check(!!biz, "set-up: a live studio with an owner");
  const people = await q(`
    select p.id from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id = $1)
     order by p.created_at limit 2`, [biz.id]);
  const a = people[0];
  const stranger = people[1];
  check(!!a && !!stranger, "set-up: two people off the team");

  await asNobody();
  await q("set local session_replication_role = replica");
  const mem = (await q(`insert into public.memberships (business_id, name, unit, units, price_inr, total_count, status, created_by, updated_by, validity_days)
      values ($1, 'Dry Ten Hours', 'hours', 10, 2000, 50, 'live', $2, $2, 60) returning id`, [biz.id, biz.owner_id]))[0].id;
  const pass = async ({ price = 2000, used = 0, bought = "2 days", expires = "58 days", status = "active" } = {}) => {
    const p = (await q(`insert into public.membership_passes (membership_id, business_id, user_id, price_inr, unit, units_total, units_used, status, bought_at, validity_days, expires_at, created_by, updated_by)
        values ($1, $2, $3, $4, 'hours', 10, $5, $6, now() - $7::interval, 60, now() + $8::interval, $3, $3) returning id`, [mem, biz.id, a.id, price, used, status, bought, expires]))[0].id;
    let order = null;
    if (price > 0) {
      order = (await q(`insert into public.orders (business_id, user_id, amount_inr, membership_id, membership_pass_id, status, provider, provider_order_id, created_by, updated_by)
          values ($1, $2, $3, $4, $5, 'paid', 'cashfree', $6, $2, $2) returning id`, [biz.id, a.id, price, mem, p, `dos_dryrun_${p}`]))[0].id;
      await q(`insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
          values ($1, $2, $4, $3, 'captured', 'upi', $5, 'cashfree', $2, $2)`, [order, a.id, price, `dryrun_${order}`, biz.id]);
    }
    return { p, order };
  };
  const fresh = await pass();
  const old = await pass({ bought: "8 days" });
  const spent = await pass({ used: 1 });
  const free = await pass({ price: 0 });
  const gone = await pass({ bought: "3 days", expires: "-1 day" });
  await q("set local session_replication_role = origin");

  const passOf = async (id) => (await q(`select status from public.membership_passes where id = $1`, [id]))[0]?.status;
  const refundOf = async (order) => (await q(`select status, amount_inr, user_id, created_by from public.refunds where order_id = $1`, [order]))[0];

  /* 1 · somebody else cannot return it */
  await as(stranger.id);
  const r0 = await tryq(`select public.return_membership_pass($1) j`, [fresh.p]);
  check(/membership not found/.test(r0.err ?? ""), `⚠ somebody else's pass is "not found" to them (${r0.err})`);
  await asNobody();
  check((await passOf(fresh.p)) === "active", "…and it is untouched");

  /* 2 · the holder returns an unused pass bought two days ago */
  await as(a.id);
  const r1 = await tryq(`select public.return_membership_pass($1) j`, [fresh.p]);
  check(r1.err === null && r1.rows[0].j.refund?.status === "pending" && r1.rows[0].j.refund?.amount_inr === 2000, `⚠ the holder returns an unused pass — one automatic ₹2,000 refund (${r1.err ?? JSON.stringify(r1.rows[0].j)})`);
  await asNobody();
  check((await passOf(fresh.p)) === "cancelled", "…the pass is cancelled");
  const f1 = await refundOf(fresh.order);
  check(f1?.status === "pending" && f1.user_id === a.id && f1.created_by === a.id, "…the refund is 'pending' against the holder, who is also its actor");
  check((await q(`select status from public.orders where id = $1`, [fresh.order]))[0].status === "refund_pending", "…and the order is refund_pending");
  const told = await q(`select title, body, href from public.notifications where user_id = $1 and created_at >= now() - interval '1 minute' and body like 'Dry Ten Hours%' order by created_at desc limit 1`, [a.id]);
  check(told[0] && /returned unused within 7 days/.test(told[0].body) && told[0].href === "/memberships", `the holder is told in a membership's words, with a door to Memberships (${told[0]?.body} → ${told[0]?.href})`);
  const owner = await q(`select body, href from public.notifications where user_id = $1 and body like 'Dry Ten Hours%' order by created_at desc limit 1`, [biz.owner_id]);
  check(owner[0] && owner[0].href === `/business/${biz.id}/memberships`, `the studio is told too, with a real link (${owner[0]?.href})`);

  /* 3 · returning it twice is refused */
  await as(a.id);
  const r2 = await tryq(`select public.return_membership_pass($1) j`, [fresh.p]);
  check(/Only an active membership/.test(r2.err ?? ""), `a pass already returned cannot be returned again (${r2.err})`);

  /* 4 · eight days old — refused */
  const r3 = await tryq(`select public.return_membership_pass($1) j`, [old.p]);
  check(/within 7 days/.test(r3.err ?? ""), `⚠ a pass bought 8 days ago is refused in words (${r3.err})`);

  /* 5 · an hour spent — refused */
  const r4 = await tryq(`select public.return_membership_pass($1) j`, [spent.p]);
  check(/has been used/.test(r4.err ?? ""), `⚠ a pass with an hour spent is refused in words (${r4.err})`);

  /* 6 · run out — refused */
  const r5 = await tryq(`select public.return_membership_pass($1) j`, [gone.p]);
  check(/run out/.test(r5.err ?? ""), `a pass that has run out is refused (${r5.err})`);

  /* 7 · a free pass is simply handed back */
  const r6 = await tryq(`select public.return_membership_pass($1) j`, [free.p]);
  check(r6.err === null && r6.rows[0].j.refund === null, `a free pass is handed back with no refund (${r6.err})`);
  await asNobody();
  check((await passOf(free.p)) === "cancelled", "…and is cancelled");
  check((await passOf(old.p)) === "active" && (await passOf(spent.p)) === "active", "the refused passes are untouched");
  check(!(await refundOf(old.order)) && !(await refundOf(spent.order)), "…and no refund was written for them");

  /* 8 · a class refund's words are unchanged */
  check(/'A booking'/.test(nr) && /Refund on its way/.test(nr), "a class or event refund's notification is worded as before");
};
