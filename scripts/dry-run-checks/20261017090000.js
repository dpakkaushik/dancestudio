// Checks for 20261017090000_classes_made_final, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (sub, role = "authenticated") => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
    if (role === "authenticated") await q("set local role authenticated");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const refused = async (sql, args, fragment) => {
    await q("savepoint t");
    try {
      await q(sql, args);
      await q("release savepoint t");
      return "went through";
    } catch (e) {
      await q("rollback to savepoint t");
      return fragment === null || e.message.includes(fragment) ? true : e.message;
    }
  };
  const allowed = async (sql, args) => {
    await q("savepoint t");
    try {
      const r = await c.query(sql, args);
      await q("release savepoint t");
      return r.rowCount;
    } catch (e) {
      await q("rollback to savepoint t");
      return e.message;
    }
  };
  const uuid = async () => (await q("select gen_random_uuid() u"))[0].u;
  const ts = (h) => new Date(Date.now() + h * 3600e3).toISOString();
  const notes = async (user, like) => {
    await asNobody();
    const r = await q(`select count(*)::int n from public.notifications where user_id = $1 and title ilike $2 and deleted_at is null`, [user, like]);
    return r[0].n;
  };
  const notesWhere = async (user, extra, args = []) => {
    await asNobody();
    const r = await q(`select count(*)::int n from public.notifications where user_id = $1 and deleted_at is null and ${extra}`, [user, ...args]);
    return r[0].n;
  };

  /* ── the world ── */
  await asNobody();
  const ids = {};
  for (const n of ["owner", "manager", "teacher", "teacher2", "assistant", "learner", "learner2", "learner3", "stranger"]) {
    const id = await uuid();
    ids[n] = id;
    await q(`insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now())`,
      [id, `dry.${n}.${id.slice(0, 6)}@example.com`]);
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, `Dry ${n}`]);
  }
  const { owner, manager, teacher, teacher2, assistant, learner, learner2, learner3, stranger } = ids;
  await as(owner, "service_role");
  const [{ id: studio }] = await q(`insert into public.businesses (name, type, city, visibility, created_by, updated_by) values ('Dry Final Studio', 'studio', 'Pune', 'listed', $1, $1) returning id`, [owner]);
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2), ($1, $3, 'manager', $2, $2), ($1, $4, 'assistant', $2, $2)`, [studio, owner, manager, assistant]);
  const room = {};
  for (const name of ["Hall", "Hall B", "Studio C"]) {
    const [{ id }] = await q(`insert into public.rooms (business_id, name, capacity, created_by, updated_by) values ($1, $2, 20, $3, $3) returning id`, [studio, name, owner]);
    room[name] = id;
  }
  // the teacher is an artist with a page of their own
  await q(`insert into public.subscriptions (kind, user_id, plan_key, price_inr, period, status, current_period_start, current_period_end, granted, created_by, updated_by)
           values ('artist', $1, 'artist_monthly', 0, 'monthly', 'active', now(), now() + interval '30 days', true, $1, $1)`, [teacher]);
  const [{ id: page }] = await q(`insert into public.businesses (name, type, city, visibility, created_by, updated_by) values ('Dry Teacher Page', 'artist_page', 'Pune', 'listed', $1, $1) returning id`, [teacher]);
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2)`, [page, teacher]);

  const mk = async (title, h, price, roomName) => {
    await as(manager);
    const r = await allowed(`select public.create_class_with_session($1, $2, 'Hip-Hop', 'all', $3, $4, 10, 'draft', $5, $6, $7)`,
      [studio, title, roomName, price, ts(h), ts(h + 1), room[roomName]]);
    if (r !== 1) throw new Error(`could not make ${title}: ${r}`);
    const [row] = await q(`select c.id, c.share_slug, s.id sid from public.classes c join public.class_sessions s on s.class_id = c.id where c.business_id = $1 and c.title = $2`, [studio, title]);
    return row;
  };
  const askYes = async (cls, who, kind = "artist", asker = manager) => {
    await as(asker);
    await q(`select public.ask_class_person($1, $2, $3)`, [cls.id, who, kind]);
    await asNobody();
    const [row] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [cls.id, who]);
    await as(who);
    await q(`select public.respond_to_class_ask($1, true)`, [row.id]);
    return row.id;
  };
  const publish = async (cls, by = manager) => {
    await as(by);
    return allowed(`update public.classes set status = 'published' where id = $1`, [cls.id]);
  };
  const moveTo = async (cls, startMin, lenMin = 60) => {
    await as(owner, "service_role");
    await q(`update public.class_sessions set starts_at = now() + make_interval(mins => $2), ends_at = now() + make_interval(mins => $3) where class_id = $1`, [cls.id, startMin, startMin + lenMin]);
  };

  /* ── class A: a teacher, an assistant, the answers and the publish ── */
  const A = await mk("Dry A · All levels", 48, 0, "Hall");
  await as(manager);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [A.id, teacher]);
  await q(`select public.ask_class_person($1, $2, 'assistant')`, [A.id, assistant]);
  await asNobody();
  const askNote = await notesWhere(teacher, `href = '/my-classes?tab=todo' and body ilike '%in Classes%'`);
  check(askNote >= 1, `an ask points at Classes, not the Inbox (${askNote})`);
  const [tA] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [A.id, teacher]);
  const [aA] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [A.id, assistant]);
  await as(teacher);
  await q(`select public.respond_to_class_ask($1, true)`, [tA.id]);
  await as(assistant);
  await q(`select public.respond_to_class_ask($1, true)`, [aA.id]);
  check((await notes(owner, "%confirmed Dry A%")) >= 1 && (await notes(manager, "%confirmed Dry A%")) >= 1,
    `B14: an answer reaches the owner AND the manager who asked`);

  // B5: the owner hands the assistant attendance; a manager's re-ask keeps it
  await as(owner);
  await q(`select public.set_class_person_powers($1, true, false)`, [aA.id]);
  await as(manager);
  const reask = await allowed(`select public.ask_class_person($1, $2, 'assistant')`, [A.id, assistant]);
  check(reask === 1, `a manager re-asks the assistant (${reask})`);
  await asNobody();
  const [aA2] = await q(`select id, can_attendance, status from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [A.id, assistant]);
  check(aA2.can_attendance === true, `⚠ B5: the re-ask keeps the assistant's attendance power (${aA2.can_attendance})`);
  if (aA2.status === "asked") { await as(assistant); await q(`select public.respond_to_class_ask($1, true)`, [aA2.id]); }

  const pubA = await publish(A);
  check(pubA === 1, `a manager publishes A (${pubA})`);
  check((await notes(teacher, "%Dry A%is published%")) === 1 && (await notes(assistant, "%Dry A%is published%")) === 1,
    `B14: the publish tells the teacher and the assistant`);
  check((await notes(manager, "%Dry A%is published%")) === 0, `…and not the manager who pressed it`);

  // B4
  await as(manager);
  const back = await refused(`update public.classes set status = 'draft' where id = $1`, [A.id], "A published class stays published");
  check(back === true, `⚠ B4: published → draft is refused (${back})`);

  // D10: a self-made booking tells the runners and the teacher
  const before = { o: await notesWhere(owner, `kind = 'booking'`), m: await notesWhere(manager, `kind = 'booking'`), t: await notesWhere(teacher, `kind = 'booking'`) };
  await as(learner);
  const bookA = await allowed(`select public.book_class_session($1)`, [A.sid]);
  check(bookA === 1, `the learner books A (${bookA})`);
  const after = { o: await notesWhere(owner, `kind = 'booking'`), m: await notesWhere(manager, `kind = 'booking'`), t: await notesWhere(teacher, `kind = 'booking'`) };
  check(after.o === before.o + 1 && after.m === before.m + 1 && after.t === before.t + 1,
    `⚠ D10: the booking reaches the owner, the manager AND the teacher (${after.o - before.o}/${after.m - before.m}/${after.t - before.t})`);

  // D8: an overlapping booking is refused
  const O = await mk("Dry Overlap · All levels", 48, 0, "Hall B");
  await askYes(O, teacher);
  await publish(O);
  await as(learner);
  const over = await refused(`select public.book_class_session($1)`, [O.sid], "You're booked into Dry A");
  check(over === true, `⚠ D8: an overlapping booking is refused in words (${over})`);

  // D4: a published class keeps its teacher
  await as(manager);
  const second = await refused(`select public.ask_class_person($1, $2, 'artist')`, [A.id, stranger], "already has its teacher");
  check(second === true, `D4: a published class with a teacher takes no second teacher (${second})`);

  /* ── D4: the teacher steps down, booking pauses, a new teacher's yes resumes it ── */
  const [tLive] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [A.id, teacher]);
  await as(teacher);
  const down = await allowed(`select public.step_down_from_class($1, 'Injured')`, [tLive.id]);
  check(down === 1, `⚠ D4: the teacher steps down (${down})`);
  check((await notes(owner, "%stepped down from Dry A%")) === 1 && (await notes(manager, "%stepped down from Dry A%")) === 1,
    `D4: the owner and the manager are told`);
  check((await notes(learner, "Dry A%waiting for a new teacher%")) === 1, `D4: the person booked is told`);
  await asNobody();
  const waits = await q(`select public.class_waits_for_teacher($1) w`, [A.id]);
  check(waits[0].w === true, `class_waits_for_teacher (${waits[0].w})`);
  await as(learner2);
  const paused = await refused(`select public.book_class_session($1)`, [A.sid], "waiting for a new teacher");
  check(paused === true, `⚠ D4: booking is paused (${paused})`);
  await as(manager);
  const st = await q(`select why from public.classes_publish_state($1) where class_id = $2`, [studio, A.id]);
  check(st[0]?.why === "This class is waiting for a new teacher", `the register says so (${st[0]?.why})`);
  const newT = await allowed(`select public.ask_class_person($1, $2, 'artist')`, [A.id, teacher2]);
  check(newT === 1, `D4: a new teacher can be asked now (${newT})`);
  await asNobody();
  const [t2A] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [A.id, teacher2]);
  await as(teacher2);
  await q(`select public.respond_to_class_ask($1, true)`, [t2A.id]);
  check((await notes(learner, "Dry A%has a teacher again%")) === 1, `D4: the people booked hear the new teacher`);
  await as(learner2);
  const resumed = await allowed(`select public.book_class_session($1)`, [A.sid]);
  check(resumed === 1, `⚠ D4: the new teacher's yes resumes booking (${resumed})`);

  /* ── B3: a declined teacher is visible ── */
  const B = await mk("Dry B · All levels", 120, 0, "Hall");
  await as(manager);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [B.id, stranger]);
  await asNobody();
  const [sB] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [B.id, stranger]);
  await as(stranger);
  await q(`select public.respond_to_class_ask($1, false)`, [sB.id]);
  await as(manager);
  const stB = await q(`select teacher_status, teacher_user_id from public.classes_publish_state($1) where class_id = $2`, [studio, B.id]);
  check(stB[0]?.teacher_status === "rejected" && stB[0]?.teacher_user_id === stranger, `⚠ B3: the teacher's no shows on the register (${stB[0]?.teacher_status})`);

  /* ── B14: a withdrawal tells the person asked ── */
  await as(manager);
  await q(`select public.ask_class_person($1, $2, 'artist')`, [B.id, learner3]);
  await asNobody();
  const [wB] = await q(`select id from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [B.id, learner3]);
  await as(manager);
  await q(`select public.withdraw_class_ask($1)`, [wB.id]);
  check((await notes(learner3, "%Dry B%withdrawn%")) === 1, `B14: a withdrawal tells the person asked`);

  /* ── B12: an ask on a class that has started ── */
  const S = await mk("Dry Started · All levels", 30, 0, "Hall");
  await moveTo(S, -10);
  await as(manager);
  const started = await refused(`select public.ask_class_person($1, $2, 'artist')`, [S.id, teacher2], "This class has started");
  check(started === true, `⚠ B12: an ask on a started class is refused (${started})`);

  /* ── B2: a call-off tells a FREE seat holder ── */
  const F = await mk("Dry Free CallOff · All levels", 80, 0, "Hall B");
  await askYes(F, teacher);
  await publish(F);
  await as(learner);
  await q(`select public.book_class_session($1)`, [F.sid]);
  await as(owner);
  const co = await allowed(`select public.cancel_class_bookings_for_class($1, 'Studio closed')`, [F.id]);
  check(co === 1, `the owner calls F off (${co})`);
  check((await notes(learner, "Dry Free CallOff%was called off%")) === 1, `⚠ B2: the free seat holder is told`);

  /* ── B1: a late capture on a deleted or a started class is refunded ── */
  const P1 = await mk("Dry Paid Deleted · All levels", 90, 300, "Hall B");
  await askYes(P1, teacher);
  await publish(P1);
  await as(owner, "service_role");
  await q(`insert into public.orders (business_id, user_id, class_id, session_id, amount_inr, status, provider_order_id, created_by, updated_by) values ($1, $2, $3, $4, 300, 'created', 'dry_po_del', $2, $2)`, [studio, learner2, P1.id, P1.sid]);
  await q(`update public.classes set deleted_at = now() where id = $1`, [P1.id]);
  const cap1 = await q(`select public.apply_captured_payment('dry_po_del', 'dry_pay_del', 30000, 'upi') r`);
  check(cap1[0].r.outcome === "refund_pending", `⚠ B1: money on a DELETED class is refunded, not seated (${JSON.stringify(cap1[0].r)})`);
  const P2 = await mk("Dry Paid Started · All levels", 92, 300, "Hall B");
  await askYes(P2, teacher);
  await publish(P2);
  await as(owner, "service_role");
  await q(`insert into public.orders (business_id, user_id, class_id, session_id, amount_inr, status, provider_order_id, created_by, updated_by) values ($1, $2, $3, $4, 300, 'created', 'dry_po_start', $2, $2)`, [studio, learner2, P2.id, P2.sid]);
  await moveTo(P2, -15);
  await as(owner, "service_role");
  const cap2 = await q(`select public.apply_captured_payment('dry_po_start', 'dry_pay_start', 30000, 'upi') r`);
  check(cap2[0].r.outcome === "refund_pending", `⚠ B1: money on a STARTED class is refunded (${cap2[0].r.outcome})`);
  await asNobody();
  const seats = await q(`select count(*)::int n from public.class_bookings where class_id = any($1) and status = 'enrolled' and deleted_at is null`, [[P1.id, P2.id]]);
  const refs = await q(`select count(*)::int n from public.refunds r join public.orders o on o.id = r.order_id where o.provider_order_id in ('dry_po_del', 'dry_po_start') and r.status = 'pending'`);
  check(seats[0].n === 0 && refs[0].n === 2, `…no seat made, two refunds filed (${seats[0].n} seats, ${refs[0].n} refunds)`);

  /* ── B8 / D6: passes ── */
  await as(owner, "service_role");
  const [{ id: mem }] = await q(`insert into public.memberships (business_id, name, unit, units, price_inr, total_count, created_by, updated_by) values ($1, 'Dry Pass', 'hours', 10, 1000, 10, $2, $2) returning id`, [studio, owner]);
  const [{ id: pass }] = await q(`insert into public.membership_passes (membership_id, business_id, user_id, price_inr, unit, units_total, status, bought_at, created_by, updated_by) values ($1, $2, $3, 1000, 'hours', 10, 'active', now(), $3, $3) returning id`, [mem, studio, learner3]);
  await as(learner3);
  const offered = await q(`select count(*)::int n from public.passes_for_session($1)`, [A.sid]);
  check(offered[0].n === 0, `B8: no pass is offered for a free class (${offered[0].n})`);
  const free = await refused(`select public.book_with_membership($1, $2)`, [A.sid, pass], "this class is free");
  check(free === true, `⚠ B8: a pass cannot be spent on a free class (${free})`);
  const Q1 = await mk("Dry Pass Inside · All levels", 4, 300, "Hall B");
  await askYes(Q1, teacher);
  await publish(Q1);
  await as(learner3);
  const offered2 = await q(`select count(*)::int n from public.passes_for_session($1)`, [Q1.sid]);
  check(offered2[0].n === 1, `…and is offered for a paid one (${offered2[0].n})`);
  const usedIn = await allowed(`select public.book_with_membership($1, $2)`, [Q1.sid, pass]);
  check(usedIn === 1, `the pass books a paid class 4 hours ahead (${usedIn})`);
  const [bq1] = await q(`select id from public.class_bookings where session_id = $1 and user_id = $2 and status = 'enrolled'`, [Q1.sid, learner3]);
  await q(`select public.cancel_class_booking_with_reason($1, 'Travelling')`, [bq1.id]);
  await asNobody();
  const kept = await q(`select count(*)::int n from public.membership_uses where class_booking_id = $1 and deleted_at is null`, [bq1.id]);
  check(kept[0].n === 1, `⚠ D6: cancelled inside the 12-hour window, the hours are KEPT (${kept[0].n})`);
  const Q2 = await mk("Dry Pass CallOff · All levels", 6, 300, "Hall B");
  await askYes(Q2, teacher);
  await publish(Q2);
  await as(learner3);
  await q(`select public.book_with_membership($1, $2)`, [Q2.sid, pass]);
  const [bq2] = await q(`select id from public.class_bookings where session_id = $1 and user_id = $2 and status = 'enrolled'`, [Q2.sid, learner3]);
  await as(owner);
  await q(`select public.cancel_class_bookings_for_class($1, 'Teacher ill')`, [Q2.id]);
  await asNobody();
  const back2 = await q(`select count(*)::int n from public.membership_uses where class_booking_id = $1 and deleted_at is null`, [bq2.id]);
  check(back2[0].n === 0, `⚠ D6: a call-off gives the hours back even inside the window (${back2[0].n})`);
  check((await notesWhere(learner3, `title ilike 'Dry Pass CallOff%called off%' and body ilike '%hours are back%'`)) === 1, `B2: the pass holder is told the hours are back`);

  /* ── D7 / D9: the venue ── */
  await as(teacher);
  const madeV = await allowed(`select public.create_class_with_session($1, 'Dry Venue · All levels', 'Hip-Hop', 'all', 'Hall', 0, 10, 'draft', $2, $3, $4, null, $5)`,
    [page, ts(100), ts(101), room["Hall"], studio]);
  check(madeV === 1, `the artist asks for the studio's Hall (${madeV})`);
  await asNobody();
  const [V1] = await q(`select c.id, s.id sid from public.classes c join public.class_sessions s on s.class_id = c.id where c.title = 'Dry Venue · All levels' and c.business_id = $1`, [page]);
  check((await notesWhere(manager, `href = $2`, [`/business/${studio}/classes?tab=todo`])) >= 1, `B14: the room request reaches the studio's MANAGER, pointing at Classes`);
  await as(owner);
  await q(`select public.respond_to_venue_request($1, true)`, [V1.id]);
  // D9: the accepted draft holds the room
  const C2 = await mk("Dry Clash · All levels", 100, 0, "Hall");
  await askYes(C2, teacher2);
  const clash = await publish(C2);
  check(typeof clash === "string", `⚠ D9: an accepted room request holds the room — a published class there is refused (${clash})`);
  // …and a studio's yes is refused when the room is already taken
  const C3 = await mk("Dry Taken · All levels", 110, 0, "Hall");
  await askYes(C3, teacher2);
  const pubC3 = await publish(C3);
  check(pubC3 === 1, `a class published at 110h (${pubC3})`);
  await as(teacher);
  await q(`select public.create_class_with_session($1, 'Dry Venue Two · All levels', 'Hip-Hop', 'all', 'Hall', 0, 10, 'draft', $2, $3, $4, null, $5)`,
    [page, ts(110), ts(111), room["Hall"], studio]);
  await asNobody();
  const [V2] = await q(`select id from public.classes where title = 'Dry Venue Two · All levels' and business_id = $1`, [page]);
  await as(owner);
  const yesClash = await refused(`select public.respond_to_venue_request($1, true)`, [V2.id], null);
  check(yesClash === true, `D9: the studio cannot accept a room that is taken (${yesClash})`);

  // D7: the venue's runners run the door, and read no money
  await as(teacher);
  await q(`select public.create_class_with_session($1, 'Dry Venue Door · All levels', 'Hip-Hop', 'all', 'Studio C', 0, 10, 'draft', $2, $3, $4, null, $5)`,
    [page, ts(130), ts(131), room["Studio C"], studio]);
  await asNobody();
  const [V3] = await q(`select c.id, s.id sid from public.classes c join public.class_sessions s on s.class_id = c.id where c.title = 'Dry Venue Door · All levels' and c.business_id = $1`, [page]);
  await as(manager);
  const mgrYes = await allowed(`select public.respond_to_venue_request($1, true)`, [V3.id]);
  check(mgrYes === 1, `the studio's MANAGER answers a room request (${mgrYes})`);
  const pubV = await publish(V3, teacher);
  check(pubV === 1, `the artist publishes the venue class (${pubV})`);
  const V = V3;
  await moveTo(V, 10);
  await as(learner3);
  const bookV = await allowed(`select public.book_class_session($1)`, [V.sid]);
  check(bookV === 1, `a learner books the venue class (${bookV})`);
  await asNobody();
  const [bv] = await q(`select id from public.class_bookings where session_id = $1 and user_id = $2 and status = 'enrolled'`, [V.sid, learner3]);
  await as(owner, "service_role");
  const [{ id: vorder }] = await q(`insert into public.orders (business_id, user_id, class_id, session_id, class_booking_id, amount_inr, status, created_by, updated_by) values ($1, $2, $3, $4, $5, 200, 'paid', $2, $2) returning id`, [page, learner3, V.id, V.sid, bv.id]);
  await q(`insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id, amount_inr, status, method, kind, created_by, updated_by) values ($1, $2, $3, 'cashfree', $4, 200, 'captured', 'upi', 'order', $3, $3)`, [vorder, page, learner3, `dry_v_${vorder.slice(0, 8)}`]);
  await as(owner);
  const ci = await allowed(`select public.check_in($1)`, [bv.id]);
  check(ci === 1, `⚠ D7: the venue's owner checks the learner in (${ci})`);
  const regRows = await q(`select count(*)::int n from public.class_bookings where class_id = $1`, [V.id]);
  check(regRows[0].n >= 1, `…and reads the register (${regRows[0].n})`);
  const pay = await q(`select (select count(*)::int from public.payments where order_id = $1) p, (select count(*)::int from public.orders where id = $1) o`, [vorder]);
  check(pay[0].p === 0 && pay[0].o === 0, `⚠⚠ D7: …and reads NO payment and NO order (${pay[0].p}/${pay[0].o})`);
  await as(stranger);
  const ci2 = await refused(`select public.check_in($1)`, [bv.id], "runs the register");
  check(ci2 === true, `a stranger still cannot (${ci2})`);

  /* ── D10 at the door, and B22 ── */
  const D = await mk("Dry Door · All levels", 24, 0, "Hall");
  await askYes(D, teacher);
  await publish(D);
  await moveTo(D, 10);
  const pre = { o: await notesWhere(owner, `kind = 'booking'`), t: await notesWhere(teacher, `kind = 'booking'`) };
  await as(manager);
  const door = await allowed(`select public.book_at_the_door($1, $2, null)`, [D.sid, stranger]);
  check(door === 1, `the manager books a person at the door (${door})`);
  const walk = await allowed(`select public.book_at_the_door($1, null, 'Walk In')`, [D.sid]);
  check(walk === 1, `…and a walk-in (${walk})`);
  const post = { o: await notesWhere(owner, `kind = 'booking'`), t: await notesWhere(teacher, `kind = 'booking'`) };
  check(post.o === pre.o && post.t === pre.t, `⚠ D10: a door booking and a walk-in tell nobody (${post.o - pre.o}/${post.t - pre.t})`);
  await asNobody();
  const [bd] = await q(`select id from public.class_bookings where session_id = $1 and user_id = $2 and status = 'enrolled'`, [D.sid, stranger]);
  await as(manager);
  await q(`select public.check_in($1)`, [bd.id]);
  await as(stranger);
  await q(`select public.cancel_class_booking_with_reason($1, 'Changed my mind')`, [bd.id]);
  await asNobody();
  const att = await q(`select count(*)::int n from public.attendance where class_booking_id = $1 and deleted_at is null`, [bd.id]);
  check(att[0].n === 0, `⚠ B22: cancelling a seat closes its attendance (${att[0].n})`);

  /* ── D11: the reminder, once ── */
  const R = await mk("Dry Reminder · All levels", 1, 0, "Hall B");
  await askYes(R, teacher);
  await publish(R);
  await as(learner);
  await q(`select public.book_class_session($1)`, [R.sid]);
  await asNobody();
  const n1 = await q(`select public.remind_upcoming_sessions() n`);
  check(n1[0].n >= 1, `the reminder ran (${n1[0].n} sessions)`);
  check((await notes(learner, "Dry Reminder%starts at%")) === 1 && (await notes(teacher, "Dry Reminder%starts at%")) === 1,
    `⚠ D11: the learner and the teacher are reminded`);
  await q(`select public.remind_upcoming_sessions()`);
  check((await notes(learner, "Dry Reminder%starts at%")) === 1, `…ONCE`);

  /* ── D2: an outside artist with a rate is paid ── */
  const Pay = await mk("Dry Payout · All levels", 72, 0, "Hall");
  await as(owner);
  await q(`select public.ask_class_person($1, $2, 'artist', false, false, 500)`, [Pay.id, learner2]);
  await asNobody();
  const [pp] = await q(`select id, pay_per_session_inr from public.class_people where class_id = $1 and user_id = $2 and deleted_at is null`, [Pay.id, learner2]);
  await as(learner2);
  await q(`select public.respond_to_class_ask($1, true)`, [pp.id]);
  await moveTo(Pay, -180);
  await as(owner);
  const po = await q(`select (public.record_payout($1, $2, array[$3]::uuid[])).amount_inr a`, [studio, learner2, Pay.sid]);
  check(po[0].a === 500, `⚠ D2: an outside artist with no seat is paid their rate (₹${po[0].a})`);

  /* ── grants, cron, and nothing else moved ── */
  await asNobody();
  for (const f of ["notify_business_runners(uuid,text,text,text,text,uuid)", "_class_booking_refusal(uuid,uuid)", "_assert_class_bookable(uuid,uuid)",
                   "notify_class_teacher_gone()", "notify_class_published()", "remind_upcoming_sessions()"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(!g[0].a && !g[0].n, `${f} is executable by no client role`);
  }
  for (const f of ["step_down_from_class(uuid,text)", "class_waits_for_teacher(uuid)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f} is signed-in only`);
  }
  const acl = await q(`select p.oid::regprocedure::text sig, p.proacl::text acl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by 1`,
    [["book_class_session", "create_payment_order", "book_with_membership", "book_class_session_for_person", "add_class_walk_in", "passes_for_session",
      "apply_captured_payment_classes_and_events", "_cancel_one_class_booking", "return_membership_unit", "classes_publish_state", "guard_published_class_fixed",
      "ask_class_person", "notify_class_person", "withdraw_class_ask", "notify_venue_request", "notify_class_booking", "can_run_register_for_class",
      "assert_room_ok", "record_payout"]]);
  const expect = {
    "apply_captured_payment_classes_and_events(text,text,bigint,text)": "{postgres=X/postgres,service_role=X/postgres}",
  };
  check(acl.length === 19, `19 changed functions, one each (${acl.length})`);
  check(acl.every((r) => !/anon=/.test(r.acl ?? "") || r.sig.startsWith("passes_for_session") === false), `no changed function gained anon (${acl.filter((r) => /anon=/.test(r.acl ?? "")).map((r) => r.sig).join(", ") || "none"})`);
  check(acl.find((r) => r.sig in expect)?.acl === expect["apply_captured_payment_classes_and_events(text,text,bigint,text)"], `the capture applier is still the service role's alone`);
  const anon = await q(`select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, `public policies unchanged in number (${pol[0].n})`);
  const cron = await q(`select jobname from cron.job where jobname in ('draft-clock', 'class-reminders')`);
  check(cron.length === 1 && cron[0].jobname === "class-reminders", `⚠ D3/D11: draft-clock gone, class-reminders scheduled (${cron.map((r) => r.jobname).join(",")})`);
  const gone = await q(`select count(*)::int n from pg_proc where proname in ('close_stale_drafts', '_dos_swap') and pronamespace = 'public'::regnamespace`);
  check(gone[0].n === 0, `close_stale_drafts and the swap helper are gone (${gone[0].n})`);
  const col = await q(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'class_sessions' and column_name = 'reminded_at'`);
  check(col[0].n === 1, `class_sessions.reminded_at exists`);
};
