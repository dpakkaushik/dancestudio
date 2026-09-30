/* Checks for 20260930130000 — an unpaid pass is not sold, and a class starts
   ahead. Contract: module.exports = async (client, { check, one }).
   Driven as REAL ROLES inside the rolled-back transaction; check 0 (Rule 18)
   is the harness's own. `before.json` is the live catalog as `snapshot.js`
   read it BEFORE this run, so the bodies can be diffed line by line. */
const fs = require("fs");
const path = require("path");

const BEFORE = JSON.parse(fs.readFileSync(path.join(__dirname, "before.json"), "utf8"));
const RETYPED = ["why_no_membership", "buy_membership", "business_memberships", "public_memberships", "apply_membership_payment"];

module.exports = async function run(c, { check, one }) {
  const q = (sql, args = []) => c.query(sql, args);
  const asService = async () => {
    await q(`reset role`);
    await q(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  };
  const asNobody = async () => {
    await q(`reset role`);
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const asUser = async (id) => {
    await q(`reset role`);
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]);
    await q(`set local role authenticated`);
  };
  /* every expected refusal on its own savepoint (19 Sep) */
  const refusal = async (fn) => {
    await q(`savepoint dos_r`);
    try {
      await fn();
      await q(`release savepoint dos_r`);
      return null;
    } catch (e) {
      await q(`rollback to savepoint dos_r`);
      await q(`release savepoint dos_r`).catch(() => {});
      return e.message;
    }
  };

  /* ── STRUCTURE ─────────────────────────────────────────────────────────── */
  await asNobody();
  const counts = await one(`
    select (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public') fns,
           (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and has_function_privilege('anon', p.oid, 'execute')) anon,
           (select count(*)::int from pg_policies where schemaname='public') pols,
           (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relname='class_sessions' and not t.tgisinternal) sess_triggers`);
  const b = BEFORE.__counts;
  check(counts.fns === b.fns + 1, `1  exactly ONE function added (${b.fns} → ${counts.fns})`, JSON.stringify(counts));
  check(counts.anon === b.anon, `2  anon's executable set UNCHANGED at ${b.anon}`, `read ${counts.anon}`);
  check(counts.pols === b.pols, `3  public policies UNCHANGED at ${b.pols}`, `read ${counts.pols}`);
  check(counts.sess_triggers === b.sess_triggers + 1, `4  class_sessions gained exactly ONE trigger (${b.sess_triggers} → ${counts.sess_triggers})`);
  const trg = await one(`select tgname, tgenabled from pg_trigger where tgname='class_sessions_start_ahead'`);
  check(!!trg && trg.tgenabled !== "D", "5  `class_sessions_start_ahead` is bound and enabled");
  const fn = await one(`select has_function_privilege('anon',p.oid,'execute') a, has_function_privilege('authenticated',p.oid,'execute') u, has_function_privilege('service_role',p.oid,'execute') s
                          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='class_session_starts_ahead'`);
  check(!!fn && !fn.a && !fn.u, "6  the trigger function is executable by NO client role", JSON.stringify(fn));

  /* ── THE DIFF: every re-typed body differs from the live one ONLY where marked ── */
  let diffOk = true;
  for (const n of RETYPED) {
    const after = (await q(
      `select pg_get_functiondef(p.oid) def, pg_get_function_identity_arguments(p.oid) args,
              (select array_agg(r order by r) from unnest(array['anon','authenticated','service_role']) r where has_function_privilege(r, p.oid, 'execute')) grants
         from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=$1`,
      [n]
    )).rows;
    const before = BEFORE[n];
    if (after.length !== 1 || before.length !== 1 || after[0].args !== before[0].args) {
      diffOk = false;
      console.log(`     ✗ ${n}: signature count/args moved`, before.map((x) => x.args), after.map((x) => x.args));
      continue;
    }
    if (JSON.stringify(after[0].grants) !== JSON.stringify(before[0].grants)) {
      diffOk = false;
      console.log(`     ✗ ${n}: ACL moved`, before[0].grants, "→", after[0].grants);
    }
    const norm = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("--"));
    const A = norm(before[0].def);
    const B = norm(after[0].def);
    const removed = A.filter((l) => !B.includes(l));
    const added = B.filter((l) => !A.includes(l));
    console.log(`     ${n}: -${removed.length} +${added.length}`);
    for (const l of removed) console.log(`        - ${l}`);
    for (const l of added) console.log(`        + ${l}`);
    /* what is allowed to differ: the sold-count filter (every one), and in
       buy_membership the resume block */
    /* the resume block, line for line, as pg_get_functiondef prints it */
    const RESUME = new Set([
      "select * into v_row from public.membership_passes p",
      "where p.membership_id = p_membership_id and p.user_id = v_user",
      "and p.status = 'pending_payment' and p.deleted_at is null",
      "order by p.created_at desc limit 1;",
      "if found then",
      "update public.membership_passes",
      "set price_inr = v_m.price_inr, unit = v_m.unit, units_total = v_m.units, updated_by = v_user",
      "where id = v_row.id",
    ]);
    const allowedRemoved = removed.every((l) => /status <> 'cancelled'/.test(l));
    const allowedAdded = added.every((l) => /status in \('active', 'used_up'\)/.test(l) || (n === "buy_membership" && RESUME.has(l)));
    if (!allowedRemoved || !allowedAdded) {
      diffOk = false;
      console.log(`     ✗ ${n}: a line moved that the migration did not mark`);
    }
  }
  check(diffOk, "7  ⚠ every re-typed body differs from the LIVE one only by the marked clause (the lines above are the whole diff)");

  /* ── THE WORLD ─────────────────────────────────────────────────────────── */
  const stamp = Math.random().toString(36).slice(2, 8);
  const mk = async (name) => {
    const r = await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, '', now(), now(), now()) returning id`,
      [`passdry-${name}-${stamp}@example.com`]
    );
    const id = r.rows[0].id;
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, `PassDry ${name} ${stamp}`]);
    return id;
  };
  await asNobody();
  const owner = await mk("owner");
  const b1 = await mk("b1");
  const b2 = await mk("b2");
  const b3 = await mk("b3");
  const b4 = await mk("b4");

  await asUser(owner);
  /* the live signature is (p_name, p_type, …) — read off the catalog, not remembered */
  const biz = (await one(`select (public.create_business_with_owner($1, 'studio', 'Kothrud', 'Pune', array['Hip-Hop'])).id id`, [`PassDry Studio ${stamp}`])).id;
  await asService();
  await q(`update public.businesses set visibility = 'listed', verified_at = now() where id = $1`, [biz]);

  /* a PRICED membership of TWO */
  await asUser(owner);
  const mem = (await one(`select (public.save_membership(null, $1, $2, 'classes', 4, 500, 2, 'live')).id id`, [biz, `PassDry Pack ${stamp}`])).id;

  /* ── 8-10 · AN UNPAID PASS HOLDS NO PLACE ──────────────────────────────── */
  await asUser(b1);
  const p1 = await one(`select id, status, price_inr from public.buy_membership($1)`, [mem]);
  check(p1.status === "pending_payment", "8  a priced pass comes back pending_payment", p1.status);
  await asNobody();
  const pub = await one(`select left_count from public.public_memberships($1)`, [biz]);
  check(pub.left_count === 2, "9  ⚠ the public page still says 2 left — an abandoned window is not a sale", `left ${pub.left_count}`);
  await asUser(owner);
  const desk = await one(`select sold, active from public.business_memberships($1) where id = $2`, [biz, mem]);
  check(desk.sold === 0 && desk.active === 0, "10 ⚠ the seller's desk says 0 sold — it read 1 before", JSON.stringify(desk));
  await asUser(b4);
  const why4 = await one(`select public.why_no_membership($1) why`, [mem]);
  check(why4.why === null, "11 …and a fourth person is told nothing stands in the way (it used to count the unpaid one)", why4.why);

  /* ── 12-13 · PRESSING BUY AGAIN RESUMES, AT TODAY'S PRICE ──────────────── */
  await asUser(b1);
  const p1b = await one(`select id, status, price_inr from public.buy_membership($1)`, [mem]);
  check(p1b.id === p1.id, "12 ⚠ buying again hands back the SAME unpaid pass, not a second one", `${p1.id} vs ${p1b.id}`);
  await asUser(owner);
  await q(`select public.save_membership($1, $2, $3, 'classes', 4, 700, 2, 'live')`, [mem, biz, `PassDry Pack ${stamp}`]);
  await asUser(b1);
  const p1c = await one(`select id, price_inr from public.buy_membership($1)`, [mem]);
  const mine = await one(`select count(*)::int n from public.membership_passes where membership_id = $1 and user_id = $2`, [mem, b1]);
  check(p1c.id === p1.id && p1c.price_inr === 700 && mine.n === 1, "13 …at TODAY's price (₹700), and still exactly one row of theirs", JSON.stringify({ ...p1c, n: mine.n }));

  /* ── 14-16 · TWO PAID PASSES FILL IT; THE LATE PAYER IS REFUNDED, NOT HANDED A THIRD ── */
  const pay = async (buyer) => {
    await asUser(buyer);
    const pass = await one(`select id, price_inr from public.buy_membership($1)`, [mem]);
    const order = await one(`select id, amount_inr from public.create_membership_payment_order($1)`, [pass.id]);
    await asService();
    const pm = await one(
      `insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
       values ($1, $2, $3, $4, 'captured', 'upi', $5, 'cashfree', $2, $2) returning id`,
      [order.id, buyer, `passdry_${stamp}_${buyer.slice(0, 6)}`, order.amount_inr, biz]
    );
    return one(`select public.apply_membership_payment($1, $2, $3) out`, [order.id, pm.id, order.amount_inr * 100]);
  };
  const paid2 = await pay(b2);
  const paid3 = await pay(b3);
  check(paid2.out.outcome === "granted" && paid3.out.outcome === "granted", "14 two real payments are granted", JSON.stringify([paid2.out, paid3.out]));
  await asUser(owner);
  const desk2 = await one(`select sold, active from public.business_memberships($1) where id = $2`, [biz, mem]);
  await asNobody();
  const pub2 = await one(`select left_count from public.public_memberships($1)`, [biz]);
  check(desk2.sold === 2 && pub2.left_count === 0, "15 …and now the desk says 2 sold and the page 0 left — paid passes are what count", JSON.stringify({ ...desk2, left: pub2.left_count }));
  /* b1's money lands LAST, on the pass that has waited since check 8 */
  await asUser(b1);
  const late = await one(`select id from public.create_membership_payment_order($1)`, [p1.id]);
  await asService();
  const latePm = await one(
    `insert into public.payments (order_id, user_id, provider_payment_id, amount_inr, status, method, business_id, provider, created_by, updated_by)
     values ($1, $2, $3, 700, 'captured', 'upi', $4, 'cashfree', $2, $2) returning id`,
    [late.id, b1, `passdry_${stamp}_late`, biz]
  );
  const lateOut = await one(`select public.apply_membership_payment($1, $2, 70000) out`, [late.id, latePm.id]);
  const lateRefund = await one(`select status, amount_inr, user_id from public.refunds where order_id = $1`, [late.id]);
  check(
    lateOut.out.outcome === "refunded" && lateRefund && lateRefund.status === "pending" && lateRefund.amount_inr === 700 && lateRefund.user_id === b1,
    "16 ⚠ the third payer is REFUNDED under the lock rather than handed a third of two — ₹700 pending, filed against them",
    JSON.stringify({ out: lateOut.out, refund: lateRefund })
  );
  await asUser(b4);
  const whyFull = await one(`select public.why_no_membership($1) why`, [mem]);
  check(/all 2 of these have been taken/.test(whyFull.why ?? ""), "17 …and the next person is told all 2 have been taken", whyFull.why);

  /* ── 18-22 · A CLASS STARTS AHEAD ──────────────────────────────────────── */
  const mkClass = (startsAt, endsAt) =>
    one(
      `select (public.create_class_with_session($1, 'Hip-Hop · All levels', 'Hip-Hop', 'all', null, 0, 10, 'draft', $2, $3, null, null, null, null, null, null)).id id`,
      [biz, startsAt, endsAt]
    ).then((r) => r.id);
  await asUser(owner);
  const past = new Date(Date.now() - 3600e3);
  const refusedPast = await refusal(() => mkClass(past.toISOString(), new Date(past.getTime() + 3600e3).toISOString()));
  check(refusedPast && /already gone/.test(refusedPast), "18 ⚠ the owner cannot create a class in the past through the RPC — the form's own sentence", refusedPast || "IT WAS ALLOWED");
  const ahead = new Date(Date.now() + 5 * 24 * 3600e3);
  const cls = await mkClass(ahead.toISOString(), new Date(ahead.getTime() + 3600e3).toISOString());
  check(!!cls, "19 …and one ahead is created as before");
  /* the service role back-dates it — the seeder's, the proofs' and the shoots' own way */
  await asService();
  const moved = await refusal(() => q(`update public.class_sessions set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' where class_id = $1`, [cls]));
  check(moved === null, "20 the SERVICE ROLE still back-dates a session (that is how history is planted)", moved || "");
  await asUser(owner);
  const sess = await one(`select starts_at, ends_at from public.class_sessions where class_id = $1`, [cls]);
  const edit = (starts, ends, price) =>
    q(`select public.update_class_with_session($1, 'Hip-Hop · All levels', 'Hip-Hop', 'all', null, $4, 10, $2, $3, null, null, null, null, null, null, true, false)`, [cls, starts, ends, price]);
  /* ⚠ THE FORM'S OWN SHAPE: HH:MM, so the seconds are DROPPED on a re-save
     (measured 5–10 s on 30 Sep) — this is what the first dry run refused */
  const toMinute = (d) => { const x = new Date(d); x.setSeconds(0, 0); return x.toISOString(); };
  const editOk = await refusal(() => edit(toMinute(sess.starts_at), toMinute(sess.ends_at), 450));
  const priced = await one(`select price_inr from public.classes where id = $1`, [cls]);
  check(editOk === null && priced.price_inr === 450, "21 ⚠ a class that already RAN is still EDITABLE — a start unchanged TO THE MINUTE (the form drops the seconds) passes and the price moves", editOk || JSON.stringify(priced));
  const moveBack = await refusal(() => edit(new Date(Date.now() - 6 * 3600e3).toISOString(), new Date(Date.now() - 5 * 3600e3).toISOString(), 450));
  check(moveBack && /already gone/.test(moveBack), "22 …but MOVING its start to another past hour is refused", moveBack || "IT WAS ALLOWED");
  const moveAhead = await refusal(() => edit(new Date(Date.now() + 48 * 3600e3).toISOString(), new Date(Date.now() + 49 * 3600e3).toISOString(), 450));
  check(moveAhead === null, "23 …and moving it AHEAD is allowed", moveAhead || "");

  await asNobody();
};
