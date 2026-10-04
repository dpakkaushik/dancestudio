// Checks for 20261004180000_an_assistant_from_your_team_and_a_routine_of_the_style,
// run inside the dry run's rolled-back transaction by scripts/dry-run-migration.js.
// The cast is planted at a real studio in replica mode (a crew, an artist page's
// extra seat, a published class), and every ask goes through the RPC the app
// calls, as the real role.
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
  /* an expected refusal gets its own savepoint, or the first raise aborts the rest */
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
  const body = async (sig) => (await q(`select pg_get_functiondef($1::regprocedure) d`, [sig]))[0].d;
  const slug = () => `dry-pool-${Math.random().toString(36).slice(2, 10)}`;
  const POOL = /Only people on your team or in your crews can be asked to assist\./;
  const ASK = `select (public.ask_class_person($1, $2, $3)).status s`;

  /* ── the catalog ── */
  await asNobody();
  const ask = await body("public.ask_class_person(uuid, uuid, text, boolean, boolean, integer)");
  check(POOL.test(ask) && /p_kind = 'assistant' and not \(/.test(ask), "ask_class_person refuses an assistant outside the pool, in the app's words");
  check(ask.indexOf("only the owner, or the person taking this class, adds assistants") < ask.indexOf("Only people on your team"),
    "…AFTER the existing who-may-ask check, so a stranger is told that first");
  check(/m\.business_id = v_class\.business_id/.test(ask) && /b\.type = 'artist_page'/.test(ask) && /public\.crew_members mine/.test(ask),
    "…and its three sources are the picker's: the class's team, the asker's artist page, the asker's crews");
  const add = await body("public.add_class_routine(uuid, uuid)");
  check(/Only a % routine can go on a % class\./.test(add) && /r\.style = c\.style/.test(add), "add_class_routine refuses a routine of another style");
  check(add.indexOf("that routine is not yours") < add.indexOf("Only a %"), "…after the ownership check");
  const helper = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = '_dos_swap'`);
  check(helper.length === 0, "the anchor helper is gone");
  const acl = await q(`select p.oid::regprocedure::text sig, p.proacl::text acl from pg_proc p
     where p.pronamespace='public'::regnamespace and p.proname in ('ask_class_person','add_class_routine') order by 1`);
  const WANT = "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}";
  check(acl.length === 2 && acl.every((r) => r.acl === WANT), `both keep their grants exactly — signed-in yes, anon no (${acl.map((r) => r.acl).join(" · ")})`);
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' order by b.created_at limit 1`))[0];
  check(!!biz, `set-up: a live studio with an owner (${biz?.id})`);
  /* an artist page whose owner is NOT on the studio's team */
  const page = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'artist_page'
       and not exists (select 1 from public.business_members x where x.business_id = $1 and x.user_id = m.user_id)
     order by b.created_at limit 1`, [biz.id]))[0];
  check(!!page, `set-up: an artist page with an owner off the studio's team (${page?.id})`);
  /* five people on NO team of either, and in no crew with either asker */
  const free = await q(`
    select p.id from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null
       and p.id not in ($2, $4)
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id in ($1, $3))
       and not exists (select 1 from public.crew_members cm where cm.user_id = p.id and cm.deleted_at is null)
     order by p.created_at limit 7`, [biz.id, biz.owner_id, page.id, page.owner_id]);
  check(free.length === 7, `set-up: seven people with no seat on either and no crew (${free.length})`);
  const [S, M, M2, D, P, OLD, SPARE] = free.map((r) => r.id);
  const O = biz.owner_id;
  const A = page.owner_id;
  const T = (await q(`
    select m.user_id id from public.business_members m
      join public.profiles p on p.id = m.user_id and p.deleted_at is null
     where m.business_id = $1 and m.deleted_at is null and m.member_role <> 'owner' and m.user_id <> $2 limit 1`, [biz.id, A]))[0]?.id;

  await asNobody();
  await q("set local session_replication_role = replica");
  let teammate = T;
  if (!teammate) {
    /* no teammate on that studio: seat a spare person as staff, in the transaction */
    teammate = SPARE;
  }
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by)
           select $1, $2, 'staff', $3, $3 where not exists (select 1 from public.business_members where business_id = $1 and user_id = $2)`, [biz.id, teammate, O]);
  /* P is on the ARTIST PAGE's team and nowhere else */
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'assistant', $3, $3)`, [page.id, P, A]);
  /* O's crew: M confirmed, M2 only asked; a DELETED crew of O's holds D confirmed */
  const crew = (await q(`insert into public.crews (name, city, style, leader_id, created_by, updated_by)
      values ('Dry Pool Crew', 'Pune', 'Hip-Hop', $1, $1, $1) returning id`, [O]))[0].id;
  await q(`insert into public.crew_members (crew_id, user_id, role, status, created_by, updated_by) values
      ($1, $2, 'leader', 'confirmed', $2, $2), ($1, $3, 'member', 'confirmed', $2, $2), ($1, $4, 'member', 'asked', $2, $2)`, [crew, O, M, M2]);
  const deadCrew = (await q(`insert into public.crews (name, city, style, leader_id, created_by, updated_by, deleted_at)
      values ('Dry Pool Gone', 'Pune', 'Hip-Hop', $1, $1, $1, now()) returning id`, [O]))[0].id;
  await q(`insert into public.crew_members (crew_id, user_id, role, status, created_by, updated_by) values
      ($1, $2, 'leader', 'confirmed', $2, $2), ($1, $3, 'member', 'confirmed', $2, $2)`, [deadCrew, O, D]);
  /* a published Hip-Hop class at the studio, taught by A (confirmed), session ahead */
  const cls = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
      values ($1, 'Dry Pool Class', 'Hip-Hop', 'all', 0, 10, 'published', $2, $2, $3) returning id`, [biz.id, O, slug()]))[0].id;
  await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() + interval '5 days', now() + interval '5 days 1 hour', $3, $3)`, [cls, biz.id, O]);
  await q(`insert into public.class_people (class_id, business_id, user_id, kind, status, created_by, updated_by)
      values ($1, $2, $3, 'artist', 'confirmed', $4, $4)`, [cls, biz.id, A, O]);
  /* a second class with NO teacher yet — one live artist per class, so asking a
     stranger to teach is tested where there is room for a teacher */
  const cls2 = (await q(`insert into public.classes (business_id, title, style, level, price_inr, capacity, status, created_by, updated_by, share_slug)
      values ($1, 'Dry Pool Draft', 'Hip-Hop', 'all', 0, 10, 'draft', $2, $2, $3) returning id`, [biz.id, O, slug()]))[0].id;
  await q(`insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
      values ($1, $2, now() + interval '6 days', now() + interval '6 days 1 hour', $3, $3)`, [cls2, biz.id, O]);
  /* an assistant asked BEFORE the rule, from outside the pool — it must survive */
  const oldRow = (await q(`insert into public.class_people (class_id, business_id, user_id, kind, status, created_by, updated_by)
      values ($1, $2, $3, 'assistant', 'asked', $4, $4) returning id`, [cls, biz.id, OLD, O]))[0].id;
  await q("set local session_replication_role = origin");

  /* ── the owner asking ── */
  await as(O);
  const r1 = await tryq(ASK, [cls, teammate, "assistant"]);
  check(r1.err === null && r1.rows[0].s === "asked", `the owner asks somebody on the studio's team (${r1.err ?? r1.rows[0].s})`);
  const r2 = await tryq(ASK, [cls, S, "assistant"]);
  check(POOL.test(r2.err ?? ""), `⚠ the owner cannot ask a stranger to assist — refused in words (${r2.err ?? "allowed"})`);
  const r3 = await tryq(ASK, [cls, M, "assistant"]);
  check(r3.err === null && r3.rows[0].s === "asked", `…but may ask a CONFIRMED member of their crew (${r3.err ?? r3.rows[0].s})`);
  const r4 = await tryq(ASK, [cls, M2, "assistant"]);
  check(POOL.test(r4.err ?? ""), `somebody only ASKED onto the crew is not in it yet (${r4.err ?? "allowed"})`);
  const r5 = await tryq(ASK, [cls, D, "assistant"]);
  check(POOL.test(r5.err ?? ""), `a member of a DELETED crew is not in the pool (${r5.err ?? "allowed"})`);
  const r6 = await tryq(ASK, [cls, P, "assistant"]);
  check(POOL.test(r6.err ?? ""), `the OWNER cannot reach the teacher's own artist-page team — that is the teacher's (${r6.err ?? "allowed"})`);

  /* ── the teacher asking ── */
  await as(A);
  const r7 = await tryq(ASK, [cls, P, "assistant"]);
  check(r7.err === null && r7.rows[0].s === "asked", `the TEACHER brings an assistant from the artist page they own (${r7.err ?? r7.rows[0].s})`);
  const r8 = await tryq(ASK, [cls, S, "assistant"]);
  check(POOL.test(r8.err ?? ""), `…and is refused a stranger (${r8.err ?? "allowed"})`);

  /* ── the order, and what does not move ── */
  await as(S);
  const r9 = await tryq(ASK, [cls, M, "assistant"]);
  check(/only the owner, or the person taking this class, adds assistants/.test(r9.err ?? ""), `a stranger ASKING is told whose act it is first (${r9.err ?? "allowed"})`);
  await as(O);
  const r10 = await tryq(ASK, [cls2, S, "artist"]);
  check(r10.err === null && r10.rows[0].s === "asked", `the TEACHER is still anybody on DanceOS — the owner asks a stranger to teach (${r10.err ?? r10.rows[0].s})`);
  const r11 = await tryq(ASK, [cls, OLD, "assistant"]);
  check(POOL.test(r11.err ?? ""), `re-asking the pre-rule assistant is refused (${r11.err ?? "allowed"})`);
  await asNobody();
  const old = await q(`select deleted_at is null live, status from public.class_people where id = $1`, [oldRow]);
  check(old[0].live && old[0].status === "asked", `⚠ …and the refusal closed nothing: the pre-rule row is still live and asked (nothing backfilled)`);
  const strangerRows = await q(`select count(*)::int n from public.class_people where class_id = $1 and user_id = $2 and kind = 'assistant'`, [cls, S]);
  check(strangerRows[0].n === 0, `a refused ask leaves no row behind (${strangerRows[0].n})`);
  /* a teammate taken off the team is out of the pool the moment the seat ends */
  await q("set local session_replication_role = replica");
  await q(`update public.business_members set deleted_at = now() where business_id = $1 and user_id = $2`, [biz.id, teammate]);
  await q("set local session_replication_role = origin");
  await as(O);
  const r12 = await tryq(ASK, [cls, teammate, "assistant"]);
  check(POOL.test(r12.err ?? ""), `a teammate whose seat ended is out of the pool (${r12.err ?? "allowed"})`);

  /* ── routines ── */
  await asNobody();
  await q("set local session_replication_role = replica");
  const mkR = async (style) => (await q(`insert into public.routines (owner_id, title, style, level, status, created_by, updated_by)
      values ($1, $2, $3, 'all', 'live', $1, $1) returning id`, [O, `Dry ${style}`, style]))[0].id;
  const hip = await mkR("Hip-Hop");
  const kat = await mkR("Kathak");
  const preKat = await mkR("Kathak");
  /* a Kathak routine already on the Hip-Hop class from before the rule */
  await q(`insert into public.class_routines (class_id, routine_id, created_by, updated_by) values ($1, $2, $3, $3)`, [cls, preKat, O]);
  await q("set local session_replication_role = origin");
  await as(O);
  const r13 = await tryq(`select public.add_class_routine($1, $2)`, [cls, hip]);
  check(r13.err === null, `a Hip-Hop routine goes on the Hip-Hop class (${r13.err})`);
  const r14 = await tryq(`select public.add_class_routine($1, $2)`, [cls, kat]);
  check(/Only a Hip-Hop routine can go on a Hip-Hop class\./.test(r14.err ?? ""), `⚠ a Kathak routine is refused, naming the style (${r14.err ?? "allowed"})`);
  await asNobody();
  const links = await q(`select r.style, cr.deleted_at is null live from public.class_routines cr join public.routines r on r.id = cr.routine_id where cr.class_id = $1 order by r.style`, [cls]);
  check(links.length === 2 && links.every((l) => l.live) && links.some((l) => l.style === "Kathak") && links.some((l) => l.style === "Hip-Hop"),
    `the pre-rule Kathak link stays and the Hip-Hop one is added — nothing backfilled (${JSON.stringify(links)})`);
  /* taking the old link down and putting it back is a new add, and is refused */
  await q("set local session_replication_role = replica");
  await q(`update public.class_routines set deleted_at = now() where class_id = $1 and routine_id = $2`, [cls, preKat]);
  await q("set local session_replication_role = origin");
  await as(O);
  const r15 = await tryq(`select public.add_class_routine($1, $2)`, [cls, preKat]);
  check(/Only a Hip-Hop routine/.test(r15.err ?? ""), `putting the old wrong-style link back is refused too (${r15.err ?? "allowed"})`);
  await as(S);
  const r16 = await tryq(`select public.add_class_routine($1, $2)`, [cls, hip]);
  check(/only the artist taking this class, or the studio that owns it, adds a routine/.test(r16.err ?? ""), `a stranger is still refused by the who-may check first (${r16.err ?? "allowed"})`);
};
