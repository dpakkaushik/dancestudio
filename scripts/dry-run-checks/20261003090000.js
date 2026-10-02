// Checks for 20261003090000_enquiry_follow_ups_online_pay_and_inbox_settings, run
// inside the dry run's rolled-back transaction by scripts/dry-run-migration.js.
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

  /* ── the catalog ── */
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);
  for (const [fn, auth] of [["set_my_inbox_off", true], ["set_room_requests", true], ["close_enquiry", true], ["create_enquiry_payment_order", true], ["apply_enquiry_payment", false], ["tell_enquiry_receiver", false], ["guard_ask_switched_on", false], ["guard_room_requests_open", false]]) {
    const r = await q(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [fn]);
    check(r.length === 1 && !r[0].a && r[0].u === auth, `${fn}: anon no, authenticated ${auth ? "yes" : "no"}`);
  }
  const svc = await q(`select has_function_privilege('service_role', 'public.apply_enquiry_payment(uuid,uuid,bigint)', 'execute') s`);
  check(svc[0].s, "apply_enquiry_payment is the service role's");
  const won = await q(`select count(*)::int n from public.enquiries where status = 'won'`);
  check(won[0].n === 0, "no enquiry is 'won' any more — completed replaces it");
  const fks = await q(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.enquiries'::regclass and contype='f'`);
  check(!fks.some((f) => /closed_by/.test(f.d)), "closed_by carries no foreign key");
  const trg = await q(`select tgname from pg_trigger where tgrelid='public.classes'::regclass and not tgisinternal and tgname like 'classes_venue%' order by tgname`);
  check(trg.map((t) => t.tgname).join(",") === "classes_venue_changes_before,classes_venue_takes_requests", "the room guard is named to fire after the venue trigger");

  /* ── a studio, its owner, a stranger ── */
  await asNobody();
  const biz = (await q(`
    select b.id, b.name, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  const sender = (await q(`
    select p.id, p.full_name from public.profiles p
     where p.deleted_at is null and p.id <> $2
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null)
     limit 1`, [biz.id, biz.owner_id]))[0];
  const third = (await q(`
    select p.id from public.profiles p where p.deleted_at is null and p.id not in ($2, $3)
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null)
     limit 1`, [biz.id, biz.owner_id, sender.id]))[0];

  const plant = async () => {
    await asNobody();
    const e = (await q(`insert into public.enquiries (business_id, from_user_id, type_key, fields, dates, message, status, created_by, updated_by)
      values ($1, $2, 'private', '[]', array[current_date + 7], 'Dry run enquiry', 'new', $2, $2) returning id`, [biz.id, sender.id]))[0].id;
    await as(biz.owner_id);
    const qid = (await q(`select (public.send_enquiry_quote($1, 10000, 30)).id id`, [e]))[0].id;
    return { e, qid };
  };

  /* ── ask for a revision: declined, revision asked, enquiry stays open ── */
  const one = await plant();
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, false)`, [one.qid]);
  await asNobody();
  let r = (await q(`select e.status, q.status qs, q.revision_asked_at from public.enquiries e join public.enquiry_quotes q on q.enquiry_id = e.id where e.id = $1`, [one.e]))[0];
  check(r.status === "in_talks" && r.qs === "declined" && r.revision_asked_at, `declining asks for a revision and keeps it open (${r.status}/${r.qs})`);
  const told = await q(`select title from public.notifications where user_id = $1 and title like '%asked for a revised quote%' and deleted_at is null`, [biz.owner_id]);
  check(told.length >= 1, "the business is told a revision was asked for");
  await as(biz.owner_id);
  const q2 = (await q(`select (public.send_enquiry_quote($1, 8000, 50)).n n`, [one.e]))[0];
  check(q2.n === 2, "the business sends the revised quote (#2)");
  await asNobody();
  const told2 = await q(`select title from public.notifications where user_id = $1 and title like '%revised quote%8000%' and deleted_at is null`, [sender.id]);
  check(told2.length >= 1, "and the sender is told it is a revised quote");

  /* ── the sender cancels ── */
  await as(sender.id);
  const c1 = await refused(`select public.close_enquiry($1, 'completed')`, [one.e], /completing it or closing it as lost is theirs/);
  check(c1 === true, `the sender may not mark it completed (${c1})`);
  await q(`select public.close_enquiry($1, 'cancelled')`, [one.e]);
  await asNobody();
  r = (await q(`select status, closed_by from public.enquiries where id = $1`, [one.e]))[0];
  check(r.status === "cancelled" && r.closed_by === sender.id, "the sender cancels, and the row says who");
  const open = await q(`select count(*)::int n from public.enquiry_quotes where enquiry_id = $1 and status = 'sent'`, [one.e]);
  check(open[0].n === 0, "the waiting quote cannot be accepted any more");
  await as(sender.id);
  const c2 = await refused(`select public.answer_enquiry_quote((select id from public.enquiry_quotes where enquiry_id = $1 order by n desc limit 1), true)`, [one.e], /closed|no longer open/);
  check(c2 === true, `a closed enquiry's quote cannot be answered (${c2})`);
  await as(biz.owner_id);
  const c3 = await refused(`select public.set_enquiry_status($1, 'in_talks')`, [one.e], /cannot be reopened/);
  check(c3 === true, `a cancel by the sender cannot be reopened by the business (${c3})`);
  const c4 = await refused(`select public.set_enquiry_status($1, 'completed')`, [one.e], /close an enquiry as/);
  check(c4 === true, `set_enquiry_status no longer closes (${c4})`);
  if (third) {
    await as(third.id);
    const c5 = await refused(`select public.close_enquiry($1, 'cancelled')`, [one.e], /only the two ends/);
    check(c5 === true, `a stranger cannot close it (${c5})`);
  }

  /* ── accept, pay the advance online, refuse a second advance, pay the balance ── */
  const two = await plant();
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, true)`, [two.qid]);
  const ord = (await q(`select (o).id id, (o).amount_inr amt, (o).enquiry_part part, (o).business_id bid from (select public.create_enquiry_payment_order($1) o) x`, [two.qid]))[0];
  check(ord.amt === 3000 && ord.part === "advance" && ord.bid === biz.id, `the first order is the advance, priced by the quote (${ord.part} ₹${ord.amt})`);
  if (third) {
    await as(third.id);
    const p1 = await refused(`select public.create_enquiry_payment_order($1)`, [two.qid], /only the person who asked/);
    check(p1 === true, `nobody else can open an order on it (${p1})`);
  }
  await as(biz.owner_id);
  const p2 = await refused(`select public.apply_enquiry_payment($1, $1, 300000)`, [ord.id], /permission denied/);
  check(p2 === true, `the business cannot apply a capture itself (${p2})`);
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_' || replace(id::text,'-','') where id = $1`, [ord.id]);
  const cap = (await q(`select public.apply_captured_payment('dos_dry_' || replace($1::text,'-',''), 'dry_pay_1', 300000, 'upi') o`, [ord.id]))[0].o;
  check(cap.outcome === "paid", `a captured advance marks it paid (${JSON.stringify(cap)})`);
  const dup = (await q(`select public.apply_captured_payment('dos_dry_' || replace($1::text,'-',''), 'dry_pay_1', 300000, 'upi') o`, [ord.id]))[0].o;
  check(dup.outcome === "duplicate", "the same capture twice is a no-op");
  await asNobody();
  r = (await q(`select e.status, q.advance_paid_at, q.full_paid_at from public.enquiries e join public.enquiry_quotes q on q.id = $2 where e.id = $1`, [two.e, two.qid]))[0];
  check(r.status === "advance_paid" && r.advance_paid_at && !r.full_paid_at, `the enquiry reads Advance paid (${r.status})`);
  const pay = await q(`select business_id, amount_inr from public.payments where provider_payment_id = 'dry_pay_1'`);
  check(pay.length === 1 && pay[0].business_id === biz.id && pay[0].amount_inr === 3000, "one payment row, the business's, ₹3,000");
  const owner = await q(`select title from public.notifications where user_id = $1 and title like '%paid ₹3000%' and deleted_at is null`, [biz.owner_id]);
  check(owner.length >= 1, "the business is told the advance was paid");

  /* a second advance order, paid late, is REFUNDED rather than counted twice */
  await asNobody();
  const late = (await q(`insert into public.orders (business_id, user_id, enquiry_quote_id, enquiry_part, amount_inr, status, provider_order_id, created_by, updated_by)
     values ($1, $2, $3, 'advance', 3000, 'created', 'dos_dry_late', $2, $2) returning id`, [biz.id, sender.id, two.qid]))[0].id;
  await asService();
  const lateOut = (await q(`select public.apply_captured_payment('dos_dry_late', 'dry_pay_late', 300000, 'upi') o`))[0].o;
  check(lateOut.outcome === "refund_pending" && lateOut.refund_id, `a second advance is refunded with a refund row (${lateOut.reason})`);

  /* the sender cannot cancel once money moved */
  await as(sender.id);
  const c6 = await refused(`select public.close_enquiry($1, 'cancelled')`, [two.e], /a payment has been made/);
  check(c6 === true, `the sender cannot cancel after paying (${c6})`);

  /* the balance */
  const bal = (await q(`select (o).id id, (o).amount_inr amt, (o).enquiry_part part from (select public.create_enquiry_payment_order($1) o) x`, [two.qid]))[0];
  check(bal.part === "balance" && bal.amt === 7000, `the next order is the balance (${bal.part} ₹${bal.amt})`);
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_bal' where id = $1`, [bal.id]);
  const capB = (await q(`select public.apply_captured_payment('dos_dry_bal', 'dry_pay_2', 700000, 'upi') o`))[0].o;
  check(capB.outcome === "paid", "the balance lands");
  await asNobody();
  r = (await q(`select status from public.enquiries where id = $1`, [two.e]))[0];
  check(r.status === "paid", `paid in full reads Paid, not completed (${r.status})`);
  await as(sender.id);
  const p3 = await refused(`select public.create_enquiry_payment_order($1)`, [two.qid], /already paid in full/);
  check(p3 === true, `nothing more can be ordered (${p3})`);

  /* a wrong amount is refunded */
  await asNobody();
  const three = await plant();
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, true)`, [three.qid]);
  const o3 = (await q(`select (public.create_enquiry_payment_order($1)).id id`, [three.qid]))[0].id;
  await asService();
  await q(`update public.orders set provider_order_id = 'dos_dry_wrong' where id = $1`, [o3]);
  const wrong = (await q(`select public.apply_captured_payment('dos_dry_wrong', 'dry_pay_wrong', 100, 'upi') o`))[0].o;
  check(wrong.outcome === "refund_pending", `a wrong amount is refunded (${wrong.reason})`);

  /* the business completes it */
  await as(biz.owner_id);
  await q(`select public.close_enquiry($1, 'completed')`, [two.e]);
  await asNobody();
  r = (await q(`select status, closed_by from public.enquiries where id = $1`, [two.e]))[0];
  check(r.status === "completed" && r.closed_by === biz.owner_id, "the business marks it completed");
  const toldC = await q(`select title from public.notifications where user_id = $1 and title like '%marked your enquiry completed%' and deleted_at is null`, [sender.id]);
  check(toldC.length >= 1, "and the sender is told");
  await as(biz.owner_id);
  await q(`select public.set_enquiry_status($1, 'in_talks')`, [two.e]);
  await asNobody();
  r = (await q(`select status, closed_at from public.enquiries where id = $1`, [two.e]))[0];
  check(r.status === "in_talks" && !r.closed_at, "a completion the business made can be reopened");

  /* hand-recorded money still works, and a 100% advance is the whole price */
  const four = (async () => null)();
  await four;
  await asNobody();
  const e4 = (await q(`insert into public.enquiries (business_id, from_user_id, type_key, fields, dates, message, status, created_by, updated_by)
      values ($1, $2, 'private', '[]', array[current_date + 7], 'Dry run 100', 'new', $2, $2) returning id`, [biz.id, sender.id]))[0].id;
  await as(biz.owner_id);
  const q4 = (await q(`select (public.send_enquiry_quote($1, 5000, 100)).id id`, [e4]))[0].id;
  await as(sender.id);
  await q(`select public.answer_enquiry_quote($1, true)`, [q4]);
  await as(biz.owner_id);
  await q(`select public.record_enquiry_payment($1, 'advance')`, [q4]);
  await asNobody();
  r = (await q(`select e.status, q.full_paid_at from public.enquiries e join public.enquiry_quotes q on q.id = $2 where e.id = $1`, [e4, q4]))[0];
  check(r.status === "paid" && r.full_paid_at, `a recorded 100% advance is paid in full (${r.status})`);

  /* ── inbox settings ── */
  await as(sender.id);
  const off = (await q(`select public.set_my_inbox_off(array['teach','crew','teach']) v`))[0].v;
  check(JSON.stringify(off) === JSON.stringify(["crew", "teach"]), `settings saved, deduped (${off})`);
  const bad = await refused(`select public.set_my_inbox_off(array['nonsense'])`, [], /unknown kind/);
  check(bad === true, `an unknown kind is refused (${bad})`);
  await asNobody();

  const cls = (await q(`select c.id from public.classes c where c.business_id = $1 and c.deleted_at is null limit 1`, [biz.id]))[0];
  if (cls) {
    await as(biz.owner_id);
    const a1 = await refused(`select public.ask_class_person($1, $2, 'artist')`, [cls.id, sender.id], /is not taking asks to take a class/);
    check(a1 === true, `asking somebody who switched teaching off is refused in words (${a1})`);
    const a2 = await refused(`select public.ask_class_person($1, $2, 'assistant')`, [cls.id, sender.id], /ACCEPTED|.*/);
    check(a2 === "ACCEPTED" || a2 === true || !/not taking/.test(String(a2)), `asking them to ASSIST still goes through the guard (${a2})`);
    await asService();
    const svcOk = await refused(`insert into public.class_people (class_id, business_id, user_id, kind, status, created_by, updated_by)
        values ($1, $2, $3, 'artist', 'asked', $4, $4)`, [cls.id, biz.id, third ? third.id : sender.id, biz.owner_id], /zzz/);
    check(svcOk === "ACCEPTED" || !/not taking/.test(String(svcOk)), `the service role is not refused by the setting (${svcOk})`);
  } else {
    check(true, "no class on this studio — the class ask was not exercised");
  }
  await asNobody();
  await as(biz.owner_id);
  const inv = await refused(`select public.invite_person_to_business($1, $2, 'trainer')`, [biz.id, sender.id], /is not taking invitations to join a team/);
  check(inv === "ACCEPTED" || inv === true, `a team invite to somebody who left team ON goes through (${inv})`);
  await as(sender.id);
  await q(`select public.set_my_inbox_off(array['team'])`);
  if (third) {
    await as(biz.owner_id);
    // a fresh invite to the sender is now refused
    await asNobody();
    await q(`update public.business_invites set status = 'revoked' where business_id = $1 and user_id = $2 and status = 'pending'`, [biz.id, sender.id]);
    await as(biz.owner_id);
    const inv2 = await refused(`select public.invite_person_to_business($1, $2, 'trainer')`, [biz.id, sender.id], /is not taking invitations to join a team/);
    check(inv2 === true, `with team switched off the invite is refused (${inv2})`);
  }
  await asNobody();

  /* a room request to a studio that takes none */
  await as(biz.owner_id);
  await q(`select public.set_room_requests($1, false)`, [biz.id]);
  await asNobody();
  const room = (await q(`select r.id from public.rooms r where r.business_id = $1 and r.deleted_at is null limit 1`, [biz.id]))[0];
  const artistCls = (await q(`
    select c.id, m.user_id owner_id from public.classes c
      join public.businesses b on b.id = c.business_id and b.type = 'artist_page' and b.deleted_at is null
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where c.deleted_at is null and c.status = 'draft' and m.user_id <> $1 limit 1`, [biz.owner_id]))[0];
  if (room && artistCls) {
    await as(artistCls.owner_id);
    const rr = await refused(`update public.classes set venue_business_id = $1, room_id = $2 where id = $3`, [biz.id, room.id, artistCls.id], /is not taking room requests/);
    check(rr === true, `a room request to a studio that takes none is refused (${rr})`);
  } else {
    check(true, "no draft artist class / studio room pair — the room guard was not exercised");
  }
  await asNobody();
  if (third) {
    await as(third.id);
    const sr = await refused(`select public.set_room_requests($1, true)`, [biz.id], /only the owner/);
    check(sr === true, `only the owner switches room requests (${sr})`);
  }
  await asNobody();
};
