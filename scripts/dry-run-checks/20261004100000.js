// Checks for 20261004100000_an_asset_has_a_quantity_and_a_shorter_list, run inside
// the dry run's rolled-back transaction. The real save_asset, as a real owner.
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
  const refused = async (sql, args) => {
    await q("savepoint dos_try");
    try {
      await q(sql, args);
      await q("release savepoint dos_try");
      return null;
    } catch (e) {
      await q("rollback to savepoint dos_try");
      return e.message;
    }
  };

  /* ── the catalog ── */
  await asNobody();
  const fns = await q(`select p.oid::regprocedure::text sig, array(select a::text from unnest(coalesce(p.proacl,'{}')) a order by 1) acl
                         from pg_proc p where pronamespace='public'::regnamespace and proname = 'save_asset'`);
  check(fns.length === 1 && fns[0].sig === "save_asset(uuid,text,text,integer,uuid,integer)", `one save_asset, quantity last (${fns.map((f) => f.sig)})`);
  check(JSON.stringify(fns[0]?.acl) === JSON.stringify(["authenticated=X/postgres", "postgres=X/postgres", "service_role=X/postgres"]), `grants restated exactly — never anon (${fns[0]?.acl})`);
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 106, `public policies unchanged (${pol[0].n})`);
  const col = await q(`select column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='assets' and column_name='quantity'`);
  check(col.length === 1 && col[0].is_nullable === "NO" && col[0].column_default === "1", `assets.quantity not null default 1 (${JSON.stringify(col)})`);

  /* ── every existing row: quantity 1, and a category in the nine ── */
  const nine = ["Speaker", "Mirror", "Flooring", "Lighting", "Props", "Costume", "Furniture", "Electronics", "Other"];
  const rows = await q(`select category, quantity from public.assets`);
  check(rows.length > 0 && rows.every((r) => r.quantity === 1), `every existing row reads quantity 1 (${rows.length} rows)`);
  check(rows.every((r) => nine.includes(r.category)), `every existing row is in the nine (${[...new Set(rows.map((r) => r.category))]})`);
  const props = await q(`select count(*)::int n from public.assets where category = 'Props'`);
  check(props[0].n >= 1, `Props kept its word (${props[0].n})`);
  const other = await q(`select count(*)::int n from public.assets where category = 'Other'`);
  check(other[0].n >= 2, `Equipment became Other (${other[0].n})`);
  const speaker = await q(`select count(*)::int n from public.assets where category = 'Speaker'`);
  check(speaker[0].n >= 1, `Sound & AV became Speaker (${speaker[0].n})`);
  const money = await q(`select coalesce(sum(value_inr),0)::bigint s from public.assets`);
  check(money[0].s !== null, `no value moved (sum ₹${money[0].s})`);

  /* ── the door, as an owner ── */
  const biz = (await q(`select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 1`))[0];
  await as(biz.owner_id);
  const id = (await q(`select public.save_asset($1, 'Dry speakers', 'Speaker', 12000, null, 4) id`, [biz.id]))[0].id;
  const a = (await q(`select quantity, category, value_inr from public.assets where id = $1`, [id]))[0];
  check(a.quantity === 4 && a.category === "Speaker" && a.value_inr === 12000, `a Speaker ×4 for ₹12,000 is saved as given (${JSON.stringify(a)})`);
  const id2 = (await q(`select public.save_asset($1, 'Dry prop', 'Props', 0) id`, [biz.id]))[0].id;
  const b = (await q(`select quantity from public.assets where id = $1`, [id2]))[0];
  check(b.quantity === 1, `a call without a quantity behaves as before — 1 (${b.quantity})`);
  await q(`select public.save_asset($1, 'Dry speakers', 'Speaker', 12000, $2, 6)`, [biz.id, id]);
  const a2 = (await q(`select quantity from public.assets where id = $1`, [id]))[0];
  check(a2.quantity === 6, `an edit changes the quantity (${a2.quantity})`);
  const e0 = await refused(`select public.save_asset($1, 'Dry zero', 'Other', 10, null, 0)`, [biz.id]);
  check(/at least 1/.test(e0 ?? ""), `a quantity of 0 is refused in words (${e0})`);
  const eOld = await refused(`select public.save_asset($1, 'Dry old word', 'Sound & AV', 10)`, [biz.id]);
  check(/assets_category_known/.test(eOld ?? ""), `an old category word is refused by the CHECK (${eOld})`);
  const eDirect = await refused(`update public.assets set quantity = 0 where id = '${id}'`);
  check(eDirect !== null, `a direct write of quantity 0 is refused (${eDirect})`);
  await asNobody();
};
