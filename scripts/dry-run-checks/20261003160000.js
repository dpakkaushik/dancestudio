// Checks for 20261003160000_a_membership_has_a_validity, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js. Real
// memberships, real passes, real sessions, as the real roles.
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
  /* an expected refusal on its own savepoint, so it cannot abort the rest */
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
  const sm = await q(`select pg_get_function_identity_arguments(oid) args, array(select a::text from unnest(coalesce(proacl,'{}')) a order by 1) acl
                        from pg_proc where pronamespace='public'::regnamespace and proname='save_membership'`);
  check(sm.length === 1 && /p_validity_days integer/.test(sm[0].args), `save_membership exists ONCE, with p_validity_days (${sm.map((r) => r.args).join(" | ")})`);
  check(sm.length === 1 && JSON.stringify(sm[0].acl) === JSON.stringify(["authenticated=X/postgres", "postgres=X/postgres", "service_role=X/postgres"]), `save_membership's grants restated exactly (${sm[0]?.acl})`);
  const tf = await q(`select has_function_privilege('authenticated', 'public.membership_pass_validity()', 'execute') a, has_function_privilege('anon', 'public.membership_pass_validity()', 'execute') b`);
  check(!tf[0].a && !tf[0].b, "the trigger function is executable by no client role");
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const backfill = await q(`select count(*)::int n from public.membership_passes where expires_at is not null or validity_days is not null`);
  check(backfill[0].n === 0, `nothing backfilled — no existing pass gained an expiry (${backfill[0].n})`);

  /* ── the cast: a listed studio with a future published session that takes its passes, its owner, a buyer ── */
  const s = (await q(`
    select se.id session_id, se.starts_at, c.business_id, m.user_id owner_id
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
       and not exists (select 1 from public.class_bookings e where e.session_id = $2 and e.user_id = p.id and e.deleted_at is null)
     limit 1`, [s.business_id, s.session_id]))[0];

  /* 1 · the owner makes a 30-day, hours-only, free membership */
  await as(s.owner_id);
  const free = (await q(`select (public.save_membership(null, $1, 'Dry 30 days', 'hours', 20, 0, 5, 'live', 30)).id id`, [s.business_id]))[0].id;
  const fm = (await q(`select validity_days from public.memberships where id = $1`, [free]))[0];
  check(fm.validity_days === 30, `the membership stores its validity (${fm.validity_days})`);

  /* 2 · a validity outside 30 · 60 · 90 is refused in words */
  const bad = await refused(() => q(`select public.save_membership(null, $1, 'Dry 45', 'hours', 5, 0, 5, 'live', 45)`, [s.business_id]));
  check(/30, 60 or 90 days/.test(bad || ""), `45 days is refused in words (${bad})`);

  /* 3 · a free pass is valid from the moment it is taken, for 30 days */
  await as(buyer.id);
  const fp = (await q(`select (public.buy_membership($1)).id id`, [free]))[0].id;
  await asNobody();
  const fpr = (await q(`select status, validity_days, extract(epoch from (expires_at - bought_at))::int secs from public.membership_passes where id = $1`, [fp]))[0];
  check(fpr.status === "active" && fpr.validity_days === 30 && fpr.secs === 30 * 86400, `a free pass expires exactly 30 days after purchase (${fpr.status}, ${fpr.validity_days}, ${fpr.secs}s)`);

  /* 4 · the class takes it while it is valid on the class's day */
  await as(buyer.id);
  const offered = await q(`select pass_id from public.passes_for_session($1) where pass_id = $2`, [s.session_id, fp]);
  check(offered.length === 1, "the class offers the pass while it is valid on the class's day");

  /* 5 · …and not once it runs out before the class starts — refused in words */
  await asNobody();
  await q(`update public.membership_passes set expires_at = $2::timestamptz - interval '1 hour' where id = $1`, [fp, s.starts_at]);
  await as(buyer.id);
  const notOffered = await q(`select pass_id from public.passes_for_session($1) where pass_id = $2`, [s.session_id, fp]);
  check(notOffered.length === 0, "a pass that runs out before the class starts is not offered");
  const why = await refused(() => q(`select public.book_with_membership($1, $2)`, [s.session_id, fp]));
  check(/runs out before this class/.test(why || ""), `and booking with it is refused in words (${why})`);

  /* 6 · an active, unexpired pass blocks a second; an expired one does not */
  await asNobody();
  await q(`update public.membership_passes set expires_at = now() + interval '5 days' where id = $1`, [fp]);
  await as(buyer.id);
  const w1 = (await q(`select public.why_no_membership($1) w`, [free]))[0].w;
  check(/already hold one/.test(w1 || ""), `a live pass blocks buying another (${w1})`);
  await asNobody();
  await q(`update public.membership_passes set expires_at = now() - interval '1 day' where id = $1`, [fp]);
  await as(buyer.id);
  const w2 = (await q(`select public.why_no_membership($1) w`, [free]))[0].w;
  check(w2 === null, `an EXPIRED pass no longer blocks buying another (${w2})`);

  /* 7 · the seller's "Active" leaves the expired pass out; "Sold" still counts it */
  await as(s.owner_id);
  const bm = (await q(`select sold, active from public.business_memberships($1) where id = $2`, [s.business_id, free]))[0];
  check(bm.sold === 1 && bm.active === 0, `sold 1, active 0 once it has expired (${bm.sold}/${bm.active})`);

  /* 8 · a priced 60-day membership: unpaid holds no date; paid, the date is from the payment */
  const paid = (await q(`select (public.save_membership(null, $1, 'Dry 60 days', 'hours', 10, 999, 5, 'live', 60)).id id`, [s.business_id]))[0].id;
  await as(buyer.id);
  const pp = (await q(`select (public.buy_membership($1)).id id`, [paid]))[0].id;
  await asNobody();
  const ppr = (await q(`select status, validity_days, expires_at from public.membership_passes where id = $1`, [pp]))[0];
  check(ppr.status === "pending_payment" && ppr.validity_days === 60 && ppr.expires_at === null, `an unpaid pass carries the 60 days and no date (${ppr.status}, ${ppr.validity_days}, ${ppr.expires_at})`);

  /* 9 · the resume path re-snapshots: the owner changes it to 90, the buyer presses Buy again */
  await as(s.owner_id);
  await q(`select public.save_membership($2, $1, 'Dry 60 days', 'hours', 10, 999, 5, 'live', 90)`, [s.business_id, paid]);
  await as(buyer.id);
  const pp2 = (await q(`select (public.buy_membership($1)).id id`, [paid]))[0].id;
  await asNobody();
  const pp2r = (await q(`select validity_days from public.membership_passes where id = $1`, [pp2]))[0];
  check(pp2 === pp && pp2r.validity_days === 90, `Buy again resumes the SAME pass at today's 90 days (${pp2 === pp}, ${pp2r.validity_days})`);
  /* the payment lands the way apply_membership_payment writes it */
  await q(`update public.membership_passes set status = 'active', bought_at = now() where id = $1`, [pp]);
  const paidRow = (await q(`select extract(epoch from (expires_at - bought_at))::int secs from public.membership_passes where id = $1`, [pp]))[0];
  check(paidRow.secs === 90 * 86400, `paid, it expires 90 days after the payment (${paidRow.secs}s)`);

  /* 10 · an edit that sends no validity leaves it as it was */
  await as(s.owner_id);
  await q(`select public.save_membership($2, $1, 'Dry 60 days', 'hours', 10, 999, 5, 'live')`, [s.business_id, paid]);
  const kept = (await q(`select validity_days from public.memberships where id = $1`, [paid]))[0];
  check(kept.validity_days === 90, `an edit without a validity keeps it (${kept.validity_days})`);

  /* 11 · a call without the argument — every proof and the seeder — still makes one, and it never expires */
  const old = (await q(`select (public.save_membership(null, $1, 'Dry old style', 'classes', 4, 0, 5, 'live')).id id`, [s.business_id]))[0].id;
  await as(buyer.id);
  const op = (await q(`select (public.buy_membership($1)).id id`, [old]))[0].id;
  await asNobody();
  const opr = (await q(`select status, validity_days, expires_at from public.membership_passes where id = $1`, [op]))[0];
  check(opr.status === "active" && opr.validity_days === null && opr.expires_at === null, `an old-style membership's pass never expires (${opr.status}, ${opr.validity_days}, ${opr.expires_at})`);
};
