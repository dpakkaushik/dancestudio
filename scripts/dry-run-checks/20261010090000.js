// Checks for 20261010090000_a_refund_said_when_paid_and_a_leaver_can_return,
// run inside the dry run's rolled-back transaction by scripts/dry-run-migration.js.
// Part 1 plants a studio subscription with a captured first-period payment and
// drives the refund through pending → processed and pending → failed. Part 2
// makes a real person leave through `request_account_deletion` (with an artist
// page planted for them) and then restores them.
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
  const asService = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
    await q("set local role service_role");
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
  const priv = async (role, sig) => (await q(`select has_function_privilege($1, $2::regprocedure, 'execute') x`, [role, sig]))[0].x;

  /* ── the catalog ── */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 107, `public policies 106 → 107, the one new read policy (${pol[0].n})`);
  const apply = "public.apply_subscription_refund_update(text,boolean)";
  check(!(await priv("anon", apply)) && !(await priv("authenticated", apply)) && (await priv("service_role", apply)), "the refund applier is the service role's alone");
  for (const sig of ["public.admin_left_accounts()", "public.admin_restore_account(uuid,text)", "public.admin_record_first_period_refund(uuid,text,text)"]) {
    check((await priv("authenticated", sig)) && !(await priv("anon", sig)), `${sig} is signed-in only`);
  }
  const tg = await q(`select has_table_privilege('anon', 'public.subscription_refunds', 'select') a,
                            has_table_privilege('authenticated', 'public.subscription_refunds', 'select') s,
                            has_table_privilege('authenticated', 'public.subscription_refunds', 'insert') i,
                            has_table_privilege('authenticated', 'public.subscription_refunds', 'update') u`);
  check(!tg[0].a && tg[0].s && !tg[0].i && !tg[0].u, "subscription_refunds: anon nothing, signed-in SELECT only");
  const rls = await q(`select relrowsecurity r from pg_class where oid = 'public.subscription_refunds'::regclass`);
  check(rls[0].r, "subscription_refunds has RLS on");
  const fk = await q(`select count(*)::int n from pg_constraint where conrelid='public.subscription_refunds'::regclass and contype='f' and confrelid='auth.users'::regclass`);
  check(fk[0].n === 0, "no audit column carries a foreign key into auth.users");

  /* ── part 1 · the first-month refund ── */
  const admin = (await q(`select user_id from public.platform_admins where deleted_at is null limit 1`))[0];
  const biz = (await q(`
    select b.id, b.name, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' and m.user_id not in (select user_id from public.platform_admins where deleted_at is null)
     limit 1`))[0];
  const stranger = (await q(`select id from public.profiles where deleted_at is null and id <> $1
                              and id not in (select user_id from public.platform_admins where deleted_at is null) limit 1`, [biz.owner_id]))[0];
  check(!!admin && !!biz && !!stranger, "set-up: an admin, a studio with an owner, a stranger");

  await asNobody();
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: biz.owner_id })]);
  await q("set local session_replication_role = replica");
  const sub = (await q(`insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status, granted, cancel_at_period_end, provider, provider_subscription_id)
      values ('studio', $1, $2, 'studio_monthly', 1200, 'monthly', 'expired', false, true, 'cashfree', 'dos_sub_dryrun_y') returning id`, [biz.owner_id, biz.id]))[0].id;
  const pay = (await q(`insert into public.payments (kind, subscription_id, user_id, business_id, provider, provider_payment_id, amount_inr, status, method)
      values ('subscription_auth', $1, $2, null, 'cashfree', 'sub_auth_dryrun_y', 1200, 'captured', 'upi') returning id`, [sub, biz.owner_id]))[0].id;
  await q("set local session_replication_role = origin");

  await as(admin.user_id);
  const r1 = await tryq(`select public.admin_record_first_period_refund($1, 'dos_subref_dry_1', 'Studio not approved — no floor in the photos') j`, [sub]);
  check(!r1.err && r1.rows[0].j.status === "pending" && r1.rows[0].j.amount_inr === 1200, `the admin records it PENDING (${r1.err ?? JSON.stringify(r1.rows[0].j)})`);
  await asNobody();
  check((await q(`select status from public.payments where id = $1`, [pay]))[0].status === "captured", "⚠ the payment stays CAPTURED until Cashfree says the money moved");
  const row = (await q(`select * from public.subscription_refunds where payment_id = $1`, [pay]))[0];
  check(row && row.status === "pending" && row.user_id === biz.owner_id && row.amount_inr === 1200, "one pending refund row, the payer's, ₹1,200");
  const n1 = await q(`select title from public.notifications where user_id = $1 and title like '%is being refunded%'`, [biz.owner_id]);
  check(n1.length === 1 && n1[0].title.includes("1,200"), `the payer is told it is ON ITS WAY, not that it landed (${n1[0]?.title})`);

  await as(admin.user_id);
  const r2 = await tryq(`select public.admin_record_first_period_refund($1, 'dos_subref_dry_2', 'again') j`, [sub]);
  check(/already being refunded/.test(r2.err ?? ""), `a second refund while one is pending is refused (${r2.err})`);

  /* who reads the row */
  await as(biz.owner_id);
  check((await q(`select count(*)::int n from public.subscription_refunds where payment_id = $1`, [pay]))[0].n === 1, "the payer reads their own refund");
  await as(stranger.id);
  check((await q(`select count(*)::int n from public.subscription_refunds where payment_id = $1`, [pay]))[0].n === 0, "a stranger reads nothing");
  await as(admin.user_id);
  check((await q(`select count(*)::int n from public.subscription_refunds where payment_id = $1`, [pay]))[0].n === 1, "a platform admin reads it");
  const w = await tryq(`update public.subscription_refunds set status = 'processed' where payment_id = $1 returning id`, [pay]);
  check(w.err !== null || w.rows.length === 0, "⚠ nobody signed in can write the row");
  const ap = await tryq(`select public.apply_subscription_refund_update('dos_subref_dry_1', true) j`);
  check(/permission denied/.test(ap.err ?? ""), `a signed-in admin cannot land Cashfree's answer — the service role's alone (${ap.err})`);

  /* Cashfree says SUCCESS */
  await asService();
  const ok1 = (await q(`select public.apply_subscription_refund_update('dos_subref_dry_1', true) j`))[0].j;
  check(ok1.outcome === "processed", `SUCCESS lands (${JSON.stringify(ok1)})`);
  await asNobody();
  check((await q(`select status from public.payments where id = $1`, [pay]))[0].status === "refunded", "the payment reads REFUNDED now");
  check((await q(`select status from public.subscription_refunds where provider_refund_id = 'dos_subref_dry_1'`))[0].status === "processed", "the row reads processed");
  const n2 = await q(`select title from public.notifications where user_id = $1 and title like '%is back%'`, [biz.owner_id]);
  check(n2.length === 1, "the payer is told it landed");
  await asService();
  const dup = (await q(`select public.apply_subscription_refund_update('dos_subref_dry_1', true) j`))[0].j;
  check(dup.outcome === "duplicate", "a second SUCCESS is a no-op");
  const unk = (await q(`select public.apply_subscription_refund_update('dos_subref_nobody', true) j`))[0].j;
  check(unk.outcome === "unknown", "an unknown refund id moves nothing");
  await asNobody();
  check((await q(`select count(*)::int n from public.notifications where user_id = $1 and title like '%is back%'`, [biz.owner_id]))[0].n === 1, "the replay did not tell the payer twice");
  await as(admin.user_id);
  const r3 = await tryq(`select public.admin_record_first_period_refund($1, 'dos_subref_dry_3', 'once more') j`, [sub]);
  check(/already refunded/.test(r3.err ?? ""), "once processed, the first period is refused as already refunded");

  /* a FAILED one: the payment stays paid, the admins are told, another may follow */
  await asNobody();
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: biz.owner_id })]);
  await q("set local session_replication_role = replica");
  const sub2 = (await q(`insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status, granted, cancel_at_period_end, provider, provider_subscription_id)
      values ('studio', $1, $2, 'studio_monthly', 1200, 'monthly', 'expired', false, true, 'cashfree', 'dos_sub_dryrun_z') returning id`, [biz.owner_id, biz.id]))[0].id;
  const pay2 = (await q(`insert into public.payments (kind, subscription_id, user_id, business_id, provider, provider_payment_id, amount_inr, status, method)
      values ('subscription_auth', $1, $2, null, 'cashfree', 'sub_auth_dryrun_z', 1200, 'captured', 'upi') returning id`, [sub2, biz.owner_id]))[0].id;
  await q("set local session_replication_role = origin");
  await as(admin.user_id);
  await q(`select public.admin_record_first_period_refund($1, 'dos_subref_dry_f1', 'Studio not approved') j`, [sub2]);
  await asService();
  const f = (await q(`select public.apply_subscription_refund_update('dos_subref_dry_f1', false) j`))[0].j;
  check(f.outcome === "failed", "FAILED lands");
  await asNobody();
  check((await q(`select status from public.payments where id = $1`, [pay2]))[0].status === "captured", "⚠ a failed refund leaves the payment PAID — the truth");
  const na = await q(`select count(*)::int n from public.notifications n join public.platform_admins a on a.user_id = n.user_id and a.deleted_at is null
                       where n.title like 'A first-month refund failed%'`);
  const admins = await q(`select count(*)::int n from public.platform_admins a join public.profiles p on p.id = a.user_id and p.deleted_at is null where a.deleted_at is null`);
  check(na[0].n === admins[0].n, `every platform admin with a profile is told (${na[0].n} of ${admins[0].n})`);
  await as(admin.user_id);
  const again = await tryq(`select public.admin_record_first_period_refund($1, 'dos_subref_dry_f2', 'trying again') j`, [sub2]);
  check(!again.err, `after a FAILED one, another refund may be filed (${again.err})`);

  /* ── part 2 · an account that left, put back ── */
  await asNobody();
  const people = await q(`select p.id, p.full_name from public.profiles p
                           where p.deleted_at is null and p.id not in (select user_id from public.platform_admins where deleted_at is null)
                             and p.id <> $1 and p.id <> $2
                           order by p.created_at desc limit 40`, [stranger.id, biz.owner_id]);
  let leaver = null;
  let pageId = null;
  for (const p of people) {
    await asNobody();
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p.id })]);
    await q("savepoint try_leaver");
    let pid = null;
    try {
      await q("set local session_replication_role = replica");
      const own = await q(`select count(*)::int n from public.business_members m join public.businesses b on b.id = m.business_id
                            where m.user_id = $1 and m.member_role = 'owner' and m.deleted_at is null and b.deleted_at is null and b.type = 'artist_page'`, [p.id]);
      if (own[0].n === 0) {
        pid = (await q(`insert into public.businesses (type, name, city, visibility, created_by, updated_by, member_no)
                          values ('artist_page', 'Dry Run Page', 'Pune', 'listed', $1, $1, 990000 + floor(random() * 9999)::int) returning id`, [p.id]))[0].id;
        await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2)`, [pid, p.id]);
      }
      await q("set local session_replication_role = origin");
      await as(p.id);
      await q(`select public.request_account_deletion('Moving away') j`);
      await q("release savepoint try_leaver");
      leaver = p;
      pageId = pid;
      break;
    } catch {
      await q("rollback to savepoint try_leaver");
    }
  }
  check(!!leaver, `set-up: a real person LEFT through request_account_deletion (${leaver?.full_name})`);
  if (!leaver) return;
  await asNobody();
  const left = (await q(`select deleted_at from public.profiles where id = $1`, [leaver.id]))[0].deleted_at;
  check(left !== null, "their profile is soft-deleted");

  await as(admin.user_id);
  const list = await q(`select * from public.admin_left_accounts()`);
  const mine = list.find((r) => r.user_id === leaver.id);
  check(!!mine && mine.thread_id && mine.full_name === leaver.full_name, "admin_left_accounts lists them, with their deletion thread");
  await as(stranger.id);
  check((await q(`select count(*)::int n from public.admin_left_accounts()`))[0].n === 0, "admin_left_accounts answers a non-admin with nothing");

  const s0 = await tryq(`select public.admin_restore_account($1, 'They asked to come back') j`, [leaver.id]);
  check(/not a platform admin/.test(s0.err ?? ""), "a non-admin cannot restore");
  await as(admin.user_id);
  const s1 = await tryq(`select public.admin_restore_account($1, 'x') j`, [leaver.id]);
  check(/say why/.test(s1.err ?? ""), "a reason is required");
  const s2 = await tryq(`select public.admin_restore_account($1, 'They asked to come back') j`, [stranger.id]);
  check(/has not left/.test(s2.err ?? ""), `an account that never left is refused in words (${s2.err})`);
  const s3 = await tryq(`select public.admin_restore_account($1, 'They asked to come back') j`, [leaver.id]);
  check(!s3.err, `the admin restores them (${s3.err ?? JSON.stringify(s3.rows?.[0]?.j)})`);
  await asNobody();
  check((await q(`select deleted_at from public.profiles where id = $1`, [leaver.id]))[0].deleted_at === null, "their profile is live again");
  if (pageId) {
    const pg = (await q(`select deleted_at from public.businesses where id = $1`, [pageId]))[0];
    const seat = (await q(`select deleted_at from public.business_members where business_id = $1 and user_id = $2 and member_role = 'owner'`, [pageId, leaver.id]))[0];
    check(pg.deleted_at === null && seat.deleted_at === null, "their artist page and its owner seat are back");
    check(s3.rows[0].j.artist_pages === 1, "the restore counts the one page");
  }
  const msg = await q(`select from_admin, body from public.support_messages where thread_id = $1 and from_admin and body like 'Your account is back%'`, [mine.thread_id]);
  check(msg[0]?.from_admin && msg[0].body.startsWith("Your account is back"), "DanceOS answers in their deletion thread");
  check((await q(`select count(*)::int n from public.notifications where user_id = $1 and title = 'Your account is back'`, [leaver.id]))[0].n === 1, "they are told");
  check((await q(`select count(*)::int n from public.admin_audit where action = 'account.restore' and subject_id = $1`, [leaver.id]))[0].n === 1, "the audit log carries account.restore");
  await as(admin.user_id);
  const s4 = await tryq(`select public.admin_restore_account($1, 'They asked to come back') j`, [leaver.id]);
  check(/has not left/.test(s4.err ?? ""), "restoring twice is refused");
  check(!(await q(`select * from public.admin_left_accounts()`)).some((r) => r.user_id === leaver.id), "and they are off the Left list");
  await asNobody();
};
