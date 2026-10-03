// Checks for 20261003110000_a_studios_students_are_its_runners, run inside the
// dry run's rolled-back transaction by scripts/dry-run-migration.js.
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
  const n = async (sql, args) => (await q(sql, args))[0].n;

  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies: seven replaced by seven (${pol[0].n})`);
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const old = await q(`select policyname from pg_policies where schemaname='public' and qual ~ 'is_business_member' and tablename in ('class_bookings','attendance','leads','membership_passes','membership_uses')`);
  check(old.length === 0, `no student table still admits every member (${old.map((r) => r.policyname).join(", ")})`);

  // a studio with bookings on at least two classes, its owner, and two people off its team
  await asNobody();
  const biz = (await q(`
    select b.business_id id, m.user_id owner_id from (
      select business_id from public.class_bookings where deleted_at is null and user_id is not null
       group by business_id having count(distinct class_id) >= 2 order by count(*) desc limit 1) b
      join public.business_members m on m.business_id = b.business_id and m.member_role = 'owner' and m.deleted_at is null
     limit 1`))[0];
  check(Boolean(biz), "production has a studio with bookings on two classes");
  const [visitor, trainer] = (await q(`
    select p.id from public.profiles p where p.deleted_at is null and p.id <> $2
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id)
       and not exists (select 1 from public.class_bookings b where b.business_id = $1 and b.user_id = p.id)
       and not exists (select 1 from public.class_people k where k.business_id = $1 and k.user_id = p.id)
     limit 2`, [biz.id, biz.owner_id])).map((r) => r.id);
  const classes = (await q(`select class_id from public.class_bookings where business_id = $1 and deleted_at is null group by class_id order by count(*) desc limit 2`, [biz.id])).map((r) => r.class_id);
  const total = await n(`select count(*)::int n from public.class_bookings where business_id = $1`, [biz.id]);
  const onA = await n(`select count(*)::int n from public.class_bookings where class_id = $1`, [classes[0]]);
  const attTotal = await n(`select count(*)::int n from public.attendance where business_id = $1`, [biz.id]);

  // seat the visitor as visiting faculty, the trainer as faculty — as the database itself would
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'visiting_faculty', $3, $3), ($1, $4, 'trainer', $3, $3)`, [biz.id, visitor, biz.owner_id, trainer]);
  await q(`insert into public.leads (business_id, name, mobile, source, status, created_by, updated_by) values ($1, 'Dry run walk-in', '9000000001', 'walk_in', 'new', $2, $2)`, [biz.id, biz.owner_id]);

  // the owner still reads the whole business
  await as(biz.owner_id);
  check((await n(`select count(*)::int n from public.class_bookings where business_id = $1`, [biz.id])) === total, `the owner reads every booking (${total})`);
  check((await n(`select count(*)::int n from public.attendance where business_id = $1`, [biz.id])) === attTotal, `the owner reads every check-in (${attTotal})`);
  check((await n(`select count(*)::int n from public.leads where business_id = $1`, [biz.id])) >= 1, "the owner reads the walk-ins");

  // a visiting teacher with no class reads nothing of the studio's students
  await as(visitor);
  check((await n(`select count(*)::int n from public.class_bookings where business_id = $1`, [biz.id])) === 0, "a visiting teacher reads no booking");
  check((await n(`select count(*)::int n from public.attendance where business_id = $1`, [biz.id])) === 0, "a visiting teacher reads no check-in");
  check((await n(`select count(*)::int n from public.leads where business_id = $1`, [biz.id])) === 0, "a visiting teacher reads no walk-in");
  check((await n(`select count(*)::int n from public.membership_passes where business_id = $1`, [biz.id])) === 0, "a visiting teacher reads no pass");
  await q("savepoint sp");
  let leadRefused = false;
  try {
    await q(`insert into public.leads (business_id, name, mobile, source, status, created_by, updated_by) values ($1, 'x', '9000000002', 'walk_in', 'new', $2, $2)`, [biz.id, visitor]);
  } catch {
    leadRefused = true;
  }
  await q("rollback to savepoint sp");
  check(leadRefused, "a visiting teacher cannot add a walk-in");

  // ... until they hold one class's register — then that class, and only it
  await asNobody();
  await q(`insert into public.class_people (class_id, business_id, user_id, kind, status, can_attendance, created_by, updated_by)
           values ($1, $2, $3, 'assistant', 'confirmed', true, $4, $4)`, [classes[0], biz.id, visitor, biz.owner_id]);
  await as(visitor);
  check((await n(`select count(*)::int n from public.class_bookings where class_id = $1`, [classes[0]])) === onA, `holding the register opens that class's bookings (${onA})`);
  check((await n(`select count(*)::int n from public.class_bookings where class_id = $1`, [classes[1]])) === 0, "and no other class's");

  // faculty run every register of the studio, so they read every class's — not the leads
  await as(trainer);
  check((await n(`select count(*)::int n from public.class_bookings where business_id = $1`, [biz.id])) === total, "faculty read the bookings of the registers they run");
  check((await n(`select count(*)::int n from public.leads where business_id = $1`, [biz.id])) === 0, "faculty read no walk-in list");

  // a learner still reads their own seats
  await asNobody();
  const learner = (await q(`select user_id from public.class_bookings where business_id = $1 and user_id is not null and deleted_at is null limit 1`, [biz.id]))[0].user_id;
  const mine = await n(`select count(*)::int n from public.class_bookings where user_id = $1`, [learner]);
  await as(learner);
  check((await n(`select count(*)::int n from public.class_bookings where user_id = $1`, [learner])) === mine, `a learner still reads their own bookings (${mine})`);

  // the register's own definer reads do not move
  const seat = await q(`select count(*)::int n from public.session_seat_counts(array(select session_id from public.class_bookings where class_id = $1 limit 5))`, [classes[0]]);
  check(seat[0].n >= 0, "seat counts still answer");
  await asNobody();
};
