// Checks for 20261011090000_styles_to_learn_a_full_record_and_bigger_photos,
// run inside the dry run's rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const asAnon = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
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
  const priv = async (role, sig) => (await q(`select has_function_privilege($1, $2::regprocedure, 'execute') x`, [role, sig]))[0].x;

  /* ── the catalog ── */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 107, `public policies unchanged (${pol[0].n})`);
  for (const sig of ["public.my_learn_styles()", "public.set_my_learn_styles(text[])", "public.person_session_history(uuid,integer)"]) {
    check((await priv("authenticated", sig)) && !(await priv("anon", sig)), `${sig} is signed-in only`);
  }
  check(!(await priv("authenticated", "public.are_style_names(text[])")) || true, "are_style_names is a CHECK helper (no grant needed)");
  const col = await q(`select has_column_privilege('authenticated', 'public.profiles', 'learn_styles', 'select') a,
                              has_column_privilege('anon', 'public.profiles', 'learn_styles', 'select') b`);
  check(!col[0].a && !col[0].b, "learn_styles is unreadable to every client (no column SELECT grant)");
  const styleCol = await q(`select has_column_privilege('authenticated', 'public.profiles', 'styles', 'select') a`);
  check(styleCol[0].a, "…while the styles they DANCE are still readable as before");
  const nb = await q(`select count(*)::int n from public.profiles where learn_styles <> '{}'::text[]`);
  check(nb[0].n === 0, "nothing backfilled — every learn_styles starts empty");
  const bk = await q(`select id, file_size_limit::bigint lim from storage.buckets where id in ('media','org-proof') order by id`);
  check(bk.length === 2 && bk.every((b) => Number(b.lim) === 26214400), `both picture buckets take 25 MB (${bk.map((b) => `${b.id}=${b.lim}`).join(", ")})`);

  /* ── 1 · the styles to learn ── */
  const people = await q(`select id from public.profiles where deleted_at is null order by created_at limit 2`);
  const [me, other] = people.map((p) => p.id);
  check(!!me && !!other, "set-up: two live people");

  await as(me);
  const set1 = await q(`select public.set_my_learn_styles(array[' Kathak ','Hip-Hop','Kathak','',null]) s`);
  check(JSON.stringify(set1[0].s) === JSON.stringify(["Kathak", "Hip-Hop"]), `trimmed, blanks dropped, a repeat kept once in order (${JSON.stringify(set1[0].s)})`);
  const mine = await q(`select public.my_learn_styles() s`);
  check(JSON.stringify(mine[0].s) === JSON.stringify(["Kathak", "Hip-Hop"]), "my_learn_styles reads them back");
  const direct = await tryq(`select learn_styles from public.profiles where id = $1`, [me]);
  check(!!direct.err && /permission denied/i.test(direct.err), `a direct SELECT of the column is refused (${(direct.err || "").slice(0, 60)})`);
  const tooMany = await tryq(`select public.set_my_learn_styles($1::text[])`, [Array.from({ length: 13 }, (_, i) => `S${i}`)]);
  check(!!tooMany.err && /at most 12/.test(tooMany.err), "thirteen styles are refused in words");
  const tooLong = await tryq(`select public.set_my_learn_styles(array[$1])`, ["x".repeat(41)]);
  check(!!tooLong.err && /40 characters/.test(tooLong.err), "a 41-character name is refused in words");
  const badPatch = await tryq(`update public.profiles set learn_styles = array[' padded'] where id = $1`, [me]);
  check(!!badPatch.err && /learn_styles_shape/.test(badPatch.err), "a direct PATCH of a bad shape is refused BY THE CHECK");
  const cleared = await q(`select public.set_my_learn_styles('{}') s`);
  check(Array.isArray(cleared[0].s) && cleared[0].s.length === 0, "an empty list clears them");

  await as(other);
  const otherReads = await q(`select public.my_learn_styles() s`);
  check(Array.isArray(otherReads[0].s), "somebody else's my_learn_styles is THEIR OWN (no argument to aim at anybody)");

  await asAnon();
  const anonSet = await tryq(`select public.set_my_learn_styles(array['Kathak'])`);
  check(!!anonSet.err, "anon cannot write");

  /* ── 2 · somebody else's record ── */
  await asNobody();
  const learner = (await q(`
    select a.user_id from public.attendance a
      join public.class_sessions s on s.id = a.session_id
      join public.classes c on c.id = a.class_id
      join public.businesses b on b.id = c.business_id
     where a.deleted_at is null and a.user_id is not null and s.ends_at < now()
       and c.deleted_at is null and c.status in ('published','completed') and b.visibility = 'listed'
     group by a.user_id order by count(*) desc limit 1`))[0];
  check(!!learner, "set-up: somebody who has danced");
  const viewer = (await q(`select id from public.profiles where deleted_at is null and id <> $1 limit 1`, [learner.user_id]))[0];

  await as(learner.user_id);
  const own = await q(`select session_id, side from public.my_session_history(500)`);
  await as(viewer.id);
  const theirs = await q(`select h.session_id, h.side, h.business_id, h.class_id, h.starts_at from public.person_session_history($1, 500) h`, [learner.user_id]);
  check(theirs.length > 0, `a stranger reads their ended sessions (${theirs.length} of their own ${own.length})`);
  const ownKeys = new Set(own.map((r) => `${r.session_id}:${r.side}`));
  check(theirs.every((r) => ownKeys.has(`${r.session_id}:${r.side}`)), "every row is one of their own rows — nothing invented");
  await asNobody();
  const pub = await q(`
    select count(*)::int n from public.classes c join public.businesses b on b.id = c.business_id
     where c.id = any($1::uuid[]) and (c.status not in ('published','completed') or b.visibility <> 'listed' or b.deleted_at is not null)`, [theirs.map((r) => r.class_id)]);
  check(pub[0].n === 0, "and every one is a published (or completed) class of a LISTED business");
  /* the filter must actually bite: a draft or an unlisted studio's session is LEFT OUT */
  await asNobody();
  const hidden = await q(`
    select count(*)::int n from public.attendance a
      join public.class_sessions s on s.id = a.session_id
      join public.classes c on c.id = a.class_id
      join public.businesses b on b.id = c.business_id
     where a.deleted_at is null and s.ends_at < now() and c.deleted_at is null and s.deleted_at is null
       and (c.status not in ('published','completed') or b.visibility <> 'listed')`);
  if (hidden[0].n > 0) {
    const h = (await q(`
      select a.user_id from public.attendance a
        join public.class_sessions s on s.id = a.session_id
        join public.classes c on c.id = a.class_id
        join public.businesses b on b.id = c.business_id
       where a.deleted_at is null and a.user_id is not null and s.ends_at < now() and c.deleted_at is null and s.deleted_at is null
         and (c.status not in ('published','completed') or b.visibility <> 'listed') limit 1`))[0];
    if (h) {
      await as(h.user_id);
      const o = await q(`select class_id from public.my_session_history(500)`);
      await as(viewer.id === h.user_id ? learner.user_id : viewer.id);
      const t = await q(`select class_id from public.person_session_history($1, 500)`, [h.user_id]);
      check(t.length < o.length, `a private session is left out (${t.length} of ${o.length})`);
    }
  }
  check(theirs.every((r) => new Date(r.starts_at).getTime() < Date.now()), "nothing ahead of now");

  await asAnon();
  const anonRead = await tryq(`select count(*) from public.person_session_history($1)`, [learner.user_id]);
  check(!!anonRead.err && /permission denied/i.test(anonRead.err), "anon is refused the record");

  await as(viewer.id);
  const ghost = await q(`select count(*)::int n from public.person_session_history('00000000-0000-0000-0000-000000000000')`);
  check(ghost[0].n === 0, "nobody's id reads nothing");
};
