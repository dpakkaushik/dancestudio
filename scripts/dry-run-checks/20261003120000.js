// Checks for 20261003120000_an_asset_has_a_picture, run inside the dry run's
// rolled-back transaction by scripts/dry-run-migration.js.
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

  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 103, `public policies unchanged (${pol[0].n})`);
  const st = await q(`select count(*)::int n from pg_policies where schemaname='storage' and policyname like '%asset%'`);
  check(st[0].n === 3, `three storage policies for the assets folder (${st[0].n})`);
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);

  await asNobody();
  const two = await q(`
    select b.id, m.user_id owner_id from public.businesses b
      join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
     where b.deleted_at is null and b.type = 'studio' limit 2`);
  const [biz, other] = two;
  const stranger = (await q(`select p.id from public.profiles p where p.deleted_at is null and not exists (select 1 from public.business_members m where m.business_id = $1 and m.user_id = p.id) limit 1`, [biz.id]))[0].id;
  const asset = (await q(`insert into public.assets (business_id, name, category, value_inr, created_by, updated_by) values ($1, 'Dry run speaker', 'Sound & AV', 5000, $2, $2) returning id`, [biz.id, biz.owner_id]))[0].id;

  await as(biz.owner_id);
  await q(`select public.set_asset_photo($1, $2)`, [asset, `assets/${biz.id}/dry-run.jpg`]);
  const back = (await q(`select photo_path from public.assets where id = $1`, [asset]))[0];
  check(back.photo_path === `assets/${biz.id}/dry-run.jpg`, "the owner sets the picture and reads it back");
  check((await refused(`select public.set_asset_photo($1, $2)`, [asset, `assets/${other.id}/x.jpg`], /own assets folder/)) === true, "a path in another business's folder is refused");
  check((await refused(`select public.set_asset_photo($1, $2)`, [asset, `posters/${biz.id}/x.jpg`], /own assets folder/)) === true, "a path outside the assets folder is refused");
  await q(`select public.set_asset_photo($1, null)`, [asset]);
  check((await q(`select photo_path from public.assets where id = $1`, [asset]))[0].photo_path === null, "null takes the picture off");

  await as(stranger);
  check((await refused(`select public.set_asset_photo($1, $2)`, [asset, `assets/${biz.id}/y.jpg`], /only the owner/)) === true, "somebody who does not own the business is refused in words");
  await asNobody();
};
