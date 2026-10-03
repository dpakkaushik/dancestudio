// Checks for 20261003100000_a_stranger_sees_who_teaches, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const asAnon = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
    await q("set local role anon");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };

  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set grows by exactly one (39 -> ${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);
  const cols = await q(`select array_to_string(proargnames, ',') a from pg_proc where proname = 'public_class_teachers'`);
  check(cols[0] && cols[0].a === "p_class_ids,class_id,user_id,full_name,profile_photo_path", `it returns four columns and no more (${cols[0] && cols[0].a})`);

  // a published class of a listed business with a confirmed artist
  await asNobody();
  const pub = (await q(`
    select k.class_id, p.full_name from public.class_people k
      join public.classes c on c.id = k.class_id
      join public.businesses t on t.id = c.business_id
      join public.profiles p on p.id = k.user_id
     where k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
       and c.status = 'published' and c.deleted_at is null and t.visibility = 'listed' and t.deleted_at is null and p.deleted_at is null
     limit 1`))[0];
  check(Boolean(pub), "production has a published class with a confirmed teacher to read");
  const draft = (await q(`
    select k.class_id from public.class_people k join public.classes c on c.id = k.class_id
     where k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null and c.status = 'draft' and c.deleted_at is null limit 1`))[0];
  const asked = (await q(`
    select k.class_id from public.class_people k join public.classes c on c.id = k.class_id
     where k.kind = 'artist' and k.status = 'asked' and k.deleted_at is null and c.deleted_at is null
       and not exists (select 1 from public.class_people x where x.class_id = k.class_id and x.kind = 'artist' and x.status = 'confirmed' and x.deleted_at is null)
     limit 1`))[0];
  const unlisted = (await q(`
    select k.class_id from public.class_people k join public.classes c on c.id = k.class_id join public.businesses t on t.id = c.business_id
     where k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null and c.status = 'published' and t.visibility <> 'listed' limit 1`))[0];

  await asAnon();
  const direct = await q(`select count(*)::int n from public.profiles`);
  check(direct[0].n === 0, `a stranger still reads no profile row directly (${direct[0].n})`);
  const got = await q(`select * from public.public_class_teachers($1)`, [[pub.class_id]]);
  check(got.length === 1 && got[0].full_name === pub.full_name, `a stranger reads the published class's teacher by name (${got[0] && got[0].full_name})`);
  if (draft) {
    const d = await q(`select * from public.public_class_teachers($1)`, [[draft.class_id]]);
    check(d.length === 0, "a draft's teacher stays hidden");
  } else check(true, "(no draft with a teacher on production to test)");
  if (asked) {
    const a = await q(`select * from public.public_class_teachers($1)`, [[asked.class_id]]);
    check(a.length === 0, "an unanswered ask names nobody");
  } else check(true, "(no unanswered teacher ask on production to test)");
  if (unlisted) {
    const u = await q(`select * from public.public_class_teachers($1)`, [[unlisted.class_id]]);
    check(u.length === 0, "an unlisted studio's class names nobody");
  } else check(true, "(no published class of an unlisted business to test)");
  const empty = await q(`select * from public.public_class_teachers(null)`);
  check(empty.length === 0, "a null list answers nothing");
  await asNobody();
};
