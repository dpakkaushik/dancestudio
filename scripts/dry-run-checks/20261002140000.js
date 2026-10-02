// Checks for 20261002140000_paid_at_the_door_and_answered_invites, run inside the
// dry run's rolled-back transaction by scripts/dry-run-migration.js.
// Contract: module.exports = async (client, { check }).
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  /* an expected refusal must not abort the transaction: each on its own savepoint */
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
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };

  const cols = await q(`select column_name from information_schema.columns where table_schema='public' and table_name='class_bookings' and column_name in ('door_paid_at','door_paid_by')`);
  check(cols.length === 2, "class_bookings carries door_paid_at and door_paid_by");
  const fk = await q(`select 1 from pg_constraint where conrelid='public.class_bookings'::regclass and contype='f' and pg_get_constraintdef(oid) ilike '%door_paid_by%'`);
  check(fk.length === 0, "door_paid_by has no foreign key into auth.users");
  for (const fn of ["set_door_paid", "my_answered_invites"]) {
    const r = await q(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [fn]);
    check(r.length === 1 && !r[0].a && r[0].u, `${fn}: authenticated may call it, anon may not`);
  }
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);
  const pend = await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_pending_invites'`);
  check(/i\.status = 'pending'/.test(pend[0].d), "my_pending_invites is untouched (still pending-only)");

  /* ── behaviour: a priced live class, its owner, a walk-in planted on it ── */
  await asNobody();
  const cls = (await q(`
    select c.id class_id, c.business_id, s.id session_id, m.user_id owner_id
      from public.classes c
      join public.class_sessions s on s.class_id = c.id and s.deleted_at is null
      join public.business_members m on m.business_id = c.business_id and m.member_role = 'owner' and m.deleted_at is null
     where c.deleted_at is null and c.status = 'published' and c.price_inr > 0
     limit 1`))[0];
  if (!cls) {
    check(true, "no priced published class on production to plant on — behaviour not exercised");
    return;
  }
  const walkIn = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, attendee_name, status, created_by, updated_by)
     values ($1,$2,$3,null,'Dry Run Walk-in','enrolled',$4,$4) returning id`, [cls.session_id, cls.class_id, cls.business_id, cls.owner_id]))[0].id;

  await as(cls.owner_id);
  const at = (await q(`select public.set_door_paid($1, true) at`, [walkIn]))[0].at;
  check(at !== null, "the owner marks the walk-in paid");
  await asNobody();
  const row = (await q(`select door_paid_at, door_paid_by from public.class_bookings where id=$1`, [walkIn]))[0];
  check(row.door_paid_at !== null && row.door_paid_by === cls.owner_id, "and the seat says when, and who recorded it");
  await as(cls.owner_id);
  const undo = (await q(`select public.set_door_paid($1, false) at`, [walkIn]))[0].at;
  check(undo === null, "a mistake can be taken back");
  await asNobody();

  /* a stranger cannot */
  const stranger = (await q(`select p.id from public.profiles p where p.deleted_at is null and not exists (select 1 from public.business_members m where m.business_id=$1 and m.user_id=p.id and m.deleted_at is null) and p.id <> $2 limit 1`, [cls.business_id, cls.owner_id]))[0];
  if (stranger) {
    await as(stranger.id);
    const r = await refused(`select public.set_door_paid($1, true)`, [walkIn], /only somebody running this register/);
    check(r === true, `somebody off the team is refused in words (${r})`);
    await asNobody();
  }

  /* a seat the person booked themselves is refused */
  const self = (await q(`select b.id from public.class_bookings b where b.class_id=$1 and b.status='enrolled' and b.deleted_at is null and b.user_id is not null and b.created_by = b.user_id limit 1`, [cls.class_id]))[0];
  let selfId = self && self.id;
  if (!selfId && stranger) {
    selfId = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
       values ($1,$2,$3,$4,'enrolled',$4,$4) returning id`, [cls.session_id, cls.class_id, cls.business_id, stranger.id]))[0].id;
  }
  if (selfId) {
    await as(cls.owner_id);
    const r = await refused(`select public.set_door_paid($1, true)`, [selfId], /booked this seat themselves/);
    check(r === true, `a self-booked seat cannot be changed by the door (${r})`);
    await asNobody();
  }

  /* a free class is refused */
  const free = (await q(`
    select c.id class_id, c.business_id, s.id session_id, m.user_id owner_id
      from public.classes c
      join public.class_sessions s on s.class_id = c.id and s.deleted_at is null
      join public.business_members m on m.business_id = c.business_id and m.member_role = 'owner' and m.deleted_at is null
     where c.deleted_at is null and c.price_inr = 0 limit 1`))[0];
  if (free) {
    const fw = (await q(`insert into public.class_bookings (session_id, class_id, business_id, user_id, attendee_name, status, created_by, updated_by)
       values ($1,$2,$3,null,'Dry Run Free','enrolled',$4,$4) returning id`, [free.session_id, free.class_id, free.business_id, free.owner_id]))[0].id;
    await as(free.owner_id);
    const r = await refused(`select public.set_door_paid($1, true)`, [fw], /nothing is due/);
    check(r === true, `a free class has nothing due (${r})`);
    await asNobody();
  }

  /* ── my_answered_invites: the invitee reads an answered invite back ── */
  /* ⚠ on a LIVE business — the read rightly leaves out an invite to a business
     that has since been deleted (the first run picked one of those) */
  const inv = (await q(`select i.id, i.user_id, i.email from public.business_invites i join public.businesses t on t.id = i.business_id and t.deleted_at is null where i.status = 'accepted' and i.deleted_at is null and i.user_id is not null limit 1`))[0];
  if (inv) {
    await as(inv.user_id);
    const mine = await q(`select invite_id, status from public.my_answered_invites()`);
    check(mine.some((m) => m.invite_id === inv.id && m.status === "accepted"), "the invitee reads their accepted invite back");
    const pend2 = await q(`select invite_id from public.my_pending_invites()`);
    check(!pend2.some((m) => m.invite_id === inv.id), "and it is not pending");
    await asNobody();
    if (stranger && stranger.id !== inv.user_id) {
      await as(stranger.id);
      const theirs = await q(`select invite_id from public.my_answered_invites()`);
      check(!theirs.some((m) => m.invite_id === inv.id), "nobody else reads it");
      await asNobody();
    }
  } else {
    check(true, "no accepted invite naming a person on production — read not exercised");
  }
};
