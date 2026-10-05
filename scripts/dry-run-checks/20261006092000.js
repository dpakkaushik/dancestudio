// Checks for 20261006092000_a_number_is_read_through_its_switch, run inside the
// dry run's rolled-back transaction by scripts/dry-run-migration.js. Three real
// people get planted numbers (one with Call on, one off), a studio owner gets
// one of them as a student, and every read is made as a real role.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const asAnon = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await q("set local role anon");
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
  for (const role of ["anon", "authenticated"]) {
    const t = await q(`select has_table_privilege($1, 'public.profiles', 'select') t,
                              has_column_privilege($1, 'public.profiles', 'phone', 'select') ph,
                              has_column_privilege($1, 'public.profiles', 'full_name', 'select') fn,
                              has_column_privilege($1, 'public.profiles', 'phone_public', 'select') pp,
                              has_table_privilege($1, 'public.profiles', 'update') up,
                              has_table_privilege($1, 'public.profiles', 'insert') ins`, [role]);
    check(!t[0].t && !t[0].ph && t[0].fn && t[0].pp, `${role}: no table-wide SELECT, no SELECT on phone, every other column still selectable`);
    check(t[0].up && t[0].ins, `${role}: INSERT and UPDATE grants untouched`);
  }
  const cols = await q(`select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name <> 'phone'
                          and not has_column_privilege('authenticated', 'public.profiles', column_name, 'select')`);
  check(cols.length === 0, `every column but phone is granted to signed-in readers (${cols.map((r) => r.column_name).join(", ") || "none missing"})`);
  for (const f of ["profile_phones(uuid[])", "find_people_by_phone(text)"]) {
    const g = await q(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${f}`]);
    check(g[0].a && !g[0].n, `${f.split("(")[0]} is signed-in only`);
  }
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);

  /* ── the cast ── */
  const biz = (await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  const ppl = await q(`
    select p.id from public.profiles p
     where p.deleted_at is null and p.suspended_at is null and p.full_name is not null and p.role = 'user'
       and not exists (select 1 from public.business_members m where m.user_id = p.id and m.business_id = $1)
       and not exists (select 1 from public.class_bookings b where b.user_id = p.id and b.business_id = $1)
       and not exists (select 1 from public.membership_passes mp where mp.user_id = p.id and mp.business_id = $1)
       and not exists (select 1 from public.leads l where l.user_id = p.id and l.business_id = $1)
       and not exists (select 1 from public.platform_admins a where a.user_id = p.id and a.deleted_at is null)
     order by p.created_at limit 4`, [biz.id]);
  check(ppl.length === 4, "set-up: four people with no tie to the studio and no admin seat");
  const [A, B, C, D] = ppl.map((p) => p.id);
  await q("set local session_replication_role = replica");
  await q(`update public.profiles set phone = '+91 90000 33333', phone_public = false where id = $1`, [A]);
  await q(`update public.profiles set phone = '+91 90000 11111', phone_public = true where id = $1`, [B]);
  await q(`update public.profiles set phone = '+91 90000 22222', phone_public = false where id = $1`, [C]);
  await q(`update public.profiles set phone = '+91 90000 44444', phone_public = false where id = $1`, [D]);
  /* C becomes the studio's student (a lead naming them); D stays a stranger */
  await q(`insert into public.leads (business_id, name, user_id, status, source, created_by, updated_by) values ($1, 'Dry Student', $2, 'new', 'walk_in', $3, $3)`, [biz.id, C, biz.owner_id]);
  await q("set local session_replication_role = origin");

  /* 1 · A reads profiles straight off the API */
  await as(A);
  const raw = await tryq(`select phone from public.profiles where id = $1`, [C]);
  check(/permission denied/.test(raw.err ?? ""), `⚠ a signed-in account can no longer select somebody's phone off the table (${raw.err})`);
  const own = await tryq(`select phone from public.profiles where id = $1`, [A]);
  check(/permission denied/.test(own.err ?? ""), "…not even their own — that goes through profile_phones");
  const star = await tryq(`select * from public.profiles where id = $1`, [B]);
  check(/permission denied/.test(star.err ?? ""), "`select *` is refused for a client (documented in the migration)");
  const named = await tryq(`select id, full_name, phone_public, city from public.profiles where id = any($1::uuid[])`, [[A, B, C]]);
  check(named.err === null && named.rows.length === 3, `every other column reads exactly as before (${named.err ?? named.rows.length})`);

  /* 2 · profile_phones as A — their own and the one switched on, nothing else */
  const ph = await tryq(`select id, phone from public.profile_phones($1::uuid[])`, [[A, B, C, D]]);
  const got = new Map((ph.rows ?? []).map((r) => [r.id, r.phone]));
  check(got.get(A) === "+91 90000 33333", "A reads their OWN number");
  check(got.get(B) === "+91 90000 11111", "A reads B's number — B switched Call on");
  check(!got.has(C) && !got.has(D), "⚠ A does NOT read C's or D's — both have Call off");

  /* 3 · the studio owner — their student's number, not a stranger's */
  await as(biz.owner_id);
  const ow = await q(`select id, phone from public.profile_phones($1::uuid[])`, [[C, D]]);
  check(ow.some((r) => r.id === C) && !ow.some((r) => r.id === D), "⚠ the studio's owner reads its STUDENT's number (C) and not a stranger's (D)");

  /* 4 · anon cannot call it at all */
  await asAnon();
  const an = await tryq(`select * from public.profile_phones($1::uuid[])`, [[B]]);
  check(/permission denied/.test(an.err ?? ""), "anon cannot call profile_phones");
  const anRows = await tryq(`select id from public.profiles limit 5`);
  check(anRows.err === null && anRows.rows.length === 0, "anon still reads no profile rows (no policy), and is not refused outright");
  const pa = await tryq(`select phone from public.public_artist($1)`, [B]);
  check(pa.err === null, "public_artist still answers a stranger (its number rule is untouched)");

  /* 5 · the picker's number search */
  await as(A);
  const f1 = await q(`select public.find_people_by_phone('9000022222') id`);
  check(f1.length === 1 && f1[0].id === C, "a WHOLE number finds who holds it — even with Call off — as an id");
  const f2 = await q(`select public.find_people_by_phone('+91 90000 22222') id`);
  check(f2.length === 1 && f2[0].id === C, "…spaces and the country code do not matter");
  const f3 = await q(`select public.find_people_by_phone('22222') id`);
  check(f3.length === 0, "⚠ a FRAGMENT finds nobody — a number cannot be fished out digit by digit");
  const f4 = await tryq(`select pg_typeof(public.find_people_by_phone('9000022222'))::text t`);
  check(f4.rows?.[0]?.t === "uuid", "…and it hands back ids, never the number");

  /* 6 · writing still works */
  const up = await tryq(`select public.update_my_profile(p_full_name => (select full_name from public.profiles where id = $1), p_city => (select coalesce(city, 'Pune') from public.profiles where id = $1), p_age => null, p_socials => (select coalesce(socials, '[]'::jsonb) from public.profiles where id = $1), p_styles => (select coalesce(nullif(styles, '{}'), array['Hip-Hop']) from public.profiles where id = $1), p_phone => '+91 90000 55555')`, [A]);
  check(up.err === null, `update_my_profile still writes the caller's number (${up.err})`);
  await asNobody();
  check((await q(`select phone from public.profiles where id = $1`, [A]))[0].phone === "+91 90000 55555", "…and the number landed");
};
