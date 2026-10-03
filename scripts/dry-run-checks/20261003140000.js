// Checks for 20261003140000_an_enquiry_runs_end_to_end, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js. Every step of the
// agreed spec is driven as the real roles.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const refused = async (sql, args, re) => {
    await q("savepoint sp");
    try {
      await q(sql, args);
      await q("release savepoint sp");
      return "ACCEPTED";
    } catch (e) {
      await q("rollback to savepoint sp");
      return re.test(e.message) ? true : e.message;
    }
  };
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const asService = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
    await q("set local role service_role");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const money = async (e) => (await q(`select public.enquiry_money($1) m`, [e]))[0].m;
  const status = async (e) => (await q(`select status from public.enquiries where id = $1`, [e]))[0].status;
  const told = async (uid, like) => (await q(`select count(*)::int n from public.notifications where user_id = $1 and title like $2 and deleted_at is null`, [uid, like]))[0].n;

  /* ── the catalog ── */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies 104 → 106, the two new tables' reads (${pol[0].n})`);
  const doors = ["respond_to_enquiry", "send_enquiry_quote", "send_enquiry_addition", "cancel_enquiry_addition", "answer_enquiry_quote", "mark_enquiry_complete", "decline_enquiry_completion", "end_enquiry", "answer_enquiry_ending", "retract_enquiry_ending", "enquiry_money", "create_enquiry_payment_order", "record_enquiry_payment"];
  const inner = ["can_work_enquiry", "enquiry_side", "enquiry_party_name", "tell_enquiry_other", "enquiry_base_quote", "enquiry_base_balance", "enquiry_lines_total", "enquiry_lines_write", "ist_today", "enquiry_close_loose_ends", "refund_enquiry_online", "enquiry_mark_paid", "apply_enquiry_payment"];
  for (const [list, auth] of [[doors, true], [inner, false]]) {
    for (const fn of list) {
      const r = await q(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [fn]);
      check(r.length === 1 && !r[0].a && r[0].u === auth, `${fn}: one function, anon no, authenticated ${auth ? "yes" : "no"} (${r.length})`);
    }
  }
  const gone = await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('close_enquiry','set_enquiry_status')`);
  check(gone.length === 0, "close_enquiry and set_enquiry_status are gone");
  const tg = await q(`select relname, relrowsecurity r from pg_class where relname in ('enquiry_quote_items','enquiry_endings')`);
  check(tg.length === 2 && tg.every((t) => t.r), "both new tables have RLS on");
  const grants = await q(`select table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('enquiry_quote_items','enquiry_endings') and grantee in ('anon','authenticated')`);
  check(grants.length === 2 && grants.every((g) => g.privilege_type === "SELECT"), `authenticated may only SELECT them, anon nothing (${grants.map((g) => g.table_name + ":" + g.privilege_type).join(",")})`);
  const legacy = await q(`select status, count(*)::int n from public.enquiries where status in ('in_talks','confirmed','advance_paid','paid') group by status`);
  check(legacy.length === 0, `no enquiry is left on a moved stage (${JSON.stringify(legacy)})`);
  const moved = await q(`select status, count(*)::int n from public.enquiries where deleted_at is null and status in ('accepted','ongoing') group by status order by status`);
  check(JSON.stringify(moved) === JSON.stringify([{ status: "accepted", n: 2 }, { status: "ongoing", n: 8 }]), `the in-flight ones moved: in_talks → accepted (2), confirmed/advance_paid → ongoing (8) (${JSON.stringify(moved)})`);

  /* ── the cast ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  const sender = (await q(`select p.id from public.profiles p where p.deleted_at is null and p.id <> $2
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null) limit 1`, [biz.id, biz.owner_id]))[0];
  const third = (await q(`select p.id from public.profiles p where p.deleted_at is null and p.id not in ($2,$3)
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null) limit 1`, [biz.id, biz.owner_id, sender.id]))[0];
  // a non-owner seat on the studio: a staff member, planted, to prove working an
  // enquiry is owners' and managers' — a FOURTH person, because `third` is the
  // stranger and a seat makes anybody a reader of the business's enquiries
  const fourth = (await q(`select p.id from public.profiles p where p.deleted_at is null and p.id not in ($2,$3,$4)
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null) limit 1`,
    [biz.id, biz.owner_id, sender.id, third ? third.id : sender.id]))[0];
  await asNobody();
  const staff = fourth
    ? (await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'staff', $3, $3)
                 on conflict (business_id, user_id) do update set member_role = 'staff', deleted_at = null returning user_id`, [biz.id, fourth.id, biz.owner_id]))[0]
    : null;
  const plant = async () => {
    await asNobody();
    return (await q(`insert into public.enquiries (business_id, from_user_id, type_key, fields, dates, message, status, created_by, updated_by)
      values ($1, $2, 'private', '[]', array[current_date + 7], 'Dry run enquiry', 'new', $2, $2) returning id`, [biz.id, sender.id]))[0].id;
  };

  /* ── 2 · accept or decline ── */
  const e1 = await plant();
  if (staff) {
    await as(staff.user_id);
    const s1 = await refused(`select public.respond_to_enquiry($1, true)`, [e1], /owners and managers/);
    check(s1 === true, `a staff seat cannot answer an enquiry (${s1})`);
  }
  await as(biz.owner_id);
  const d0 = await refused(`select public.respond_to_enquiry($1, false, '  ')`, [e1], /say why/);
  check(d0 === true, `declining needs a reason (${d0})`);
  await q(`select public.respond_to_enquiry($1, false, 'We are fully booked that week')`, [e1]);
  await asNobody();
  check((await status(e1)) === "declined", "declined with a reason");
  const cr = (await q(`select close_reason from public.enquiries where id = $1`, [e1]))[0].close_reason;
  check(cr === "We are fully booked that week", "the reason is on the row");
  check((await told(sender.id, "%declined your enquiry%")) >= 1, "the sender is told");
  await as(biz.owner_id);
  const d1 = await refused(`select public.respond_to_enquiry($1, true)`, [e1], /already been answered/);
  check(d1 === true, `a declined enquiry cannot be answered again (${d1})`);

  /* ── 3 · a quote from lines ── */
  const e2 = await plant();
  await as(biz.owner_id);
  await q(`select public.respond_to_enquiry($1, true)`, [e2]);
  await asNobody();
  check((await status(e2)) === "accepted" && (await told(sender.id, "%accepted your enquiry%")) >= 1, "accepted, and the sender is told");
  await as(biz.owner_id);
  const both = await refused(`select public.send_enquiry_quote($1, '[{"name":"Choreography","qty":1,"unit_inr":5000}]', 5000, 30)`, [e2], /not both/);
  check(both === true, `lines and a total together are refused (${both})`);
  const neg = await refused(`select public.send_enquiry_quote($1, '[{"name":"Discount","qty":1,"unit_inr":-100}]', null, 30)`, [e2], /reduction belongs on an addition/);
  check(neg === true, `a negative line on a quote is refused (${neg})`);
  const past = await refused(`select public.send_enquiry_quote($1, null, 5000, 30, current_date - 3)`, [e2], /passed/);
  check(past === true, `a quote valid until a past day is refused (${past})`);
  const q1 = (await q(`select to_jsonb(public.send_enquiry_quote($1, '[{"name":"Choreography","qty":1,"unit_inr":6000},{"name":"Rehearsal","qty":4,"unit_inr":1000}]', null, 30)) r`, [e2]))[0].r;
  check(q1.cost_inr === 10000 && q1.advance_inr === 3000 && q1.kind === "quote", `lines total ₹10,000, advance ₹3,000 (${q1.cost_inr}/${q1.advance_inr})`);
  await asNobody();
  const items = await q(`select sort, name, qty, unit_inr, line_inr from public.enquiry_quote_items where quote_id = $1 order by sort`, [q1.id]);
  check(items.length === 2 && items[1].line_inr === 4000 && items[0].sort === 1, `two lines stored in order (${items.map((i) => `${i.sort}:${i.name}=${i.line_inr}`).join(", ")})`);
  const vu = (await q(`select valid_until = (now() at time zone 'Asia/Kolkata')::date + 7 ok from public.enquiry_quotes where id = $1`, [q1.id]))[0].ok;
  check(vu, "valid for 7 days by default");
  check((await told(sender.id, "%sent a quote · ₹10000%")) >= 1, "the sender is told about the quote");

  /* ── 4 · revise with a reason, then the revised quote ── */
  await as(sender.id);
  const r0 = await refused(`select public.answer_enquiry_quote($1, 'revise')`, [q1.id], /say what should change/);
  check(r0 === true, `a revision needs a reason (${r0})`);
  await q(`select public.answer_enquiry_quote($1, 'revise', 'Can you drop the rehearsals to two?')`, [q1.id]);
  await asNobody();
  const r1 = (await q(`select q.status, q.answer_reason, e.status es from public.enquiry_quotes q join public.enquiries e on e.id = q.enquiry_id where q.id = $1`, [q1.id]))[0];
  check(r1.status === "declined" && r1.answer_reason && r1.es === "accepted", `revision asked, reason kept, enquiry back to Accepted (${r1.status}/${r1.es})`);
  await as(biz.owner_id);
  const q2 = (await q(`select to_jsonb(public.send_enquiry_quote($1, null, 8000, 50, current_date + 10)) r`, [e2]))[0].r;
  check(q2.n === 2 && q2.cost_inr === 8000 && q2.advance_inr === 4000, "the revised quote is #2, a total of ₹8,000");
  await asNobody();
  check((await told(sender.id, "%revised quote · ₹8000%")) >= 1, "the sender is told it is revised");
  const hist = await q(`select n, status from public.enquiry_quotes where enquiry_id = $1 order by n`, [e2]);
  check(hist.length === 2 && hist[0].status === "declined", "the history is kept");

  /* an expired quote cannot be accepted */
  await asNobody();
  await q(`update public.enquiry_quotes set valid_until = current_date - 1 where id = $1`, [q2.id]);
  await as(sender.id);
  const ex = await refused(`select public.answer_enquiry_quote($1, 'accept')`, [q2.id], /expired/);
  check(ex === true, `an expired quote cannot be accepted (${ex})`);
  await asNobody();
  await q(`update public.enquiry_quotes set valid_until = current_date + 10 where id = $1`, [q2.id]);

  /* ── accept → the project starts; money ── */
  if (third) {
    await as(third.id);
    const st = await refused(`select public.answer_enquiry_quote($1, 'accept')`, [q2.id], /only the person who was quoted/);
    check(st === true, `a stranger cannot accept it (${st})`);
  }
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [q2.id]);
  check((await status(e2)) === "ongoing", "accepting starts the project — Ongoing");
  let m = await money(e2);
  check(m.total_inr === 8000 && m.advance_due_inr === 4000 && m.paid_inr === 0 && m.balance_inr === 4000, `money: total 8000, advance due 4000, balance 4000 (${JSON.stringify(m)})`);
  if (third) {
    await as(third.id);
    const sm = await refused(`select public.enquiry_money($1)`, [e2], /not your enquiry/);
    check(sm === true, `a stranger cannot read the money (${sm})`);
  }
  await as(biz.owner_id);
  const q3 = await refused(`select public.send_enquiry_quote($1, null, 9000, 0)`, [e2], /send an addition/);
  check(q3 === true, `a new quote on a project that is on is refused (${q3})`);

  /* the advance online */
  await as(sender.id);
  const o1 = (await q(`select (o).id id, (o).amount_inr amt, (o).enquiry_part part from (select public.create_enquiry_payment_order($1) o) x`, [q2.id]))[0];
  check(o1.part === "advance" && o1.amt === 4000, `the first order is the advance (${o1.part} ₹${o1.amt})`);
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_e1' where id = $1`, [o1.id]);
  const c1 = (await q(`select public.apply_captured_payment('dos_dry_e1', 'dry_e_pay_1', 400000, 'upi') o`))[0].o;
  check(c1.outcome === "paid", `the advance lands (${JSON.stringify(c1)})`);
  await as(sender.id);
  m = await money(e2);
  check(m.paid_inr === 4000 && m.online_held_inr === 4000 && m.advance_due_inr === 0, `paid 4000, held online 4000 (${m.paid_inr}/${m.online_held_inr})`);

  /* ── 5 · additions: one added, one reduced, one declined and revised ── */
  await as(biz.owner_id);
  const a1 = (await q(`select to_jsonb(public.send_enquiry_addition($1, '[{"name":"Extra performer","qty":2,"unit_inr":1500}]', null, 'Two more dancers')) r`, [e2]))[0].r;
  check(a1.kind === "addition" && a1.cost_inr === 3000, "an addition of ₹3,000 from lines");
  await asNobody();
  check((await told(sender.id, "%asked to add ₹3000%")) >= 1, "the sender is told about the addition");
  await as(biz.owner_id);
  const big = await refused(`select public.send_enquiry_addition($1, null, -9000)`, [e2], /more than is left to pay/);
  check(big === true, `a reduction bigger than the balance is refused (${big})`);
  const a2 = (await q(`select to_jsonb(public.send_enquiry_addition($1, '[{"name":"Loyalty discount","qty":1,"unit_inr":-1000}]', null)) r`, [e2]))[0].r;
  check(a2.cost_inr === -1000, "a reduction of ₹1,000 as a negative line");
  // completion is blocked while additions wait
  await as(sender.id);
  const cw = await refused(`select public.mark_enquiry_complete($1)`, [e2], /waiting for an answer/);
  check(cw === true, `completion is refused while an addition waits (${cw})`);
  const dz = await refused(`select public.answer_enquiry_quote($1, 'decline')`, [a1.id], /say why/);
  check(dz === true, `declining an addition needs a reason (${dz})`);
  await q(`select public.answer_enquiry_quote($1, 'decline', 'One extra is enough')`, [a1.id]);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [a2.id]);
  m = await money(e2);
  check(m.balance_inr === 3000 && m.total_inr === 7000, `the reduction lowers the balance to 3000 and the total to 7000 (${m.balance_inr}/${m.total_inr})`);
  await as(biz.owner_id);
  const a3 = (await q(`select to_jsonb(public.send_enquiry_addition($1, null, 1500, 'One extra performer', $2)) r`, [e2, a1.id]))[0].r;
  check(a3.revises === a1.id, "a revised addition points at the declined one");
  const a3b = await refused(`select public.send_enquiry_addition($1, null, 1500, null, $2)`, [e2, a1.id], /already been revised/);
  check(a3b === true, `a declined addition is revised once (${a3b})`);
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [a3.id]);
  m = await money(e2);
  check(m.additions_due_inr === 1500 && m.total_inr === 8500, `the accepted addition is due now (${m.additions_due_inr}, total ${m.total_inr})`);

  /* the addition paid online, the balance recorded by hand */
  const o2 = (await q(`select (o).id id, (o).amount_inr amt, (o).enquiry_part part from (select public.create_enquiry_payment_order($1) o) x`, [a3.id]))[0];
  check(o2.part === "addition" && o2.amt === 1500, `an addition is its own order (${o2.part} ₹${o2.amt})`);
  const o3 = (await q(`select (o).amount_inr amt, (o).enquiry_part part from (select public.create_enquiry_payment_order($1) o) x`, [q2.id]))[0];
  check(o3.part === "balance" && o3.amt === 3000, `the balance order is priced after the reduction (${o3.part} ₹${o3.amt})`);
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_e2' where id = $1`, [o2.id]);
  const c2 = (await q(`select public.apply_captured_payment('dos_dry_e2', 'dry_e_pay_2', 150000, 'upi') o`))[0].o;
  check(c2.outcome === "paid", "the addition lands");
  if (staff) {
    await as(staff.user_id);
    const sr = await refused(`select public.record_enquiry_payment($1, 'balance')`, [q2.id], /owners and managers/);
    check(sr === true, `a staff seat cannot record money (${sr})`);
  }
  await as(biz.owner_id);
  await q(`select public.record_enquiry_payment($1, 'balance')`, [q2.id]);
  await asNobody();
  const bp = (await q(`select balance_paid_inr, full_paid_at is not null f from public.enquiry_quotes where id = $1`, [q2.id]))[0];
  check(bp.f && bp.balance_paid_inr === 3000, `the balance paid by hand is stamped at ₹3,000 (${bp.balance_paid_inr})`);
  check((await told(sender.id, "%recorded ₹3000 received%")) >= 1, "the payer is told the hand record");
  await as(sender.id);
  m = await money(e2);
  check(m.paid_inr === 8500 && m.outstanding_inr === 0 && m.ready_to_complete, `everything paid, ready to complete (${m.paid_inr}/${m.outstanding_inr})`);

  /* a stale balance order, captured after the hand record, is refunded */
  await asNobody();
  await q(`update public.orders set provider_order_id = 'dos_dry_stale' where enquiry_quote_id = $1 and enquiry_part = 'balance' and status = 'created'`, [q2.id]);
  await asService();
  const stale = (await q(`select public.apply_captured_payment('dos_dry_stale', 'dry_e_stale', 300000, 'upi') o`))[0].o;
  check(stale.outcome === "refund_pending", `a balance captured after it was settled is refunded (${stale.reason})`);

  /* ── 6 · completion takes both sides ── */
  await as(biz.owner_id);
  await q(`select public.mark_enquiry_complete($1)`, [e2]);
  check((await status(e2)) === "completing", "the business marks it — Completing");
  const again = await refused(`select public.mark_enquiry_complete($1)`, [e2], /waiting for them/);
  check(again === true, `the same side cannot confirm itself (${again})`);
  await as(sender.id);
  const nr = await refused(`select public.decline_enquiry_completion($1)`, [e2], /not finished/);
  check(nr === true, `saying not yet needs a reason (${nr})`);
  await q(`select public.decline_enquiry_completion($1, 'The final video is not delivered yet')`, [e2]);
  check((await status(e2)) === "ongoing", "not yet — back to Ongoing");
  await as(biz.owner_id);
  await q(`select public.mark_enquiry_complete($1)`, [e2]);
  await as(sender.id);
  await q(`select public.mark_enquiry_complete($1)`, [e2]);
  check((await status(e2)) === "completed", "both confirmed — Completed");
  await asNobody();
  check((await told(biz.owner_id, "%confirmed — the project is complete%")) >= 1, "the business is told");

  /* completion waits for money */
  const e3 = await plant();
  await as(biz.owner_id);
  const q31 = (await q(`select to_jsonb(public.send_enquiry_quote($1, null, 5000, 20)) r`, [e3]))[0].r;
  check(q31.n === 1, "a quote straight from New is allowed (it accepts the enquiry)");
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [q31.id]);
  const cm = await refused(`select public.mark_enquiry_complete($1)`, [e3], /balance is still due/);
  check(cm === true, `completion waits for the balance (${cm})`);

  /* ── 8 · ending: before money instant; after money, terms ── */
  const e4 = await plant();
  await as(biz.owner_id);
  await q(`select public.respond_to_enquiry($1, true)`, [e4]);
  await q(`select public.send_enquiry_quote($1, null, 4000, 0)`, [e4]);
  await as(sender.id);
  const wr = await refused(`select public.end_enquiry($1, '')`, [e4], /say why/);
  check(wr === true, `withdrawing needs a reason (${wr})`);
  const w1 = (await q(`select public.end_enquiry($1, 'Plans changed') r`, [e4]))[0].r;
  check(w1.closed && w1.outcome === "withdrawn", "before money the sender withdraws at once");
  await asNobody();
  const sup = await q(`select count(*)::int n from public.enquiry_quotes where enquiry_id = $1 and status = 'sent'`, [e4]);
  check(sup[0].n === 0, "the waiting quote cannot be accepted after");
  check((await told(biz.owner_id, "%withdrew the enquiry%")) >= 1, "the business is told");

  const e5 = await plant();
  await as(biz.owner_id);
  const cn = await refused(`select public.end_enquiry($1, 'No')`, [e5], /decline it instead/);
  check(cn === true, `the business declines a New enquiry rather than calling it off (${cn})`);

  // e3: accepted, advance ₹1,000 paid online, then ₹1,000 more by hand as an addition
  await as(sender.id);
  const o4 = (await q(`select (public.create_enquiry_payment_order($1)).id id`, [q31.id]))[0].id;
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_e3' where id = $1`, [o4]);
  await q(`select public.apply_captured_payment('dos_dry_e3', 'dry_e_pay_3', 100000, 'upi')`);
  await as(biz.owner_id);
  const a4 = (await q(`select to_jsonb(public.send_enquiry_addition($1, null, 1000)) r`, [e3]))[0].r;
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [a4.id]);
  await as(biz.owner_id);
  await q(`select public.record_enquiry_payment($1, 'addition')`, [a4.id]);
  await as(sender.id);
  m = await money(e3);
  check(m.paid_inr === 2000 && m.online_held_inr === 1000, `paid 2000, of it 1000 online (${m.paid_inr}/${m.online_held_inr})`);
  const over = await refused(`select public.end_enquiry($1, 'Moving city', 2500)`, [e3], /between ₹0 and the ₹2000/);
  check(over === true, `a refund over what was paid is refused (${over})`);
  const t1 = (await q(`select public.end_enquiry($1, 'Moving city', 2000) r`, [e3]))[0].r;
  check(!t1.closed && t1.ending_id, "after money the sender proposes terms");
  check((await status(e3)) === "ongoing", "the project stays open while terms are open");
  const t2 = await refused(`select public.end_enquiry($1, 'again', 0)`, [e3], /already proposed/);
  check(t2 === true, `one set of terms at a time (${t2})`);
  const self = await refused(`select public.answer_enquiry_ending($1, 'accept')`, [t1.ending_id], /waiting for them/);
  check(self === true, `the proposer cannot accept their own terms (${self})`);
  const pay = await refused(`select public.create_enquiry_payment_order($1)`, [q31.id], /ending is being agreed/);
  check(pay === true, `no new order while terms are open (${pay})`);
  await as(biz.owner_id);
  const t3 = (await q(`select public.answer_enquiry_ending($1, 'counter', 1500, 'We bought costumes already') r`, [t1.ending_id]))[0].r;
  check(t3.ending_id, "the business counters at ₹1,500");
  await as(sender.id);
  const rf = await refused(`select public.answer_enquiry_ending($1, 'refuse')`, [t3.ending_id], /say why/);
  check(rf === true, `refusing needs a reason (${rf})`);
  await q(`select public.answer_enquiry_ending($1, 'refuse', null, 'That is too little')`, [t3.ending_id]);
  check((await status(e3)) === "ongoing", "refused — the project stays open");
  // the business now calls it off with its own terms, and the sender accepts
  await as(biz.owner_id);
  const t4 = (await q(`select public.end_enquiry($1, 'We cannot make the date', 1800) r`, [e3]))[0].r;
  await as(sender.id);
  const acc = (await q(`select public.answer_enquiry_ending($1, 'accept') r`, [t4.ending_id]))[0].r;
  check(acc.closed && acc.outcome === "called_off" && acc.refund_online_inr === 1000 && acc.refund_hand_inr === 800, `accepted: called off, ₹1,000 back online and ₹800 by hand (${JSON.stringify(acc)})`);
  await asNobody();
  const rr = await q(`select r.amount_inr, r.status, r.user_id, r.created_by from public.refunds r join public.orders o on o.id = r.order_id where o.id = $1 and r.reason like 'Project called off%'`, [o4]);
  check(rr.length === 1 && rr[0].amount_inr === 1000 && rr[0].status === "pending" && rr[0].user_id === sender.id && rr[0].created_by === sender.id, `one pending refund of ₹1,000 against the PAYER (${JSON.stringify(rr)})`);
  check((await status(e3)) === "called_off", "the enquiry reads Called off");
  const chain = await q(`select status, side, refund_inr from public.enquiry_endings where enquiry_id = $1 order by created_at, refund_inr`, [e3]);
  check(chain.length === 3, `the terms' history is kept (${chain.map((x) => `${x.side}:${x.refund_inr}:${x.status}`).join(", ")})`);

  /* the proposer takes their terms back */
  const e6 = await plant();
  await as(biz.owner_id);
  const q61 = (await q(`select to_jsonb(public.send_enquiry_quote($1, null, 2000, 50)) r`, [e6]))[0].r;
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [q61.id]);
  await as(biz.owner_id);
  await q(`select public.record_enquiry_payment($1, 'advance')`, [q61.id]);
  const t6 = (await q(`select public.end_enquiry($1, 'Sorry', 0) r`, [e6]))[0].r;
  await q(`select public.retract_enquiry_ending($1)`, [t6.ending_id]);
  await asNobody();
  const rt = (await q(`select status from public.enquiry_endings where id = $1`, [t6.ending_id]))[0].status;
  check(rt === "retracted" && (await status(e6)) === "ongoing", "retracted — the project carries on");

  /* a 100% advance settles the quote */
  const e7 = await plant();
  await as(biz.owner_id);
  const q71 = (await q(`select to_jsonb(public.send_enquiry_quote($1, null, 3000, 100)) r`, [e7]))[0].r;
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, 'accept')`, [q71.id]);
  await as(biz.owner_id);
  await q(`select public.record_enquiry_payment($1, 'advance')`, [q71.id]);
  await asNobody();
  const f7 = (await q(`select full_paid_at is not null f, balance_paid_inr b from public.enquiry_quotes where id = $1`, [q71.id]))[0];
  check(f7.f && f7.b === 0, "a 100% advance is paid in full");
  await as(biz.owner_id);
  const red = await refused(`select public.send_enquiry_addition($1, null, -500)`, [e7], /already paid in full/);
  check(red === true, `no reduction once paid in full (${red})`);
  await asNobody();
};
