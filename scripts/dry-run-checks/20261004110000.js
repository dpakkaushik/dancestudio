// Checks for 20261004110000_a_membership_lasts_longer_or_until_used, run inside
// the dry run's rolled-back transaction by scripts/dry-run-migration.js.
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
  const refused = async (fn) => {
    await q("savepoint dos_r");
    try {
      await fn();
      await q("release savepoint dos_r");
      return null;
    } catch (e) {
      await q("rollback to savepoint dos_r");
      return e.message;
    }
  };

  /* ── 0 · the catalog ── */
  await asNobody();
  const sm = await q(`select pg_get_function_identity_arguments(oid) args, array(select a::text from unnest(coalesce(proacl,'{}')) a order by 1) acl, pg_get_functiondef(oid) def
                        from pg_proc where pronamespace='public'::regnamespace and proname='save_membership'`);
  check(sm.length === 1, `save_membership exists ONCE (${sm.length})`);
  check(JSON.stringify(sm[0].acl) === JSON.stringify(["authenticated=X/postgres", "postgres=X/postgres", "service_role=X/postgres"]), `save_membership's grants unchanged (${sm[0].acl})`);
  check(/not in \(30, 60, 90, 120, 150\)/.test(sm[0].def), "save_membership admits 120 and 150");
  const cons = await q(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('memberships_validity_days_check','membership_passes_validity_days_check') order by 1`);
  check(cons.length === 2 && cons.every((r) => /120.*150/.test(r.d)), `both CHECKs admit 120 and 150 (${cons.map((r) => r.d).join(" | ")})`);
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const other = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and pg_get_functiondef(oid) ~ 'in \\(30, 60, 90\\)' and prokind = 'f'`);
  check(other.length === 0, `no other live function still lists only 30 · 60 · 90 (${other.map((r) => r.proname).join(", ")})`);

  /* ── the cast ── */
  const s = (await q(`
    select se.id session_id, c.business_id, m.user_id owner_id
      from public.class_sessions se
      join public.classes c on c.id = se.class_id and c.deleted_at is null and c.status = 'published' and c.allows_studio_memberships
      join public.businesses b on b.id = c.business_id and b.deleted_at is null and b.visibility = 'listed' and b.type = 'studio'
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where se.deleted_at is null and se.starts_at > now() + interval '1 day'
     order by se.starts_at limit 1`))[0];
  check(Boolean(s), "set-up: a listed studio with a future class that takes its own passes");
  if (!s) return;
  const buyer = (await q(`select p.id from public.profiles p where p.deleted_at is null and p.role = 'user'
       and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id and m.deleted_at is null)
     limit 1`, [s.business_id]))[0];

  await as(s.owner_id);
  /* 1 · 120 and 150 days are taken */
  const m120 = (await q(`select (public.save_membership(null, $1, 'Dry 120', 'hours', 10, 0, 5, 'live', 120)).id id`, [s.business_id]))[0].id;
  const m150 = (await q(`select (public.save_membership(null, $1, 'Dry 150', 'hours', 10, 0, 5, 'live', 150)).id id`, [s.business_id]))[0].id;
  const v = await q(`select id, validity_days from public.memberships where id = any($1::uuid[])`, [[m120, m150]]);
  check(v.find((r) => r.id === m120)?.validity_days === 120 && v.find((r) => r.id === m150)?.validity_days === 150, "a membership stores 120 and 150 days");
  /* 2 · Unlimited is no validity, on a new one */
  const mUnl = (await q(`select (public.save_membership(null, $1, 'Dry unlimited', 'hours', 10, 0, 5, 'live', null)).id id`, [s.business_id]))[0].id;
  const u = (await q(`select validity_days from public.memberships where id = $1`, [mUnl]))[0];
  check(u.validity_days === null, `an unlimited membership stores no validity (${u.validity_days})`);
  /* 3 · anything else is still refused, in the new words */
  const bad = await refused(() => q(`select public.save_membership(null, $1, 'Dry 45', 'hours', 5, 0, 5, 'live', 45)`, [s.business_id]));
  check(/120 or 150 days, or until it is used up/.test(bad || ""), `45 days is refused in the new words (${bad})`);
  const bad2 = await refused(() => q(`select public.save_membership(null, $1, 'Dry 365', 'hours', 5, 0, 5, 'live', 365)`, [s.business_id]));
  check(Boolean(bad2), `365 days is refused (${bad2})`);

  /* 4 · a 150-day pass expires 150 days after purchase; an unlimited one never */
  await as(buyer.id);
  const p150 = (await q(`select (public.buy_membership($1)).id id`, [m150]))[0].id;
  const pU = (await q(`select (public.buy_membership($1)).id id`, [mUnl]))[0].id;
  await asNobody();
  const r150 = (await q(`select status, validity_days, extract(epoch from (expires_at - bought_at))::int secs from public.membership_passes where id = $1`, [p150]))[0];
  check(r150.status === "active" && r150.validity_days === 150 && r150.secs === 150 * 86400, `a 150-day pass expires exactly 150 days after purchase (${r150.status}, ${r150.validity_days}, ${r150.secs}s)`);
  const rU = (await q(`select status, validity_days, expires_at from public.membership_passes where id = $1`, [pU]))[0];
  check(rU.status === "active" && rU.validity_days === null && rU.expires_at === null, `an unlimited pass is active and never expires (${rU.status}, ${rU.validity_days}, ${rU.expires_at})`);
  /* 5 · and it is offered for a class however far ahead */
  await as(buyer.id);
  const offered = await q(`select * from public.passes_for_session($1)`, [s.session_id]);
  check(offered.some((r) => JSON.stringify(r).includes(pU)), `the unlimited pass is offered for the studio's class (${offered.length} offered)`);
  await asNobody();

  /* 6 · nothing backfilled */
  const kept = await q(`select count(*)::int n from public.memberships where validity_days in (120, 150) and name not like 'Dry %'`);
  check(kept[0].n === 0, `no existing membership changed (${kept[0].n})`);
};
