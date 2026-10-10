// Checks for 20261011100000_dance_styles_without_a_twelve_cap, run inside the
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
  const names = (n) => Array.from({ length: n }, (_, i) => `Style ${i + 1}`);

  /* ── the catalog ── */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  check(anon[0].n === 40, `anon's executable set unchanged (${anon[0].n})`);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 107, `public policies unchanged (${pol[0].n})`);
  const helper = await q(`select count(*)::int n from pg_proc where proname = '_dos_swap'`);
  check(helper[0].n === 0, "the _dos_swap helper is gone again");

  const fns = {
    "public.set_my_learn_styles(text[])": ["> 100", "at most 100 styles to learn"],
    "public.update_my_profile(text,text,smallint,jsonb,text[],text,text,boolean,date)": ["cardinality(v_styles) > 100", "at most 100 styles"],
    "public.update_business_profile(uuid,smallint,text,jsonb,text[],boolean,boolean,boolean,boolean,text,text,text[])": ["> 100", "at most 100 dance styles"],
    "public.set_crew_styles(uuid,text[])": ["> 100", "at most 100 dance styles"],
  };
  for (const [sig, [cap, words]] of Object.entries(fns)) {
    const def = (await q(`select pg_get_functiondef($1::regprocedure) d`, [sig]))[0].d;
    // ⚠ the SOCIAL LINKS cap (12 links) lives in two of these bodies too, and is not this migration's
    const left12 = def.split("\n").filter((l) => /> 12\b|at most (12|twelve)/.test(l) && !/socials|links/.test(l)).map((l) => l.trim()).join(" | ");
    check(def.includes(cap) && def.includes(words) && !left12, `${sig.split("(")[0]} caps at 100, no 12 left${left12 ? " — " + left12.slice(0, 160) : ""}`);
    check((await priv("authenticated", sig)) && !(await priv("anon", sig)), `${sig.split("(")[0]} still signed-in only`);
  }
  const cons = await q(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('profiles_styles_check','crews_styles_check') order by 1`);
  check(cons.length === 2 && cons.every((r) => r.d.includes("<= 100")), `both CHECKs read <= 100 (${cons.map((r) => r.d).join(" · ")})`);
  const helperOk = await q(`select public.are_style_names($1::text[]) a, public.are_style_names($2::text[]) b, public.are_style_names($3::text[]) c`, [names(13), names(100), names(101)]);
  check(helperOk[0].a && helperOk[0].b && !helperOk[0].c, "are_style_names: 13 and 100 pass, 101 does not");

  /* ── a person: to learn, and to dance ── */
  const me = (await q(`select id from public.profiles where deleted_at is null order by created_at limit 1`))[0].id;
  await as(me);
  const twenty = await tryq(`select public.set_my_learn_styles($1::text[]) s`, [names(20)]);
  check(!twenty.err && twenty.rows[0].s.length === 20, `twenty styles to learn are taken (${twenty.err || twenty.rows[0].s.length})`);
  const over = await tryq(`select public.set_my_learn_styles($1::text[])`, [names(101)]);
  check(!!over.err && /at most 100/.test(over.err), `101 to learn refused in words (${(over.err || "").slice(0, 50)})`);
  await asNobody();
  const danced = await tryq(`update public.profiles set styles = $1::text[] where id = $2`, [names(20), me]);
  check(!danced.err, `twenty styles danced are taken by the CHECK (${danced.err || "ok"})`);
  const dancedOver = await tryq(`update public.profiles set styles = $1::text[] where id = $2`, [names(101), me]);
  check(!!dancedOver.err && /profiles_styles_check/.test(dancedOver.err), "101 styles danced refused by the CHECK");

  /* ── a crew, through its leader's own door ── */
  const crew = (await q(`select id, leader_id from public.crews where deleted_at is null order by created_at limit 1`))[0];
  check(!!crew, "set-up: a live crew");
  if (crew) {
    await as(crew.leader_id);
    const c20 = await tryq(`select public.set_crew_styles($1, $2::text[])`, [crew.id, names(20)]);
    check(!c20.err, `a crew takes twenty styles (${c20.err || "ok"})`);
    const c101 = await tryq(`select public.set_crew_styles($1, $2::text[])`, [crew.id, names(101)]);
    check(!!c101.err && /at most 100/.test(c101.err), `a crew is refused 101 in words (${(c101.err || "").slice(0, 50)})`);
  }

  /* ── a studio, through its owner's own door ── */
  await asNobody();
  const biz = (await q(`select b.id, m.user_id from public.businesses b join public.business_members m on m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
                        where b.deleted_at is null and b.type = 'studio' order by b.created_at limit 1`))[0];
  check(!!biz, "set-up: a live studio and its owner");
  if (biz) {
    // the door takes the WHOLE profile, so the studio's own current values go back unchanged beside the styles
    const row = (await q(`select founded_year, phone, coalesce(socials, '[]'::jsonb) socials, enquiry_types, accepts_upi, accepts_cards, accepts_cash, accepts_bank, name, contact_email from public.businesses where id = $1`, [biz.id]))[0];
    await as(biz.user_id);
    const call = (styles) => tryq(
      `select public.update_business_profile($1::uuid, $2::smallint, $3::text, $4::jsonb, $5::text[], $6, $7, $8, $9, $10::text, $11::text, $12::text[])`,
      [biz.id, row.founded_year, row.phone, JSON.stringify(row.socials), row.enquiry_types, row.accepts_upi, row.accepts_cards, row.accepts_cash, row.accepts_bank, row.name, row.contact_email, styles]
    );
    const b20 = await call(names(20));
    const b101 = await call(names(101));
    check(!b20.err, `a studio takes twenty styles through its owner's door (${(b20.err || "ok").slice(0, 70)})`);
    check(!!b101.err && /at most 100/.test(b101.err), `a studio is refused 101 in words (${(b101.err || "").slice(0, 50)})`);
  }
  await asNobody();
};
